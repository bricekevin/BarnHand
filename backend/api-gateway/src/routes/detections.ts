import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../config/logger';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateSchema } from '../middleware/validation';
import { UserRole } from '../types/auth';
import { AuthenticatedRequest } from '../types/requests';

// Validation schemas
const detectionQuerySchema = z.object({
  stream_id: z.string().uuid().optional(),
  horse_id: z.string().uuid().optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
  include_pose: z.coerce.boolean().default(false),
  confidence_threshold: z.coerce.number().min(0).max(1).default(0.5),
});

const chunkParamsSchema = z.object({
  id: z.string().uuid('Invalid chunk ID format'),
});

const router = Router();

// Apply authentication to all detection routes
router.use(authenticateToken);

// GET /api/v1/detections - Query detections with filters
router.get(
  '/',
  validateSchema(detectionQuerySchema, 'query'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        stream_id,
        horse_id,
        start_time,
        end_time,
        limit,
        offset,
        include_pose,
        confidence_threshold,
      } = req.query;

      // TODO: Replace with DetectionRepository.findDetections()
      const mockDetections = [
        {
          time: new Date(),
          stream_id: stream_id || '123e4567-e89b-12d3-a456-426614174100',
          chunk_id: '123e4567-e89b-12d3-a456-426614174300',
          horse_id: horse_id || '123e4567-e89b-12d3-a456-426614174200',
          tracking_id: 'horse_001',
          bbox: { x: 150, y: 200, width: 120, height: 180 },
          confidence: 0.92,
          gait_type: 'walk',
          velocity: 1.2,
          acceleration: 0.1,
          processing_time_ms: 45,
          model_version: 'yolo11m_v1.0',
          pose_keypoints: include_pose
            ? [
                { name: 'nose', x: 210, y: 220, confidence: 0.95 },
                { name: 'neck', x: 205, y: 240, confidence: 0.88 },
                { name: 'shoulder', x: 190, y: 260, confidence: 0.85 },
              ]
            : undefined,
          pose_angles: include_pose
            ? {
                neck_angle: 45.2,
                back_angle: 12.8,
                leg_angles: [110, 115, 108, 112],
              }
            : undefined,
          metadata: { quality_score: 0.87 },
        },
      ];

      const filteredDetections = mockDetections.filter(
        d => d.confidence >= confidence_threshold
      );

      logger.info('Detections queried', {
        userId: req.user.userId,
        filters: { stream_id, horse_id, start_time, end_time },
        count: filteredDetections.length,
      });

      res.json({
        detections: filteredDetections.slice(offset, offset + limit),
        total: filteredDetections.length,
        limit,
        offset,
        filters: {
          stream_id,
          horse_id,
          start_time,
          end_time,
          confidence_threshold,
        },
      });
    } catch (error) {
      logger.error('Query detections error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/chunks/:id/status - Get chunk processing status
router.get(
  '/chunks/:id/status',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // TODO: Replace with VideoChunkRepository.findById()
      const mockChunkStatus = {
        id,
        stream_id: '123e4567-e89b-12d3-a456-426614174100',
        start_time: new Date(Date.now() - 2 * 60 * 1000),
        end_time: new Date(Date.now() - 110 * 1000),
        duration: 10.0,
        status: 'completed',
        processing_time_ms: 1247,
        detections_count: 3,
        horses_detected: ['123e4567-e89b-12d3-a456-426614174200'],
        output_url: `http://localhost:8003/processed/${id}.m3u8`,
        overlay_url: `http://localhost:8003/overlays/${id}.json`,
        created_at: new Date(Date.now() - 2 * 60 * 1000),
        updated_at: new Date(Date.now() - 1 * 60 * 1000),
      };

      logger.info('Chunk status retrieved', {
        userId: req.user.userId,
        chunkId: id,
        status: mockChunkStatus.status,
      });

      res.json(mockChunkStatus);
    } catch (error) {
      logger.error('Get chunk status error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
