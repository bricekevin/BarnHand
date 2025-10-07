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

export default router;
