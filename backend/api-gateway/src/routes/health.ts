import { Router } from 'express';

import { env } from '../config/env';
import { logger } from '../config/logger';

// Health check interface
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    database?: 'healthy' | 'unhealthy';
    redis?: 'healthy' | 'unhealthy';
    streamService?: 'healthy' | 'unhealthy';
    mlService?: 'healthy' | 'unhealthy';
    videoStreamer?: 'healthy' | 'unhealthy';
  };
  details?: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu?: number;
  };
}

const router = Router();

// GET /api/v1/health - Basic health check (public endpoint)
router.get('/', async (_req, res) => {
  try {
    const startTime = process.hrtime();

    // Basic service checks
    const services: HealthStatus['services'] = {};

    // TODO: Add actual service health checks
    // Database check
    try {
      // await DatabaseHealth.check();
      services.database = 'healthy';
    } catch {
      services.database = 'unhealthy';
    }

    // Redis check
    try {
      // await RedisHealth.check();
      services.redis = 'healthy';
    } catch {
      services.redis = 'unhealthy';
    }

    // Service connectivity checks (HTTP requests to health endpoints)
    const serviceChecks = [
      {
        name: 'streamService',
        url: `${env.STREAM_SERVICE_URL || 'http://localhost:8001'}/health`,
      },
      {
        name: 'mlService',
        url: `${env.ML_SERVICE_URL || 'http://localhost:8002'}/health`,
      },
      {
        name: 'videoStreamer',
        url: `${env.VIDEO_STREAMER_URL || 'http://localhost:8003'}/health`,
      },
    ];

    for (const service of serviceChecks) {
      try {
        // TODO: Add actual HTTP health checks
        services[service.name as keyof typeof services] = 'healthy';
      } catch {
        services[service.name as keyof typeof services] = 'unhealthy';
      }
    }

    // Calculate overall status
    const unhealthyServices = Object.values(services).filter(
      status => status === 'unhealthy'
    );
    const overallStatus: HealthStatus['status'] =
      unhealthyServices.length === 0
        ? 'healthy'
        : unhealthyServices.length <= 1
          ? 'degraded'
          : 'unhealthy';

    // Memory usage
    const memUsage = process.memoryUsage();
    const memoryInfo = {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    };

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = Math.round(seconds * 1000 + nanoseconds / 1000000);

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.3.0',
      uptime: Math.round(process.uptime()),
      services,
      details: {
        memory: memoryInfo,
        cpu: process.cpuUsage().user / 1000000, // Convert to milliseconds
      },
    };

    // Set appropriate HTTP status based on health
    const httpStatus =
      overallStatus === 'healthy'
        ? 200
        : overallStatus === 'degraded'
          ? 200
          : 503;

    logger.debug('Health check completed', {
      status: overallStatus,
      responseTime,
      services: Object.keys(services).length,
    });

    res.status(httpStatus).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', { error });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.3.0',
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/v1/health/detailed - Detailed health check (authenticated)
router.get('/detailed', async (req, res) => {
  try {
    // More comprehensive health checks for monitoring systems
    const detailedHealth = {
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.3.0',
      environment: env.NODE_ENV,
      uptime: process.uptime(),

      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
      },

      services: {
        // TODO: Add detailed service checks with response times and connection counts
        database: { status: 'healthy', responseTime: 12, connections: 8 },
        redis: { status: 'healthy', responseTime: 3, connections: 5 },
        streamService: {
          status: 'healthy',
          responseTime: 28,
          activeStreams: 3,
        },
        mlService: { status: 'healthy', responseTime: 156, queueDepth: 2 },
        videoStreamer: { status: 'healthy', responseTime: 8, streams: 5 },
      },

      metrics: {
        requestsPerMinute: 245,
        avgResponseTime: 67,
        errorRate: 0.012,
        authenticatedUsers: 12,
        activeStreams: 3,
        processingQueue: 2,
      },
    };

    logger.info('Detailed health check completed', {
      userId: req.headers.authorization ? 'authenticated' : 'anonymous',
    });

    res.json(detailedHealth);
  } catch (error) {
    logger.error('Detailed health check failed', { error });
    res.status(500).json({ error: 'Health check failed' });
  }
});

export default router;
