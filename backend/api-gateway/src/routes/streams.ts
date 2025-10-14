import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../config/logger';
import {
  authenticateToken,
  requireRole,
  requireFarmAccess,
  createAuthenticatedRoute,
} from '../middleware/auth';
import { validateSchema } from '../middleware/validation';
import { streamHorseService } from '../services/streamHorseService';
import { videoChunkService } from '../services/videoChunkService';
import { UserRole } from '../types/auth';
import { emitHorseUpdatedEvent } from '../websocket/events';
// AuthenticatedRequest is now handled by createAuthenticatedRoute wrapper

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
  id: z.string().min(1, 'Stream ID required'),
});

const recordChunkSchema = z.object({
  duration: z.number().min(1).max(30).default(5),
  frame_interval: z.number().min(1).max(300).default(1),
});

const chunkParamsSchema = z.object({
  id: z.string().min(1, 'Stream ID required'),
  chunkId: z.string().min(1, 'Chunk ID required'),
});

const horseParamsSchema = z.object({
  id: z.string().min(1, 'Stream ID required'),
  horseId: z.string().min(1, 'Horse ID required'),
});

const updateHorseSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  breed: z.string().min(1).max(100).optional(),
  age: z.number().min(0).max(50).optional(),
  color: z.string().min(1).max(50).optional(),
  markings: z.string().max(500).optional(),
  gender: z.enum(['mare', 'stallion', 'gelding', 'unknown']).optional(),
  metadata: z.record(z.any()).optional(),
});

const router = Router();

// Apply authentication to all stream routes
router.use(authenticateToken);

