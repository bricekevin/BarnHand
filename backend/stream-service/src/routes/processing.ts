import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { StreamProcessor } from '../services/StreamProcessor';

// Validation schemas
const startProcessingSchema = z.object({
  streamId: z.string().min(1, 'Stream ID required'),
  streamUrl: z.string().url('Valid HLS playlist URL required'),
  name: z.string().min(1, 'Stream name required').optional()
});

const stopProcessingSchema = z.object({
  streamId: z.string().min(1, 'Stream ID required')
});

export function createProcessingRoutes(streamProcessor: StreamProcessor): Router {
  const router = Router();

  // POST /processing/start - Start processing a stream
  router.post('/start', async (req: Request, res: Response) => {
    try {
      const validation = startProcessingSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: validation.error.errors
        });
      }

      const { streamId, streamUrl, name } = validation.data;

      const streamSource = {
        id: streamId,
        url: streamUrl,
        name: name || `Stream ${streamId}`,
        active: true
      };

      await streamProcessor.startStreamProcessing(streamSource);

      logger.info('Stream processing started via API', {
        streamId,
        streamUrl,
        name
      });

      res.json({
        message: 'Stream processing started successfully',
        stream: {
          id: streamId,
          name: streamSource.name,
          url: streamUrl,
          status: 'active'
        },
        processing: {
          chunkDuration: process.env.CHUNK_DURATION || 10,
          overlap: process.env.CHUNK_OVERLAP || 1,
          delay: process.env.PROCESSING_DELAY || 20
        }
      });
    } catch (error) {
      logger.error('Failed to start stream processing', { error });
      
      if (error instanceof Error && error.message.includes('already being processed')) {
        return res.status(409).json({ 
          error: 'Stream is already being processed',
          streamId: req.body.streamId 
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to start stream processing',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /processing/stop - Stop processing a stream  
  router.post('/stop', async (req: Request, res: Response) => {
    try {
      const validation = stopProcessingSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: validation.error.errors
        });
      }

      const { streamId } = validation.data;
      
      const success = await streamProcessor.stopStreamProcessing(streamId);
      
      if (!success) {
        return res.status(404).json({ 
          error: 'Stream not found or not being processed',
          streamId 
        });
      }

      logger.info('Stream processing stopped via API', { streamId });

      res.json({
        message: 'Stream processing stopped successfully',
        streamId
      });
    } catch (error) {
      logger.error('Failed to stop stream processing', { error });
      res.status(500).json({ error: 'Failed to stop stream processing' });
    }
  });

  // GET /processing/status - Get processing status for all streams
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const activeStreams = streamProcessor.getActiveStreams();
      const metrics = streamProcessor.getMetrics();
      const queueStatus = await streamProcessor.processingQueue?.getQueueStatus();

      res.json({
        activeStreams: activeStreams.map(stream => ({
          id: stream.id,
          name: stream.name,
          url: stream.url,
          status: streamProcessor.getStreamStatus(stream.id)
        })),
        metrics: {
          ...metrics,
          queueStatus
        },
        configuration: {
          chunkDuration: process.env.CHUNK_DURATION || 10,
          chunkOverlap: process.env.CHUNK_OVERLAP || 1,
          processingDelay: process.env.PROCESSING_DELAY || 20,
          maxQueueSize: process.env.MAX_QUEUE_SIZE || 1000,
          concurrency: process.env.QUEUE_CONCURRENCY || 3
        }
      });
    } catch (error) {
      logger.error('Failed to get processing status', { error });
      res.status(500).json({ error: 'Failed to get processing status' });
    }
  });

  // GET /processing/status/:streamId - Get status for specific stream
  router.get('/status/:streamId', async (req: Request, res: Response) => {
    try {
      const { streamId } = req.params;
      const status = streamProcessor.getStreamStatus(streamId);
      
      if (!status.isActive) {
        return res.status(404).json({ 
          error: 'Stream not found or not being processed',
          streamId 
        });
      }

      res.json({
        streamId,
        ...status,
        configuration: {
          chunkDuration: process.env.CHUNK_DURATION || 10,
          chunkOverlap: process.env.CHUNK_OVERLAP || 1,
          processingDelay: process.env.PROCESSING_DELAY || 20
        }
      });
    } catch (error) {
      logger.error('Failed to get stream status', { error });
      res.status(500).json({ error: 'Failed to get stream status' });
    }
  });

  // GET /processing/queue - Get detailed queue information
  router.get('/queue', async (req: Request, res: Response) => {
    try {
      const queueStatus = await streamProcessor.processingQueue?.getQueueStatus();
      const allJobs = streamProcessor.processingQueue?.getAllJobs() || [];
      
      // Group jobs by status
      const jobsByStatus = {
        waiting: allJobs.filter(j => j.status === 'waiting'),
        processing: allJobs.filter(j => j.status === 'processing'),
        completed: allJobs.filter(j => j.status === 'completed'),
        failed: allJobs.filter(j => j.status === 'failed')
      };

      res.json({
        queue: queueStatus,
        jobs: {
          total: allJobs.length,
          byStatus: {
            waiting: jobsByStatus.waiting.length,
            processing: jobsByStatus.processing.length,
            completed: jobsByStatus.completed.length,
            failed: jobsByStatus.failed.length
          },
          recentJobs: allJobs
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 20)
            .map(job => ({
              id: job.id,
              chunkId: job.chunkInfo.id,
              streamId: job.chunkInfo.streamId,
              status: job.status,
              attempts: job.attempts,
              createdAt: job.createdAt,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
              error: job.error
            }))
        }
      });
    } catch (error) {
      logger.error('Failed to get queue information', { error });
      res.status(500).json({ error: 'Failed to get queue information' });
    }
  });

  // POST /processing/cleanup - Manual cleanup of old chunks
  router.post('/cleanup', async (req: Request, res: Response) => {
    try {
      logger.info('Manual cleanup initiated');
      const deletedCount = await streamProcessor.chunkExtractor?.cleanupOldChunks() || 0;
      
      res.json({
        message: 'Cleanup completed successfully',
        deletedChunks: deletedCount,
        retentionHours: process.env.CHUNK_RETENTION_HOURS || 24
      });
    } catch (error) {
      logger.error('Manual cleanup failed', { error });
      res.status(500).json({ error: 'Cleanup failed' });
    }
  });

  return router;
}