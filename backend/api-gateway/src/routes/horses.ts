import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../config/logger';
import {
  authenticateToken,
  requireRole,
  createAuthenticatedRoute,
} from '../middleware/auth';
import { validateSchema } from '../middleware/validation';
import { UserRole } from '../types/auth';
// AuthenticatedRequest is now handled by createAuthenticatedRoute wrapper

// Validation schemas
const horseParamsSchema = z.object({
  id: z.string().uuid('Invalid horse ID format'),
});

const identifyHorseSchema = z.object({
  name: z
    .string()
    .min(1, 'Horse name required')
    .max(100, 'Horse name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  metadata: z.record(z.any()).optional().default({}),
});

const timelineQuerySchema = z.object({
  hours: z.coerce.number().min(1).max(168).default(24), // 1 hour to 7 days
  include_pose: z.coerce.boolean().default(false),
});

const router = Router();

// Apply authentication to all horse routes
router.use(authenticateToken);

// GET /api/v1/horses - Get horse registry
router.get(
  '/',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Filter by farm for non-super-admin users
      const farmId =
        req.user.role === UserRole.SUPER_ADMIN
          ? req.query.farm_id
          : req.user.farmId;

      // TODO: Replace with HorseRepository.findAll()
      const mockHorses = [
        {
          id: '123e4567-e89b-12d3-a456-426614174200',
          farm_id: '123e4567-e89b-12d3-a456-426614174010',
          name: 'Thunder',
          description: 'Bay stallion, main breeding horse',
          tracking_id: 'horse_001',
          color_assignment: '#ff6b6b',
          last_seen: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          detection_count: 1247,
          metadata: { breed: 'Thoroughbred', age: 8 },
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174201',
          farm_id: '123e4567-e89b-12d3-a456-426614174010',
          name: 'Luna',
          description: 'White mare, gentle temperament',
          tracking_id: 'horse_002',
          color_assignment: '#4ecdc4',
          last_seen: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          detection_count: 892,
          metadata: { breed: 'Arabian', age: 6 },
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const filteredHorses = farmId
        ? mockHorses.filter(h => h.farm_id === farmId)
        : mockHorses;

      logger.info('Horses listed', {
        userId: req.user.userId,
        farmId,
        count: filteredHorses.length,
      });

      return res.json({
        horses: filteredHorses,
        total: filteredHorses.length,
      });
    } catch (error) {
      logger.error('List horses error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// POST /api/v1/horses/:id/identify - Manual horse identification
router.post(
  '/:id/identify',
  validateSchema(horseParamsSchema, 'params'),
  validateSchema(identifyHorseSchema),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { name, description, metadata } = req.body;

      // TODO: Replace with HorseRepository.identify()
      logger.info('Horse manually identified', {
        userId: req.user.userId,
        horseId: id,
        name,
        farmId: req.user.farmId,
      });

      return res.json({
        message: 'Horse identified successfully',
        horse: {
          id,
          name,
          description,
          metadata,
          identified_by: req.user.userId,
          identified_at: new Date(),
        },
      });
    } catch (error) {
      logger.error('Identify horse error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/horses/:id/timeline - Get horse tracking history
router.get(
  '/:id/timeline',
  validateSchema(horseParamsSchema, 'params'),
  validateSchema(timelineQuerySchema, 'query'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { hours, include_pose } = req.query;

      // TODO: Replace with DetectionRepository.getHorseTimeline()
      const mockTimeline = [
        {
          time: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
          stream_id: '123e4567-e89b-12d3-a456-426614174100',
          bbox: { x: 150, y: 200, width: 120, height: 180 },
          confidence: 0.92,
          gait_type: 'walk',
          velocity: 1.2,
          pose_keypoints: include_pose
            ? [
                { name: 'nose', x: 210, y: 220, confidence: 0.95 },
                { name: 'neck', x: 205, y: 240, confidence: 0.88 },
              ]
            : undefined,
        },
        {
          time: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
          stream_id: '123e4567-e89b-12d3-a456-426614174100',
          bbox: { x: 180, y: 210, width: 118, height: 175 },
          confidence: 0.89,
          gait_type: 'stand',
          velocity: 0.1,
          pose_keypoints: include_pose
            ? [
                { name: 'nose', x: 238, y: 230, confidence: 0.93 },
                { name: 'neck', x: 235, y: 250, confidence: 0.86 },
              ]
            : undefined,
        },
      ];

      logger.info('Horse timeline retrieved', {
        userId: req.user.userId,
        horseId: id,
        hours,
        detectionCount: mockTimeline.length,
      });

      return res.json({
        horseId: id,
        timeRange: `${hours} hours`,
        detections: mockTimeline,
        total: mockTimeline.length,
      });
    } catch (error) {
      logger.error('Get horse timeline error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/horses/:id/streams - Get streams featuring this horse
router.get(
  '/:id/streams',
  validateSchema(horseParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      // TODO: Replace with HorseRepository.getStreamsForHorse()
      // This should query detections/chunks tables to find streams where this horse appears
      const mockStreams = [
        {
          stream_id: 'stream_001',
          stream_name: 'Barn A - Main Camera',
          last_seen: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
          total_detections: 42,
          latest_chunk_id: '123e4567-e89b-12d3-a456-426614174100',
        },
        {
          stream_id: 'stream_003',
          stream_name: 'Barn A - Side Camera',
          last_seen: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          total_detections: 18,
          latest_chunk_id: '123e4567-e89b-12d3-a456-426614174101',
        },
      ];

      logger.info('Horse streams retrieved', {
        userId: req.user.userId,
        horseId: id,
        streamCount: mockStreams.length,
      });

      return res.json({
        horseId: id,
        streams: mockStreams,
        total: mockStreams.length,
      });
    } catch (error) {
      logger.error('Get horse streams error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/horses/:id - Get specific horse details
router.get(
  '/:id',
  validateSchema(horseParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      // TODO: Replace with HorseRepository.findById()
      const mockHorse = {
        id,
        farm_id: '123e4567-e89b-12d3-a456-426614174010',
        name: 'Thunder',
        description: 'Bay stallion, main breeding horse',
        tracking_id: 'horse_001',
        color_assignment: '#ff6b6b',
        last_seen: new Date(Date.now() - 30 * 60 * 1000),
        detection_count: 1247,
        metadata: { breed: 'Thoroughbred', age: 8 },
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Check farm access for non-super-admin users
      if (
        req.user.role !== UserRole.SUPER_ADMIN &&
        req.user.farmId !== mockHorse.farm_id
      ) {
        return res.status(403).json({ error: 'Access denied to this horse' });
      }

      return res.json(mockHorse);
    } catch (error) {
      logger.error('Get horse error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// PATCH /api/v1/horses/:id/official - Mark/unmark horse as official
router.patch(
  '/:id/official',
  validateSchema(horseParamsSchema, 'params'),
  validateSchema(z.object({
    is_official: z.boolean(),
  })),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const { is_official } = req.body;

      // Import HorseRepository
      const { HorseRepository } = await import('@barnhand/database/src/repositories/HorseRepository');
      const horseRepo = new HorseRepository();

      // Verify horse exists
      const horse = await horseRepo.findById(id);

      if (!horse) {
        return res.status(404).json({ error: 'Horse not found' });
      }

      // Check farm access for non-super-admin users
      if (
        req.user.role !== UserRole.SUPER_ADMIN &&
        req.user.farmId !== horse.farm_id
      ) {
        return res.status(403).json({ error: 'Access denied to this horse' });
      }

      // If marking as official, check if farm has reached capacity
      if (is_official && !horse.is_official) {
        const { FarmRepository } = await import('@barnhand/database/src/repositories/FarmRepository');
        const farmRepo = new FarmRepository();
        const farm = await farmRepo.findById(horse.farm_id);

        if (farm && farm.expected_horse_count) {
          const officialCount = await horseRepo.countOfficialHorses(horse.farm_id);

          if (officialCount >= farm.expected_horse_count) {
            return res.status(400).json({
              error: 'Barn capacity reached',
              message: `This barn is configured for ${farm.expected_horse_count} horses and already has ${officialCount} official horses. Increase the expected horse count in barn settings or unmark another horse first.`,
              current_count: officialCount,
              max_count: farm.expected_horse_count,
            });
          }
        }
      }

      // Update official status
      const updated = await horseRepo.update(id, {
        is_official,
        made_official_at: is_official ? new Date() : undefined,
        made_official_by: is_official ? req.user.userId : undefined,
      });

      if (!updated) {
        return res.status(500).json({ error: 'Failed to update horse official status' });
      }

      logger.info('Horse official status updated', {
        userId: req.user.userId,
        horseId: id,
        is_official,
        farmId: horse.farm_id,
      });

      return res.json({
        message: is_official ? 'Horse marked as official' : 'Horse unmarked as official',
        horse: updated,
      });
    } catch (error) {
      logger.error('Update horse official status error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// DELETE /api/v1/horses/:id - Delete a horse
router.delete(
  '/:id',
  validateSchema(horseParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      // Import HorseRepository to delete from database
      const { HorseRepository } = await import('@barnhand/database/src/repositories/HorseRepository');
      const horseRepo = new HorseRepository();

      // Verify horse exists and belongs to user's farm before deleting
      const horse = await horseRepo.findById(id);

      if (!horse) {
        // Horse not found - either doesn't exist or already deleted
        // Make delete idempotent: return success if already deleted
        // Check if horse exists with any status (including 'deleted')
        const anyStatusResult = await horseRepo.findByIdAnyStatus(id);

        if (anyStatusResult && anyStatusResult.status === 'deleted') {
          // Already deleted - return success (idempotent operation)
          return res.status(200).json({
            message: 'Horse already deleted',
            id
          });
        }

        // Horse truly doesn't exist
        return res.status(404).json({ error: 'Horse not found' });
      }

      // Check farm access for non-super-admin users
      if (
        req.user.role !== UserRole.SUPER_ADMIN &&
        req.user.farmId !== horse.farm_id
      ) {
        return res.status(403).json({ error: 'Access denied to this horse' });
      }

      // Get tracking info before deletion (needed for Redis cleanup)
      const trackingInfo = await horseRepo.getTrackingInfo(id);

      // Soft delete the horse from database (sets status='deleted')
      const deleted = await horseRepo.delete(id);

      if (!deleted) {
        return res.status(500).json({ error: 'Failed to delete horse' });
      }

      // Clear horse from Redis cache to prevent re-loading
      // Note: Redis keys use horse.id (UUID), not tracking_id
      try {
        const { createClient } = require('redis');
        const redis = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379' });
        await redis.connect();

        // Clear horse state from Redis using actual horse.id (not tracking_id)
        // Pattern: horse:{stream_id}:{horse_id}:state
        if (trackingInfo && trackingInfo.stream_id) {
          const redisKey = `horse:${trackingInfo.stream_id}:${id}:state`;
          const deleted = await redis.del(redisKey);
          logger.info('Horse cleared from Redis cache', {
            userId: req.user.userId,
            horseId: id,
            streamId: trackingInfo.stream_id,
            redisKey,
            deleted: deleted > 0,
          });
        } else {
          // If stream_id not found, do a wildcard search and delete
          const pattern = `horse:*:${id}:state`;
          const keys = await redis.keys(pattern);
          if (keys.length > 0) {
            await redis.del(...keys);
            logger.info('Horse cleared from Redis cache (wildcard)', {
              userId: req.user.userId,
              horseId: id,
              keysDeleted: keys.length,
            });
          }
        }

        await redis.disconnect();
      } catch (redisError: any) {
        logger.warn('Failed to clear horse from Redis (non-fatal)', {
          error: redisError.message,
          horseId: id,
        });
      }

      logger.info('Horse deleted (soft delete + Redis cleanup)', {
        userId: req.user.userId,
        horseId: id,
        farmId: req.user.farmId,
      });

      return res.json({
        message: 'Horse deleted successfully',
        horseId: id,
      });
    } catch (error) {
      logger.error('Delete horse error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

export default router;
