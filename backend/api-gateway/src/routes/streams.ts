import { Router } from 'express';
import { z } from 'zod';
import { BatchCorrectionRequestSchema } from '@barnhand/shared';

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
import { correctionService } from '../services/correctionService';
import { getAutoScanService, AutoScanConfig } from '../services/autoScanService';
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

// Auto-scan configuration schema
const autoScanConfigSchema = z.object({
  recordingDuration: z.number().min(5).max(30).default(10),
  frameInterval: z.number().min(1).max(30).default(5),
  movementDelay: z.number().min(3).max(15).default(8),
  presetSequence: z.array(z.number().int().min(0).max(9)).optional(),
});

const startAutoScanSchema = z.object({
  config: autoScanConfigSchema.partial().optional(),
  presets: z.array(z.number().int().min(0).max(9)).optional(),
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
  notes: z.string().max(500).optional(), // Stored in metadata.notes
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

      // Fetch streams from database
      try {
        const streamRepository = new (require('@barnhand/database').StreamRepository)();

        let streams;
        if (farmId) {
          streams = await streamRepository.findByFarmId(farmId as string);
        } else {
          streams = await streamRepository.findAll();
        }

        logger.info('Streams listed from database', {
          userId: req.user.userId,
          farmId,
          count: streams.length,
        });

        return res.json({
          streams,
          total: streams.length,
        });
      } catch (dbError) {
        logger.error('Database error listing streams', {
          error: dbError,
          farmId,
        });
        return res.status(500).json({ error: 'Failed to fetch streams from database' });
      }
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

      // Create stream in database using StreamRepository
      try {
        const streamRepository = new (require('@barnhand/database').StreamRepository)();
        const newStream = await streamRepository.create(streamData);

        logger.info('Stream created in database', {
          userId: req.user.userId,
          streamId: newStream.id,
          farmId: streamData.farm_id,
        });

        return res.status(201).json(newStream);
      } catch (dbError) {
        logger.error('Database error creating stream', {
          error: dbError,
          streamData,
        });
        return res.status(500).json({ error: 'Failed to create stream in database' });
      }
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

      // Update stream in database
      try {
        const streamRepository = new (require('@barnhand/database').StreamRepository)();

        // Build update object with only provided fields
        const updates: any = {};
        if (updateData.name !== undefined) updates.name = updateData.name;
        if (updateData.source_url !== undefined) updates.source_url = updateData.source_url;
        if (updateData.source_type !== undefined) updates.source_type = updateData.source_type;
        if (updateData.status !== undefined) updates.status = updateData.status;
        if (updateData.processing_delay !== undefined) updates.processing_delay = updateData.processing_delay;
        if (updateData.chunk_duration !== undefined) updates.chunk_duration = updateData.chunk_duration;
        if (updateData.config !== undefined) updates.config = updateData.config;

        const updatedStream = await streamRepository.update(id, updates);

        if (!updatedStream) {
          return res.status(404).json({ error: 'Stream not found' });
        }

        logger.info('Stream updated successfully', {
          userId: req.user.userId,
          streamId: id,
          changes: Object.keys(updates),
        });

        return res.json({
          message: 'Stream updated successfully',
          stream: updatedStream,
        });
      } catch (dbError) {
        logger.error('Database error updating stream', {
          error: dbError,
          streamId: id,
        });
        return res.status(500).json({ error: 'Failed to update stream in database' });
      }
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

      // Get stream source URL from database
      let streamSourceUrl: string;
      try {
        const streamRepository = new (require('@barnhand/database').StreamRepository)();
        const stream = await streamRepository.findById(streamId);

        if (!stream) {
          return res.status(404).json({ error: 'Stream not found' });
        }

        streamSourceUrl = stream.source_url;
        logger.info('Retrieved stream source URL from database', {
          streamId,
          sourceUrl: streamSourceUrl,
        });
      } catch (dbError) {
        logger.error('Failed to fetch stream from database', {
          error: dbError,
          streamId,
        });
        return res.status(500).json({ error: 'Failed to retrieve stream information' });
      }

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
          thumbnail_url: `/api/v1/streams/${streamId}/chunks/${chunk.id}/thumbnail`,
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

// GET /api/v1/streams/:id/chunks/:chunkId/frames/:framePath - Get processed frame image
router.get(
  '/:id/chunks/:chunkId/frames/*',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { chunkId } = req.params;
      const framePath = req.params[0]; // Get the wildcard path (e.g., "frame_0015.jpg")

      const frameImage = await videoChunkService.getChunkFrame(
        chunkId,
        framePath,
        req.user.farmId
      );

      if (!frameImage) {
        return res.status(404).json({
          error: 'Frame not found',
          message: 'Frame image may not exist or chunk is not processed yet',
        });
      }

      // Set appropriate content type for image
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(frameImage);
    } catch (error) {
      logger.error('Get chunk frame error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// GET /api/v1/streams/:id/chunks/:chunkId/thumbnail - Get chunk thumbnail (first processed frame)
router.get(
  '/:id/chunks/:chunkId/thumbnail',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!req.user.farmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { chunkId } = req.params;

      // Get the first processed frame (frame_0000.jpg)
      const thumbnail = await videoChunkService.getChunkFrame(
        chunkId,
        'frame_0000.jpg',
        req.user.farmId
      );

      if (!thumbnail) {
        // Add CORS headers even for 404 responses
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(404).json({
          error: 'Thumbnail not found',
          message: 'Chunk may not be processed yet',
        });
      }

      // Set appropriate content type for image
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(thumbnail);
    } catch (error) {
      logger.error('Get chunk thumbnail error', { error });
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
        // Super admins can access streams from any farm
        if (req.user.role === UserRole.SUPER_ADMIN) {
          const streamRepository = new (require('@barnhand/database').StreamRepository)();
          const stream = await streamRepository.findById(streamId);
          if (!stream) {
            return res.status(404).json({ error: 'Stream not found' });
          }

          const summaryData = await streamHorseService.getStreamHorseSummary(
            streamId,
            stream.farm_id
          );

          logger.info('Stream horse summary retrieved (super admin)', {
            userId: req.user.userId,
            streamId,
            streamFarmId: stream.farm_id,
            total: summaryData.total,
          });

          return res.json(summaryData);
        } else {
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
      }

      // Handle full list request
      // Super admins can access streams from any farm
      // For other users, verify stream belongs to their farm
      if (req.user.role !== UserRole.SUPER_ADMIN) {
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
      } else {
        // Super admin - fetch stream to get its farm_id, then get horses
        const streamRepository = new (require('@barnhand/database').StreamRepository)();
        const stream = await streamRepository.findById(streamId);
        if (!stream) {
          return res.status(404).json({ error: 'Stream not found' });
        }

        const horses = await streamHorseService.getStreamHorses(
          streamId,
          stream.farm_id
        );

        logger.info('Stream horses listed (super admin)', {
          userId: req.user.userId,
          streamId,
          streamFarmId: stream.farm_id,
          count: horses.length,
        });

        return res.json({
          horses,
          total: horses.length,
        });
      }
    } catch (error: any) {
      logger.error('Get stream horses error', {
        error: error.message,
        stack: error.stack,
        errorType: error.constructor.name
      });

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

      // SUPER_ADMIN can update any horse (pass null for farm check)
      // FARM_ADMIN can only update horses from their own farm
      const currentUserFarmId = req.user.role === UserRole.SUPER_ADMIN
        ? null
        : req.user.farmId;

      // Farm admins must have a farmId
      if (req.user.role === UserRole.FARM_ADMIN && !currentUserFarmId) {
        return res.status(403).json({ error: 'Farm ID required' });
      }

      const { horseId } = req.params;
      const { notes, ...updates } = req.body;

      // If notes are provided, merge them into metadata
      if (notes !== undefined) {
        updates.metadata = {
          ...(updates.metadata || {}),
          notes,
        };
      }

      const updatedHorse = await streamHorseService.updateHorse(
        horseId,
        currentUserFarmId,
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
      logger.error('Update horse error', {
        error: error.message,
        stack: error.stack,
        horseId: req.params.horseId,
        updates: req.body
      });

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

// ===== Phase 4: Detection Correction Endpoints =====

/**
 * POST /api/v1/streams/:id/chunks/:chunkId/corrections
 * Submit batch of corrections for a video chunk
 * Returns 202 Accepted - processing happens asynchronously
 */
router.post(
  '/:id/chunks/:chunkId/corrections',
  validateSchema(chunkParamsSchema, 'params'),
  validateSchema(BatchCorrectionRequestSchema, 'body'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    const { id: streamId, chunkId } = req.params;
    const { corrections } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    logger.info('Received correction submission', {
      streamId,
      chunkId,
      userId: req.user.userId,
      correctionsCount: corrections.length,
    });

    try {
      // Submit corrections to service
      const result = await correctionService.submitCorrections(
        streamId,
        chunkId,
        corrections,
        req.user.userId
      );

      logger.info('Corrections submitted successfully', {
        streamId,
        chunkId,
        correctionsCount: corrections.length,
      });

      // Return 202 Accepted (async processing)
      return res.status(202).json(result);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Failed to submit corrections', {
          error: error.message,
          stack: error.stack,
          streamId,
          chunkId,
        });

        // Check for validation errors
        if (error.message.includes('Invalid correction')) {
          return res.status(400).json({
            error: 'Validation failed',
            message: error.message,
          });
        }

        // Check for ML service errors
        if (error.message.includes('ML service')) {
          return res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'ML processing service is currently unavailable. Please try again later.',
          });
        }

        return res.status(500).json({
          error: 'Failed to submit corrections',
          message: error.message,
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
      });
    }
  })
);

/**
 * GET /api/v1/streams/:id/chunks/:chunkId/corrections/status
 * Get re-processing status for a chunk
 */
router.get(
  '/:id/chunks/:chunkId/corrections/status',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    const { chunkId } = req.params;

    try {
      const status = await correctionService.getReprocessingStatus(chunkId);

      return res.status(200).json(status);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Failed to get reprocessing status', {
          error: error.message,
          chunkId,
        });

        return res.status(500).json({
          error: 'Failed to get status',
          message: error.message,
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
      });
    }
  })
);

