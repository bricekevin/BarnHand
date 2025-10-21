import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isDevelopment } from './config/env';
import { logger } from './config/logger';
import { StreamProcessor } from './services/StreamProcessor';
import { createProcessingRoutes } from './routes/processing';
import { createHealthRoutes } from './routes/health';

export async function createApp(): Promise<express.Application> {
  const app = express();

  // Initialize stream processor
  const streamProcessor = new StreamProcessor();
  await streamProcessor.initialize();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: isDevelopment ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  // CORS configuration
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:8000'], // Frontend and API Gateway
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API routes
  app.use('/api/processing', createProcessingRoutes(streamProcessor));
  app.use('/health', createHealthRoutes(streamProcessor));

  // Admin endpoint to stop all processing (for cleanup operations)
  app.post('/api/admin/stop-all', async (req, res) => {
    try {
      logger.warn('Admin: Stop all processing requested');

      // Get current state before stopping
      const beforeActive = streamProcessor.getActiveStreams().length;
      const beforeQueue = streamProcessor.getMetrics().queueDepth;

      // Stop all active streams
      const streamIds = streamProcessor.getActiveStreams();
      for (const streamId of streamIds) {
        await streamProcessor.stopStreamProcessing(streamId);
      }

      // Clear queue by shutdown and reinit
      await streamProcessor.shutdown();
      await streamProcessor.initialize();

      logger.info('Admin: All stream processing stopped and queue cleared');
      res.json({
        message: 'All stream processing stopped successfully',
        before: {
          activeStreams: beforeActive,
          queueDepth: beforeQueue
        },
        after: {
          activeStreams: streamProcessor.getActiveStreams().length,
          queueDepth: streamProcessor.getMetrics().queueDepth
        }
      });
    } catch (error: any) {
      logger.error('Admin: Failed to stop processing', { error: error.message });
      res.status(500).json({ error: 'Failed to stop processing', details: error.message });
    }
  });

  // Root endpoint with service info
  app.get('/', (_req: express.Request, res: express.Response) => {
    res.json({
      name: 'BarnHand Stream Processing Service',
      version: '0.3.0',
      description: '10-second chunk extraction and ML processing queue management',
      endpoints: {
        processing: '/api/processing/*',
        health: '/health'
      },
      configuration: {
        chunkDuration: env.CHUNK_DURATION,
        chunkOverlap: env.CHUNK_OVERLAP,
        processingDelay: env.PROCESSING_DELAY,
        maxQueueSize: env.MAX_QUEUE_SIZE,
        concurrency: env.QUEUE_CONCURRENCY
      },
      status: {
        activeStreams: streamProcessor.getActiveStreams().length,
        queueDepth: streamProcessor.getMetrics().queueDepth
      },
      environment: env.NODE_ENV
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    logger.warn('Route not found', { 
      path: req.path, 
      method: req.method,
      userAgent: req.get('user-agent')
    });
    
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.path,
      method: req.method,
      availableEndpoints: {
        root: '/',
        processing: '/api/processing',
        health: '/health'
      }
    });
  });

  // Global error handler
  app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled application error', { 
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method
    });

    res.status(500).json({
      error: isDevelopment ? error.message : 'Internal server error',
      ...(isDevelopment && { stack: error.stack })
    });
  });

  // Store processor reference for graceful shutdown
  (app as any).streamProcessor = streamProcessor;

  return app;
}