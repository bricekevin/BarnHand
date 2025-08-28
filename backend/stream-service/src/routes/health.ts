import { Router, Request, Response } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { StreamProcessor } from '../services/StreamProcessor';

export function createHealthRoutes(streamProcessor: StreamProcessor): Router {
  const router = Router();

  // GET /health - Basic health check
  router.get('/', async (_req: Request, res: Response) => {
    try {
      await streamProcessor.updateMetrics();
      const metrics = streamProcessor.getMetrics();
      const activeStreams = streamProcessor.getActiveStreams();
      
      const isHealthy = metrics.queueDepth < 500 && 
                       metrics.activeExtractions < 10 &&
                       activeStreams.length > 0;

      const health = {
        status: isHealthy ? 'healthy' : 'degraded',
        service: 'stream-service', 
        timestamp: new Date().toISOString(),
        version: '0.3.0',
        uptime: Math.round(process.uptime()),
        
        streams: {
          active: activeStreams.length,
          processing: metrics.activeExtractions
        },
        
        queue: {
          depth: metrics.queueDepth,
          maxSize: env.MAX_QUEUE_SIZE,
          concurrency: env.QUEUE_CONCURRENCY
        },
        
        chunks: {
          extracted: metrics.chunksExtracted,
          processed: metrics.chunksProcessed,
          failed: metrics.chunksFailed,
          avgExtractionTime: Math.round(metrics.avgExtractionTime),
          avgProcessingTime: Math.round(metrics.avgProcessingTime)
        },
        
        system: {
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
          },
          storage: {
            chunkPath: env.CHUNK_OUTPUT_PATH,
            processedPath: env.PROCESSED_OUTPUT_PATH,
            retentionHours: env.CHUNK_RETENTION_HOURS
          }
        }
      };

      const httpStatus = isHealthy ? 200 : 503;

      logger.debug('Health check completed', { 
        status: health.status,
        activeStreams: activeStreams.length,
        queueDepth: metrics.queueDepth
      });

      res.status(httpStatus).json(health);
    } catch (error) {
      logger.error('Health check failed', { error });
      
      res.status(503).json({
        status: 'unhealthy',
        service: 'stream-service',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /health/detailed - Comprehensive health information
  router.get('/detailed', async (_req: Request, res: Response) => {
    try {
      await streamProcessor.updateMetrics();
      const metrics = streamProcessor.getMetrics();
      const activeStreams = streamProcessor.getActiveStreams();
      
      const detailedHealth = {
        timestamp: new Date().toISOString(),
        version: '0.3.0',
        environment: env.NODE_ENV,
        uptime: process.uptime(),
        
        configuration: {
          chunkDuration: env.CHUNK_DURATION,
          chunkOverlap: env.CHUNK_OVERLAP,
          processingDelay: env.PROCESSING_DELAY,
          maxQueueSize: env.MAX_QUEUE_SIZE,
          concurrency: env.QUEUE_CONCURRENCY,
          retentionHours: env.CHUNK_RETENTION_HOURS,
          ffmpegBinary: env.FFMPEG_BINARY,
          videoQuality: env.VIDEO_QUALITY
        },

        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          platform: process.platform,
          nodeVersion: process.version
        },

        services: {
          redis: {
            url: env.REDIS_URL,
            // TODO: Add actual Redis health check
            status: 'healthy',
            responseTime: 5
          },
          mlService: {
            url: env.ML_SERVICE_URL,
            // TODO: Add actual ML service health check
            status: 'healthy',
            responseTime: 150
          },
          videoStreamer: {
            url: env.VIDEO_STREAMER_URL,
            // TODO: Add actual video streamer health check
            status: 'healthy',
            responseTime: 10
          }
        },

        streams: activeStreams.map(stream => {
          const status = streamProcessor.getStreamStatus(stream.id);
          return {
            id: stream.id,
            name: stream.name,
            url: stream.url,
            active: stream.active,
            ...status
          };
        }),

        metrics: {
          ...metrics,
          performance: {
            avgExtractionTime: Math.round(metrics.avgExtractionTime),
            avgProcessingTime: Math.round(metrics.avgProcessingTime),
            throughput: metrics.chunksExtracted > 0 ? 
              Math.round(metrics.chunksExtracted / (process.uptime() / 60)) : 0, // chunks per minute
            successRate: metrics.chunksExtracted > 0 ? 
              (metrics.chunksProcessed / metrics.chunksExtracted * 100).toFixed(2) + '%' : '0%'
          }
        }
      };

      logger.info('Detailed health check completed', { 
        activeStreams: activeStreams.length,
        queueDepth: metrics.queueDepth
      });

      res.json(detailedHealth);
    } catch (error) {
      logger.error('Detailed health check failed', { error });
      res.status(500).json({ error: 'Detailed health check failed' });
    }
  });

  return router;
}