/**
 * GET /api/v1/streams/:id/chunks/:chunkId/corrections
 * Get correction history for a chunk
 */
router.get(
  '/:id/chunks/:chunkId/corrections',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    const { chunkId } = req.params;

    try {
      const corrections = await correctionService.getChunkCorrections(chunkId);

      return res.status(200).json({
        chunk_id: chunkId,
        corrections,
        total: corrections.length,
      });
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Failed to get correction history', {
          error: error.message,
          chunkId,
        });

        return res.status(500).json({
          error: 'Failed to get corrections',
          message: error.message,
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
      });
    }
  })
);

/**
 * DELETE /api/v1/streams/:id/chunks/:chunkId/corrections
 * Cancel all pending corrections for a chunk
 */
router.delete(
  '/:id/chunks/:chunkId/corrections',
  validateSchema(chunkParamsSchema, 'params'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    const { chunkId } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    logger.info('Canceling pending corrections', {
      chunkId,
      userId: req.user.userId,
    });

    try {
      const deletedCount = await correctionService.cancelPendingCorrections(chunkId);

      logger.info('Pending corrections canceled', {
        chunkId,
        deletedCount,
      });

      return res.status(200).json({
        message: 'Pending corrections canceled',
        deleted_count: deletedCount,
      });
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Failed to cancel corrections', {
          error: error.message,
          chunkId,
        });

        return res.status(500).json({
          error: 'Failed to cancel corrections',
          message: error.message,
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
      });
    }
  })
);