// GET /api/v1/streams - List streams
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

      return res.json({
        streams: filteredStreams,
        total: filteredStreams.length,
      });
    } catch (error) {
      logger.error('List streams error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// POST /api/v1/streams - Create stream
router.post(
  '/',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  validateSchema(createStreamSchema),
  requireFarmAccess,
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

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

      return res.status(201).json(newStream);
    } catch (error) {
      logger.error('Create stream error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/streams/:id - Get specific stream
router.get(
  '/:id',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

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

      return res.json(mockStream);
    } catch (error) {
      logger.error('Get stream error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// PUT /api/v1/streams/:id - Update stream
router.put(
  '/:id',
  validateSchema(streamParamsSchema, 'params'),
  validateSchema(updateStreamSchema),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;
      const updateData = req.body;

      // TODO: Replace with StreamRepository.update()
      logger.info('Stream updated', {
        userId: req.user.userId,
        streamId: id,
        changes: Object.keys(updateData),
      });

      return res.json({ message: 'Stream updated successfully' });
    } catch (error) {
      logger.error('Update stream error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// DELETE /api/v1/streams/:id - Delete stream
router.delete(
  '/:id',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      // TODO: Replace with StreamRepository.delete()
      logger.info('Stream deleted', {
        userId: req.user.userId,
        streamId: id,
      });

      return res.json({ message: 'Stream deleted successfully' });
    } catch (error) {
      logger.error('Delete stream error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// POST /api/v1/streams/:id/start - Start stream processing
router.post(
  '/:id/start',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      // TODO: Integrate with Stream Processing Service
      logger.info('Stream start requested', {
        userId: req.user.userId,
        streamId: id,
      });

      return res.json({
        message: 'Stream processing started',
        streamId: id,
        status: 'starting',
      });
    } catch (error) {
      logger.error('Start stream error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// POST /api/v1/streams/:id/stop - Stop stream processing
router.post(
  '/:id/stop',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      // TODO: Integrate with Stream Processing Service
      logger.info('Stream stop requested', {
        userId: req.user.userId,
        streamId: id,
      });

      return res.json({
        message: 'Stream processing stopped',
        streamId: id,
        status: 'stopped',
      });
    } catch (error) {
      logger.error('Stop stream error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/streams/:id/processed - Get processed stream URL
router.get(
  '/:id/processed',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id } = req.params;

      // TODO: Get actual processed stream URL from video service
      const processedUrl = `http://localhost:8003/processed/${id}/playlist.m3u8`;

      return res.json({
        streamId: id,
        processedUrl,
        format: 'hls',
        available: true,
      });
    } catch (error) {
      logger.error('Get processed stream error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// POST /api/v1/streams/:id/record-chunk - Record a video chunk from live stream
router.post(
  '/:id/record-chunk',
  validateSchema(streamParamsSchema, 'params'),
  validateSchema(recordChunkSchema),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { id: streamId } = req.params;
      const { duration = 5, frame_interval = 1 } = req.body;

      logger.info('Recording chunk request received', {
        streamId,
        duration,
        frame_interval,
        body: req.body,
      });

      // Ensure farmId is defined
      if (!req.user.farmId) {
        return res
          .status(403)
          .json({ error: 'Farm ID required for chunk recording' });
      }

      // Get stream source URL - in production this would come from database
      const streamSourceUrl = `http://localhost:8003/stream${streamId.slice(-1)}/playlist.m3u8`;

      // Record video chunk
      const chunk = await videoChunkService.recordChunk(
        streamId,
        req.user.farmId,
        req.user.userId,
        streamSourceUrl,
        duration,
        frame_interval
      );

      logger.info('Video chunk recording initiated', {
        userId: req.user.userId,
        streamId,
        chunkId: chunk.id,
        duration,
      });

      return res.status(202).json({
        message: 'Video chunk recording started',
        chunk: {
          id: chunk.id,
          status: chunk.status,
          duration: chunk.duration,
          filename: chunk.filename,
          start_timestamp: chunk.start_timestamp,
        },
      });
    } catch (error) {
      logger.error('Record chunk error', { error });
      return res.status(500).json({ error: 'Failed to start chunk recording' });
    }
  })
);

// GET /api/v1/streams/:id/chunks - List video chunks for stream
router.get(
  '/:id/chunks',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Ensure farmId is defined
      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { id: streamId } = req.params;

      const chunks = await videoChunkService.getChunksForStream(
        streamId,
        req.user.farmId
      );

      // Sort by creation time, most recent first
      chunks.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

      logger.info('Video chunks listed', {
        userId: req.user.userId,
        streamId,
        count: chunks.length,
      });

      return res.json({
        chunks: chunks.map(chunk => ({
          id: chunk.id,
          filename: chunk.filename,
          duration: chunk.duration,
          status: chunk.status,
          file_size: chunk.file_size,
          start_timestamp: chunk.start_timestamp,
          end_timestamp: chunk.end_timestamp,
          metadata: chunk.metadata,
          created_at: chunk.created_at,
        })),
        total: chunks.length,
      });
    } catch (error) {
      logger.error('List chunks error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/streams/:id/chunks/:chunkId/stream - Get chunk playback URL
router.get(
  '/:id/chunks/:chunkId/stream',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Ensure farmId is defined
      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { chunkId } = req.params;
      const forceRaw = req.query.raw === 'true';

      const streamUrl = await videoChunkService.getChunkStreamUrl(
        chunkId,
        req.user.farmId,
        forceRaw
      );

      if (!streamUrl) {
        return res.status(404).json({ error: 'Chunk not found or not ready' });
      }

      return res.json({
        chunkId,
        streamUrl,
        format: 'mp4',
        available: true,
        isProcessed: !forceRaw && streamUrl.includes('/processed/'),
      });
    } catch (error) {
      logger.error('Get chunk stream error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/streams/:id/chunks/:chunkId/detections - Get chunk detection data
router.get(
  '/:id/chunks/:chunkId/detections',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Ensure farmId is defined
      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { chunkId } = req.params;

      const detections = await videoChunkService.getChunkDetections(
        chunkId,
        req.user.farmId
      );

      if (!detections) {
        return res.status(404).json({
          error: 'Detections not found',
          message:
            'Chunk may not be processed yet or detections file is missing',
        });
      }

      return res.json(detections);
    } catch (error) {
      logger.error('Get chunk detections error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/streams/:id/chunks/:chunkId/status - Get chunk processing status
router.get(
  '/:id/chunks/:chunkId/status',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Ensure farmId is defined
      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { chunkId } = req.params;

      const status = await videoChunkService.getChunkStatus(
        chunkId,
        req.user.farmId
      );

      if (!status) {
        return res.status(404).json({ error: 'Chunk not found' });
      }

      return res.json(status);
    } catch (error) {
      logger.error('Get chunk status error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// DELETE /api/v1/streams/:id/chunks/:chunkId - Delete video chunk
router.delete(
  '/:id/chunks/:chunkId',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Ensure farmId is defined
      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { chunkId } = req.params;

      const deleted = await videoChunkService.deleteChunk(
        chunkId,
        req.user.farmId
      );

      if (!deleted) {
        return res.status(404).json({ error: 'Chunk not found' });
      }

      logger.info('Video chunk deleted', {
        userId: req.user.userId,
        chunkId,
      });

      return res.json({ message: 'Chunk deleted successfully' });
    } catch (error) {
      logger.error('Delete chunk error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// ========================================
// Horse Registry Endpoints
// ========================================

// GET /api/v1/streams/:id/horses - List all horses detected on stream
router.get(
  '/:id/horses',
  validateSchema(streamParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { id: streamId } = req.params;
      const summary = req.query.summary === 'true';

      // Handle summary request (for stream cards)
      if (summary) {
        const summaryData = await streamHorseService.getStreamHorseSummary(
          streamId,
          req.user.farmId
        );

        logger.info('Stream horse summary retrieved', {
          userId: req.user.userId,
          streamId,
          total: summaryData.total,
        });

        return res.json(summaryData);
      }

      // Handle full list request
      const horses = await streamHorseService.getStreamHorses(
        streamId,
        req.user.farmId
      );

      logger.info('Stream horses listed', {
        userId: req.user.userId,
        streamId,
        count: horses.length,
      });

      return res.json({
        horses,
        total: horses.length,
      });
    } catch (error: any) {
      logger.error('Get stream horses error', { error: error.message });

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

// GET /api/v1/streams/:id/horses/:horseId - Get specific horse details
router.get(
  '/:id/horses/:horseId',
  validateSchema(horseParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { horseId } = req.params;

      const horse = await streamHorseService.getHorse(horseId, req.user.farmId);

      if (!horse) {
        return res.status(404).json({ error: 'Horse not found' });
      }

      logger.debug('Horse details retrieved', {
        userId: req.user.userId,
        horseId,
      });

      return res.json(horse);
    } catch (error: any) {
      logger.error('Get horse error', { error: error.message });

      if (error.message.includes('does not belong')) {
        return res.status(403).json({ error: 'Access denied to this horse' });
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

// PUT /api/v1/streams/:id/horses/:horseId - Update horse details
router.put(
  '/:id/horses/:horseId',
  validateSchema(horseParamsSchema, 'params'),
  validateSchema(updateHorseSchema),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { horseId } = req.params;
      const updates = req.body;

      const updatedHorse = await streamHorseService.updateHorse(
        horseId,
        req.user.farmId,
        updates
      );

      logger.info('Horse updated', {
        userId: req.user.userId,
        horseId,
        updates: Object.keys(updates),
      });

      // Emit WebSocket event for real-time UI updates
      if (updatedHorse.stream_id) {
        emitHorseUpdatedEvent(updatedHorse.stream_id, {
          id: updatedHorse.id,
          tracking_id: updatedHorse.tracking_id || '',
          name: updatedHorse.name,
          breed: updatedHorse.breed,
          age: updatedHorse.age,
          color: updatedHorse.color,
          markings: updatedHorse.markings,
          assigned_color: updatedHorse.ui_color || '#06B6D4',
          last_seen: updatedHorse.last_seen?.toISOString() || new Date().toISOString(),
          total_detections: updatedHorse.total_detections,
          thumbnail_url: updatedHorse.thumbnail_url,
        });
      }

      return res.json(updatedHorse);
    } catch (error: any) {
      logger.error('Update horse error', { error: error.message });

      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('does not belong')) {
        return res.status(403).json({ error: 'Access denied to this horse' });
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

// GET /api/v1/streams/:id/horses/:horseId/avatar - Get horse avatar image
router.get(
  '/:id/horses/:horseId/avatar',
  validateSchema(horseParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { horseId } = req.params;

      const avatarBuffer = await streamHorseService.getHorseAvatar(
        horseId,
        req.user.farmId
      );

      if (!avatarBuffer) {
        return res
          .status(404)
          .json({ error: 'Avatar not found for this horse' });
      }

      // Set appropriate headers for JPEG image
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': avatarBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      });

      logger.debug('Horse avatar retrieved', {
        userId: req.user.userId,
        horseId,
        size: avatarBuffer.length,
      });

      return res.send(avatarBuffer);
    } catch (error: any) {
      logger.error('Get horse avatar error', { error: error.message });

      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('does not belong')) {
        return res.status(403).json({ error: 'Access denied to this horse' });
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
