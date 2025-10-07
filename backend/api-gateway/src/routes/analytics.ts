import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../config/logger';
import {
  authenticateToken,
  requireRole,
  createAuthenticatedRoute,
} from '../middleware/auth';
import { validateSchema } from '../middleware/validation';
import { UserRole } from '../types/auth';

// Validation schemas
const metricsQuerySchema = z.object({
  farm_id: z.string().uuid().optional(),
  stream_id: z.string().uuid().optional(),
  hours: z.coerce.number().min(1).max(168).default(24), // 1 hour to 7 days
});


const performanceQuerySchema = z.object({
  service: z
    .enum(['api-gateway', 'stream-service', 'ml-service', 'video-streamer'])
    .optional(),
  hours: z.coerce.number().min(1).max(24).default(1),
});

const router = Router();

// Apply authentication to all analytics routes
router.use(authenticateToken);

// GET /api/v1/analytics/metrics - Real-time metrics
router.get(
  '/metrics',
  validateSchema(metricsQuerySchema, 'query'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN, UserRole.FARM_USER]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { farm_id, stream_id, hours } = req.query;

      // Filter farm access for non-super-admin users
      const targetFarmId =
        req.user.role === UserRole.SUPER_ADMIN ? farm_id : req.user.farmId;

      // TODO: Replace with DetectionRepository.getStreamMetrics() and analytics queries
      const mockMetrics = {
        timeRange: `${hours} hours`,
        farmId: targetFarmId,
        streamId: stream_id,
        overview: {
          totalDetections: 2847,
          uniqueHorses: 7,
          avgConfidence: 0.89,
          avgProcessingTimeMs: 52,
          activeStreams: 3,
          errorRate: 0.02,
        },
        streams: [
          {
            streamId: '123e4567-e89b-12d3-a456-426614174100',
            name: 'Main Pasture Camera',
            detections: 1247,
            uniqueHorses: 5,
            avgConfidence: 0.91,
            uptime: 0.98,
            lastProcessed: new Date(Date.now() - 30 * 1000),
          },
        ],
        horses: [
          {
            horseId: '123e4567-e89b-12d3-a456-426614174200',
            name: 'Thunder',
            detections: 425,
            avgConfidence: 0.94,
            lastSeen: new Date(Date.now() - 2 * 60 * 1000),
            activities: { walk: 245, stand: 180, graze: 0 },
          },
        ],
        performance: {
          avgProcessingTimeMs: 52,
          processingThroughput: 48.5, // FPS
          queueDepth: 2,
          memoryUsage: 0.67,
          gpuUsage: 0.43,
        },
        generatedAt: new Date(),
      };

      logger.info('Analytics metrics retrieved', {
        userId: req.user.userId,
        farmId: targetFarmId,
        streamId: stream_id,
        hours,
      });

      return res.json(mockMetrics);
    } catch (error) {
      logger.error('Get analytics metrics error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);


// GET /api/v1/analytics/performance - System performance metrics
router.get(
  '/performance',
  validateSchema(performanceQuerySchema, 'query'),
  requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]),
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { service, hours } = req.query;

      // TODO: Replace with actual service health monitoring
      const mockPerformance = {
        timeRange: `${hours} hours`,
        service: service || 'all',
        services: {
          'api-gateway': {
            status: 'healthy',
            uptime: 0.999,
            avgResponseTime: 45,
            requestCount: 15672,
            errorRate: 0.001,
            memoryUsage: 0.42,
            cpuUsage: 0.15,
          },
          'stream-service': {
            status: 'healthy',
            uptime: 0.995,
            chunksProcessed: 2847,
            avgChunkTime: 8.5,
            queueDepth: 3,
            memoryUsage: 0.67,
            cpuUsage: 0.35,
          },
          'ml-service': {
            status: 'healthy',
            uptime: 0.987,
            inferenceCount: 2847,
            avgInferenceTime: 52,
            throughputFps: 48.5,
            memoryUsage: 0.78,
            gpuUsage: 0.43,
          },
          'video-streamer': {
            status: 'healthy',
            uptime: 1.0,
            activeStreams: 5,
            bandwidth: '15.3 Mbps',
            memoryUsage: 0.23,
            cpuUsage: 0.08,
          },
        },
        generatedAt: new Date(),
      };

      logger.info('Performance metrics retrieved', {
        userId: req.user.userId,
        service,
        hours,
      });

      return res.json(mockPerformance);
    } catch (error) {
      logger.error('Get performance metrics error', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

export default router;