// GET /api/v1/streams/:id/ptz/snapshot - Proxy camera snapshot for PTZ control
// This proxies the camera's snapshot to avoid CORS issues in the browser
router.get(
  '/:id/ptz/snapshot',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    const { id: streamId } = req.params;

    try {
      // Get stream from database to find source URL
      const StreamRepository = require('@barnhand/database').StreamRepository;
      const streamRepo = new StreamRepository();
      const stream = await streamRepo.findById(streamId);

      if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      // Parse the RTSP URL to get camera hostname
      const sourceUrl = stream.source_url;
      if (!sourceUrl || !sourceUrl.startsWith('rtsp://')) {
        return res.status(400).json({ error: 'Stream is not an RTSP source' });
      }

      const url = new URL(sourceUrl);
      const hostname = url.hostname;

      // Get PTZ credentials - prefer from stream config, fallback to query params
      const streamConfig = stream.config || {};
      const ptzCredentials = streamConfig.ptzCredentials || {};
      const ptzUser = ptzCredentials.username || (req.query.usr as string) || '';
      const ptzPwd = ptzCredentials.password || (req.query.pwd as string) || '';

      // Build snapshot URL for HiPro camera
      const snapshotUrl = `http://${hostname}:8080/web/tmpfs/auto.jpg?usr=${encodeURIComponent(ptzUser)}&pwd=${encodeURIComponent(ptzPwd)}&t=${Date.now()}`;

      logger.debug('Proxying PTZ snapshot', { streamId, hostname });

      // Fetch the snapshot from the camera
      const response = await fetch(snapshotUrl);

      if (!response.ok) {
        logger.warn('PTZ snapshot fetch failed', {
          streamId,
          status: response.status,
        });
        return res.status(response.status).json({
          error: 'Failed to fetch snapshot from camera',
          status: response.status,
        });
      }

      // Get the image data
      const imageBuffer = await response.arrayBuffer();

      // Set appropriate headers
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Send the image
      return res.send(Buffer.from(imageBuffer));
    } catch (error) {
      logger.error('PTZ snapshot proxy error', {
        streamId,
        error: error instanceof Error ? error.message : error,
      });

      return res.status(500).json({
        error: 'Failed to proxy snapshot',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// ==================== AUTO-SCAN ENDPOINTS ====================

// POST /api/v1/streams/:id/ptz/auto-scan/start - Start auto-scan
router.post(
  '/:id/ptz/auto-scan/start',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  validateSchema({ body: startAutoScanSchema }),
  createAuthenticatedRoute(async (req, res) => {
    const { id: streamId } = req.params;
    const { config, presets: requestedPresets } = req.body;

    try {
      // Get stream from database
      const StreamRepository = require('@barnhand/database').StreamRepository;
      const streamRepo = new StreamRepository();
      const stream = await streamRepo.findById(streamId);

      if (!stream) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      const streamConfig = stream.config || {};

      // Get PTZ credentials from stream config
      const ptzCredentials = streamConfig.ptzCredentials;
      if (!ptzCredentials?.username || !ptzCredentials?.password) {
        return res.status(400).json({
          error: 'PTZ credentials not configured',
          message: 'Please configure PTZ credentials in Stream Settings before using auto-scan',
        });
      }

      // Get saved presets from stream config
      const savedPresets = streamConfig.ptzPresets || {};
      if (Object.keys(savedPresets).length === 0) {
        return res.status(400).json({
          error: 'No presets saved',
          message: 'Please save at least one PTZ preset before using auto-scan',
        });
      }

      // Convert presets to array format
      let presets = Object.entries(savedPresets).map(([num, preset]: [string, any]) => ({
        number: parseInt(num, 10),
        name: preset.name,
      }));

      // Filter by requested presets if provided
      if (requestedPresets && requestedPresets.length > 0) {
        presets = presets.filter(p => requestedPresets.includes(p.number));
        if (presets.length === 0) {
          return res.status(400).json({
            error: 'Invalid preset selection',
            message: 'None of the requested presets have been saved',
          });
        }
      }

      // Parse hostname from source URL
      const sourceUrl = stream.source_url;
      if (!sourceUrl || !sourceUrl.startsWith('rtsp://')) {
        return res.status(400).json({ error: 'Stream is not an RTSP source' });
      }
      const url = new URL(sourceUrl);
      const cameraHostname = url.hostname;

      // Get auto-scan service
      const autoScanService = getAutoScanService(videoChunkService);

      // Start the scan
      const scanState = await autoScanService.startScan(
        streamId,
        presets,
        ptzCredentials,
        cameraHostname,
        config as Partial<AutoScanConfig>,
        stream.farm_id,
        req.user!.id
      );

      logger.info('Auto-scan started', {
        streamId,
        scanId: scanState.scanId,
        totalPresets: presets.length,
      });

      return res.status(202).json({
        message: 'Auto-scan started',
        scanId: scanState.scanId,
        statusUrl: `/api/v1/streams/${streamId}/ptz/auto-scan/status`,
        totalPresets: presets.length,
        presets: presets.map(p => ({ number: p.number, name: p.name })),
      });
    } catch (error) {
      logger.error('Failed to start auto-scan', {
        streamId,
        error: error instanceof Error ? error.message : error,
      });

      if ((error as Error).message?.includes('already in progress')) {
        return res.status(409).json({
          error: 'Scan already in progress',
          message: 'Please wait for the current scan to complete or stop it first',
        });
      }

      return res.status(500).json({
        error: 'Failed to start auto-scan',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// GET /api/v1/streams/:id/ptz/auto-scan/status - Get auto-scan status
router.get(
  '/:id/ptz/auto-scan/status',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    const { id: streamId } = req.params;

    try {
      const autoScanService = getAutoScanService(videoChunkService);
      const state = autoScanService.getScanStatus(streamId);

      if (!state) {
        return res.json({
          isRunning: false,
          state: null,
          lastResult: null,
        });
      }

      const isRunning = state.phase === 'detection' || state.phase === 'recording';

      return res.json({
        isRunning,
        state,
        lastResult: !isRunning
          ? {
              scanId: state.scanId,
              totalScanned: state.results.length,
              withHorses: state.locationsWithHorses.length,
              chunksRecorded: state.results.filter(r => r.chunkId).length,
              status: state.phase,
              presetResults: state.results,
            }
          : null,
      });
    } catch (error) {
      logger.error('Failed to get auto-scan status', {
        streamId,
        error: error instanceof Error ? error.message : error,
      });

      return res.status(500).json({
        error: 'Failed to get auto-scan status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// POST /api/v1/streams/:id/ptz/auto-scan/stop - Stop auto-scan
router.post(
  '/:id/ptz/auto-scan/stop',
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    const { id: streamId } = req.params;

    try {
      const autoScanService = getAutoScanService(videoChunkService);
      const state = await autoScanService.stopScan(streamId);

      if (!state) {
        return res.status(404).json({
          error: 'No active scan',
          message: 'No auto-scan is currently running for this stream',
        });
      }

      logger.info('Auto-scan stopped', {
        streamId,
        scanId: state.scanId,
        presetsScanned: state.results.length,
      });

      return res.json({
        message: 'Auto-scan stopped',
        scanId: state.scanId,
        presetsScanned: state.results.length,
        results: state.results,
      });
    } catch (error) {
      logger.error('Failed to stop auto-scan', {
        streamId,
        error: error instanceof Error ? error.message : error,
      });

      return res.status(500).json({
        error: 'Failed to stop auto-scan',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

export default router;
