import { Router, Request, Response } from 'express';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { StreamManager } from '../services/StreamManager';

export function createHealthRoutes(streamManager: StreamManager): Router {
  const router = Router();

  // GET /health - Basic health check (for Docker)
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const streams = streamManager.getAllStreams();
      const activeStreams = streams.filter(s => s.status === 'active');
      const errorStreams = streams.filter(s => s.status === 'error');

      const isHealthy = errorStreams.length === 0 || activeStreams.length > 0;

      const health = {
        status: isHealthy ? 'healthy' : 'degraded',
        service: 'video-streamer',
        timestamp: new Date().toISOString(),
        version: '0.3.0',
        uptime: Math.round(process.uptime()),
        streams: {
          total: streams.length,
          active: activeStreams.length,
          error: errorStreams.length,
          maxStreams: env.MAX_STREAMS,
        },
        system: {
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
          },
          ffmpeg: {
            available: true, // TODO: Check if FFmpeg is available
            version: 'unknown', // TODO: Get FFmpeg version
          },
        },
      };

      const httpStatus = isHealthy ? 200 : 503;

      logger.debug('Health check completed', {
        status: health.status,
        activeStreams: activeStreams.length,
        errorStreams: errorStreams.length,
      });

      res.status(httpStatus).json(health);
    } catch (error) {
      logger.error('Health check failed', { error });

      res.status(503).json({
        status: 'unhealthy',
        service: 'video-streamer',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /health/detailed - Detailed health with stream-specific info
  router.get('/detailed', async (_req: Request, res: Response) => {
    try {
      const streams = streamManager.getAllStreams();

      // Get health for each stream
      const streamHealthPromises = streams.map(async stream => {
        const health = await streamManager.getStreamHealth(stream.id);
        return {
          id: stream.id,
          name: stream.name,
          status: stream.status,
          health,
          process: {
            pid: stream.process?.pid,
            startTime: stream.startTime,
            restartCount: stream.restartCount,
            lastError: stream.lastError,
          },
          videoFile: {
            filename: stream.videoFile.filename,
            path: stream.videoFile.fullPath,
            size: stream.videoFile.size,
            duration: stream.videoFile.duration,
            resolution: stream.videoFile.resolution,
          },
        };
      });

      const streamHealthResults = await Promise.all(streamHealthPromises);

      const detailedHealth = {
        timestamp: new Date().toISOString(),
        version: '0.3.0',
        environment: env.NODE_ENV,
        uptime: process.uptime(),

        configuration: {
          mediaPath: env.MEDIA_PATH,
          outputPath: env.OUTPUT_PATH,
          maxStreams: env.MAX_STREAMS,
          segmentDuration: env.SEGMENT_DURATION,
          playlistSize: env.PLAYLIST_SIZE,
          videoQuality: env.VIDEO_QUALITY,
          frameRate: env.FRAME_RATE,
          bitrate: env.BITRATE,
        },

        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          platform: process.platform,
          nodeVersion: process.version,
        },

        streams: streamHealthResults,

        summary: {
          totalStreams: streams.length,
          activeStreams: streams.filter(s => s.status === 'active').length,
          errorStreams: streams.filter(s => s.status === 'error').length,
          healthyStreams: streamHealthResults.filter(s => s.health.isHealthy)
            .length,
        },
      };

      logger.info('Detailed health check completed', {
        totalStreams: streams.length,
        healthyStreams: streamHealthResults.filter(s => s.health.isHealthy)
          .length,
      });

      res.json(detailedHealth);
    } catch (error) {
      logger.error('Detailed health check failed', { error });
      res.status(500).json({ error: 'Detailed health check failed' });
    }
  });

  return router;
}
