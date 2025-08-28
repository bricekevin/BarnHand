import path from 'path';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env, isDevelopment } from './config/env';
import { logger } from './config/logger';
import { createHealthRoutes } from './routes/health';
import { createStreamRoutes } from './routes/streams';
import { createVideoRoutes } from './routes/videos';
import { StreamManager } from './services/StreamManager';
import { VideoScanner } from './services/VideoScanner';

export async function createApp(): Promise<express.Application> {
  const app = express();

  // Initialize services
  const streamManager = new StreamManager();
  const videoScanner = new VideoScanner(env.MEDIA_PATH);

  // Initialize output directory
  await streamManager.initializeOutputDirectory();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: isDevelopment ? false : {},
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS configuration (allow all origins for video streaming)
  app.use(
    cors({
      origin: true, // Allow all origins for video streaming
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Range'],
      exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
      credentials: false,
    })
  );

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Static file serving for HLS streams
  app.use('/stream1', express.static(path.join(env.OUTPUT_PATH, 'stream_001')));
  app.use('/stream2', express.static(path.join(env.OUTPUT_PATH, 'stream_002')));
  app.use('/stream3', express.static(path.join(env.OUTPUT_PATH, 'stream_003')));
  app.use('/stream4', express.static(path.join(env.OUTPUT_PATH, 'stream_004')));
  app.use('/stream5', express.static(path.join(env.OUTPUT_PATH, 'stream_005')));

  // Dynamic stream serving
  app.use('/streams/:streamId', (req, res, next) => {
    const streamId = req.params.streamId;
    const streamPath = path.join(env.OUTPUT_PATH, streamId);
    express.static(streamPath)(req, res, next);
  });

  // API routes
  app.use('/api/streams', createStreamRoutes(streamManager, videoScanner));
  app.use('/api/videos', createVideoRoutes(videoScanner));
  app.use('/health', createHealthRoutes(streamManager));

  // Root endpoint with service info
  app.get('/', (_req: express.Request, res: express.Response) => {
    res.json({
      name: 'BarnHand Video Streamer',
      version: '0.3.0',
      description: 'Local video streaming service with HLS output',
      endpoints: {
        streams: '/api/streams',
        videos: '/api/videos',
        health: '/health',
      },
      streaming: {
        format: 'HLS (HTTP Live Streaming)',
        segmentDuration: `${env.SEGMENT_DURATION}s`,
        playlistSize: env.PLAYLIST_SIZE,
        maxStreams: env.MAX_STREAMS,
        videoQuality: env.VIDEO_QUALITY,
        availableStreams: [
          'http://localhost:8003/stream1/playlist.m3u8',
          'http://localhost:8003/stream2/playlist.m3u8',
          'http://localhost:8003/stream3/playlist.m3u8',
          'http://localhost:8003/stream4/playlist.m3u8',
          'http://localhost:8003/stream5/playlist.m3u8',
        ],
      },
      mediaPath: env.MEDIA_PATH,
      environment: env.NODE_ENV,
    });
  });

  // 404 handler
  app.use('*', (req, res) => {
    logger.warn('Route not found', {
      path: req.path,
      method: req.method,
      userAgent: req.get('user-agent'),
    });

    res.status(404).json({
      error: 'Endpoint not found',
      path: req.path,
      method: req.method,
      availableEndpoints: {
        root: '/',
        streams: '/api/streams',
        videos: '/api/videos',
        health: '/health',
      },
    });
  });

  // Global error handler
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

  // Store references for graceful shutdown
  (app as any).streamManager = streamManager;
  (app as any).videoScanner = videoScanner;

  return app;
}
