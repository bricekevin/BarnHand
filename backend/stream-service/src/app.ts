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