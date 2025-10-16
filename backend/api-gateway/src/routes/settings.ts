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

// Validation schemas
const reassignStreamSchema = z.object({
  farmId: z.string().uuid('Invalid farm ID format'),
});

const streamParamsSchema = z.object({
  streamId: z.string().min(1, 'Stream ID required'),
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

      if (!req.user.farmId) {
        return res
          .status(403)
          .json({ error: 'Farm ID required for stream reassignment' });
      }

      const { streamId } = req.params;
      const { farmId: newFarmId } = req.body;

      const result = await settingsService.reassignStreamToFarm(
        streamId,
        newFarmId,
        req.user.farmId
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

export default router;
