import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../config/logger';
import {
  authenticateToken,
  requireRole,
  requireFarmAccess,
} from '../middleware/auth';
import { validateSchema } from '../middleware/validation';
import { UserRole } from '../types/auth';
import { AuthenticatedRequest } from '../types/requests';

// Validation schemas
const createStreamSchema = z.object({
  farm_id: z.string().uuid('Invalid farm ID format'),
  name: z
    .string()
    .min(1, 'Stream name required')
    .max(100, 'Stream name too long'),
  source_type: z.enum(['local', 'youtube', 'rtsp', 'rtmp']),
  source_url: z.string().url('Invalid source URL'),
  processing_delay: z.number().min(10).max(60).default(20),
  chunk_duration: z.number().min(5).max(30).default(10),
  config: z.record(z.any()).optional().default({}),
});

const updateStreamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  source_url: z.string().url().optional(),
  processing_delay: z.number().min(10).max(60).optional(),
  chunk_duration: z.number().min(5).max(30).optional(),
  config: z.record(z.any()).optional(),
});

const streamParamsSchema = z.object({
  id: z.string().uuid('Invalid stream ID format'),
});

const router = Router();

// Apply authentication to all stream routes
router.use(authenticateToken);

// GET /api/v1/streams - List streams
router.get(
  '/',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      // Filter by farm for non-super-admin users
      const farmId =
        req.user.role === UserRole.SUPER_ADMIN
          ? req.query.farm_id
          : req.user.farmId;

      // TODO: Replace with StreamRepository integration
      const mockStreams = [
        {
          id: '123e4567-e89b-12d3-a456-426614174100',
          farm_id: '123e4567-e89b-12d3-a456-426614174010',
          name: 'Main Pasture Camera',
          source_type: 'local',
          source_url: 'http://localhost:8003/stream1',
          status: 'active',
          processing_delay: 20,
          chunk_duration: 10,
          config: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const filteredStreams = farmId
        ? mockStreams.filter(s => s.farm_id === farmId)
        : mockStreams;

      logger.info('Streams listed', {
        userId: req.user.userId,
        farmId,
        count: filteredStreams.length,
      });

      res.json({
        streams: filteredStreams,
        total: filteredStreams.length,
      });
    } catch (error) {
      logger.error('List streams error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/v1/streams - Create stream
router.post(
  '/',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  validateSchema(createStreamSchema),
  requireFarmAccess,
  async (req: AuthenticatedRequest, res) => {
    try {
      const streamData = req.body;

      // TODO: Replace with StreamRepository.create()
      const newStream = {
        id: `stream_${Date.now()}`,
        ...streamData,
        status: 'inactive',
        created_at: new Date(),
        updated_at: new Date(),
      };

      logger.info('Stream created', {
        userId: req.user.userId,
        streamId: newStream.id,
        farmId: streamData.farm_id,
      });

      res.status(201).json(newStream);
    } catch (error) {
      logger.error('Create stream error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/streams/:id - Get specific stream
router.get(
  '/:id',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // TODO: Replace with StreamRepository.findById()
      const mockStream = {
        id,
        farm_id: '123e4567-e89b-12d3-a456-426614174010',
        name: 'Main Pasture Camera',
        source_type: 'local',
        source_url: 'http://localhost:8003/stream1',
        status: 'active',
        processing_delay: 20,
        chunk_duration: 10,
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Check farm access for non-super-admin users
      if (
        req.user.role !== UserRole.SUPER_ADMIN &&
        req.user.farmId !== mockStream.farm_id
      ) {
        return res.status(403).json({ error: 'Access denied to this stream' });
      }

      res.json(mockStream);
    } catch (error) {
      logger.error('Get stream error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/v1/streams/:id - Update stream
router.put(
  '/:id',
  validateSchema(streamParamsSchema, 'params'),
  validateSchema(updateStreamSchema),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // TODO: Replace with StreamRepository.update()
      logger.info('Stream updated', {
        userId: req.user.userId,
        streamId: id,
        changes: Object.keys(updateData),
      });

      res.json({ message: 'Stream updated successfully' });
    } catch (error) {
      logger.error('Update stream error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/v1/streams/:id - Delete stream
router.delete(
  '/:id',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // TODO: Replace with StreamRepository.delete()
      logger.info('Stream deleted', {
        userId: req.user.userId,
        streamId: id,
      });

      res.json({ message: 'Stream deleted successfully' });
    } catch (error) {
      logger.error('Delete stream error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/v1/streams/:id/start - Start stream processing
router.post(
  '/:id/start',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // TODO: Integrate with Stream Processing Service
      logger.info('Stream start requested', {
        userId: req.user.userId,
        streamId: id,
      });

      res.json({
        message: 'Stream processing started',
        streamId: id,
        status: 'starting',
      });
    } catch (error) {
      logger.error('Start stream error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/v1/streams/:id/stop - Stop stream processing
router.post(
  '/:id/stop',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // TODO: Integrate with Stream Processing Service
      logger.info('Stream stop requested', {
        userId: req.user.userId,
        streamId: id,
      });

      res.json({
        message: 'Stream processing stopped',
        streamId: id,
        status: 'stopped',
      });
    } catch (error) {
      logger.error('Stop stream error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/streams/:id/processed - Get processed stream URL
router.get(
  '/:id/processed',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;

      // TODO: Get actual processed stream URL from video service
      const processedUrl = `http://localhost:8003/processed/${id}/playlist.m3u8`;

      res.json({
        streamId: id,
        processedUrl,
        format: 'hls',
        available: true,
      });
    } catch (error) {
      logger.error('Get processed stream error', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
