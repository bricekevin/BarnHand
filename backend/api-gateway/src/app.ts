import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env, isDevelopment } from './config/env';
import { requestLogger, errorLogger, logger } from './config/logger';
import { apiRateLimit } from './middleware/rateLimiting';
import { validateRequestSize } from './middleware/validation';
// Route imports
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import authRoutes from './routes/auth';
import detectionRoutes from './routes/detections';
import healthRoutes from './routes/health';
import horseRoutes from './routes/horses';
import internalRoutes from './routes/internal';
import streamRoutes from './routes/streams';

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: isDevelopment
      ? false
      : {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
          },
        },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map(origin => origin.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request size validation
app.use(validateRequestSize(10)); // 10MB limit

// Request logging
if (!isDevelopment) {
  app.use(requestLogger);
}

// Rate limiting (applied to API routes only)
app.use('/api/', apiRateLimit);

// API versioning and routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/streams', streamRoutes);
app.use('/api/v1/horses', horseRoutes);
app.use('/api/v1/detections', detectionRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/internal', internalRoutes);

// Root health check (for Docker health checks)
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  });
});

// API info endpoint
app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'BarnHand API Gateway',
    version: '0.3.0',
    description:
      'Intelligent horse streaming platform API with real-time detection and pose analysis',
    docs: '/api/v1/docs', // TODO: Add Swagger/OpenAPI docs
    endpoints: {
      auth: '/api/v1/auth/*',
      streams: '/api/v1/streams/*',
      horses: '/api/v1/horses/*',
      detections: '/api/v1/detections/*',
      analytics: '/api/v1/analytics/*',
      health: '/api/v1/health/*',
    },
    environment: env.NODE_ENV,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
  });
});

// 404 handler for API routes
app.use('/api/', (req, res) => {
  logger.warn('API route not found', {
    path: req.path,
    method: req.method,
    userAgent: req.get('user-agent'),
  });

  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    availableEndpoints: '/api/v1',
  });
});

// Global error handler
app.use(errorLogger);
app.use(
  (
    error: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error('Unhandled application error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: isDevelopment ? error.message : 'Internal server error',
      ...(isDevelopment && { stack: error.stack }),
    });
  }
);

export default app;
