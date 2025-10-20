import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../config/logger';
import {
  authenticateToken,
  requireRole,
  createAuthenticatedRoute,
} from '../middleware/auth';
import { validateSchema } from '../middleware/validation';
import { settingsService } from '../services/settingsService';
import { UserRole } from '../types/auth';
import { FarmRepository } from '../../../database/src/repositories/FarmRepository';

const farmRepository = new FarmRepository();

// Validation schemas
const reassignStreamSchema = z.object({
  farmId: z.string().uuid('Invalid farm ID format'),
});

const streamParamsSchema = z.object({
  streamId: z.string().min(1, 'Stream ID required'),
});

const createFarmSchema = z.object({
  name: z.string().min(1, 'Farm name required').max(100, 'Farm name too long'),
  location: z.any().optional(),
  timezone: z.string().optional(),
  expected_horse_count: z.number().int().min(0).max(999).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateFarmSchema = z.object({
  name: z.string().min(1, 'Farm name required').max(100, 'Farm name too long').optional(),
  location: z.any().optional(),
  timezone: z.string().optional(),
  expected_horse_count: z.number().int().min(0).max(999).optional(),
  metadata: z.record(z.any()).optional(),
});

const farmParamsSchema = z.object({
  farmId: z.string().uuid('Invalid farm ID format'),
});

const router = Router();

// Apply authentication to all settings routes
router.use(authenticateToken);

// GET /api/v1/settings/stream-management - Get stream management overview
router.get(
  '/stream-management',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Super admins can see all farms, farm admins only see their own
      const farmId =
        req.user.role === UserRole.SUPER_ADMIN ? undefined : req.user.farmId;

      const overview = await settingsService.getStreamManagementOverview(
        farmId
      );

      logger.info('Stream management overview retrieved', {
        userId: req.user.userId,
        farmCount: overview.farms.length,
      });

      return res.json(overview);
    } catch (error) {
      logger.error('Get stream management overview error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// PATCH /api/v1/settings/streams/:streamId/farm - Reassign stream to different farm
router.patch(
  '/streams/:streamId/farm',
  validateSchema(streamParamsSchema, 'params'),
  validateSchema(reassignStreamSchema),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // SUPER_ADMIN can reassign any stream (pass null for farm check)
      // FARM_ADMIN can only reassign streams from their own farm
      const currentUserFarmId = req.user.role === UserRole.SUPER_ADMIN
        ? null
        : req.user.farmId;

      // Farm admins must have a farmId
      if (req.user.role === UserRole.FARM_ADMIN && !currentUserFarmId) {
        return res
          .status(403)
          .json({ error: 'Farm ID required for stream reassignment' });
      }

      const { streamId } = req.params;
      const { farmId: newFarmId } = req.body;

      const result = await settingsService.reassignStreamToFarm(
        streamId,
        newFarmId,
        currentUserFarmId
      );

      logger.info('Stream reassigned to new farm', {
        userId: req.user.userId,
        streamId,
        newFarmId,
        horsesReassigned: result.horsesReassigned,
      });

      return res.json(result);
    } catch (error: any) {
      logger.error('Reassign stream error', { error: error.message });

      // Handle specific error cases
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('does not belong')) {
        return res.status(403).json({ error: 'Access denied to this stream' });
      }
      if (error.message.includes('Database not available')) {
        return res
          .status(503)
          .json({ error: 'Service temporarily unavailable' });
      }

      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// POST /api/v1/settings/farms - Create a new farm/barn
router.post(
  '/farms',
  validateSchema(createFarmSchema),
  requireRole([UserRole.SUPER_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { name, location, timezone, expected_horse_count, metadata } = req.body;

      const newFarm = await farmRepository.create({
        name,
        owner_id: req.user.userId || null, // Use the authenticated user as owner (or null if no user)
        location,
        timezone,
        expected_horse_count,
        metadata,
      });

      logger.info('Farm created', {
        userId: req.user.userId,
        farmId: newFarm.id,
        farmName: newFarm.name,
      });

      return res.status(201).json(newFarm);
    } catch (error: any) {
      logger.error('Create farm error', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// PUT /api/v1/settings/farms/:farmId - Update a farm/barn
router.put(
  '/farms/:farmId',
  validateSchema(farmParamsSchema, 'params'),
  validateSchema(updateFarmSchema),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { farmId } = req.params;

      // Farm admins can only update their own farm
      if (req.user.role === UserRole.FARM_ADMIN && req.user.farmId !== farmId) {
        return res.status(403).json({ error: 'Access denied to this farm' });
      }

      const updatedFarm = await farmRepository.update(farmId, req.body);

      if (!updatedFarm) {
        return res.status(404).json({ error: 'Farm not found' });
      }

      logger.info('Farm updated', {
        userId: req.user.userId,
        farmId,
        updates: Object.keys(req.body),
      });

      return res.json(updatedFarm);
    } catch (error: any) {
      logger.error('Update farm error', { error: error.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// DELETE /api/v1/settings/farms/:farmId - Delete a farm/barn
router.delete(
  '/farms/:farmId',
  validateSchema(farmParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { farmId } = req.params;

      // Check if farm exists first
      const farm = await farmRepository.findById(farmId);
      if (!farm) {
        return res.status(404).json({ error: 'Farm not found' });
      }

      // TODO: Add check for related streams and horses before deletion
      // For now, this will fail at DB level if there are foreign key constraints

      const deleted = await farmRepository.delete(farmId);

      if (!deleted) {
        return res.status(404).json({ error: 'Farm not found' });
      }

      logger.info('Farm deleted', {
        userId: req.user.userId,
        farmId,
        farmName: farm.name,
      });

      return res.json({ success: true, message: 'Farm deleted successfully' });
    } catch (error: any) {
      logger.error('Delete farm error', { error: error.message });

      // Handle foreign key constraint violations
      if (error.message?.includes('foreign key') || error.code === '23503') {
        return res.status(400).json({
          error: 'Cannot delete farm with associated streams or horses. Please reassign or delete them first.',
        });
      }

      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

export default router;
