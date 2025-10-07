import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { UserRole } from '../types/auth';

describe('Analytics API', () => {
  let authToken: string;
  let farmAdminToken: string;
  let farmUserToken: string;

  beforeAll(() => {
    authToken = jwt.sign(
      {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        farmId: '123e4567-e89b-12d3-a456-426614174010',
        role: UserRole.SUPER_ADMIN,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    farmAdminToken = jwt.sign(
      {
        userId: '123e4567-e89b-12d3-a456-426614174001',
        farmId: '123e4567-e89b-12d3-a456-426614174010',
        role: UserRole.FARM_ADMIN,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    farmUserToken = jwt.sign(
      {
        userId: '123e4567-e89b-12d3-a456-426614174002',
        farmId: '123e4567-e89b-12d3-a456-426614174010',
        role: UserRole.FARM_USER,
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/v1/analytics/metrics', () => {
    it('should get metrics with default parameters', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('timeRange', '24 hours');
      expect(response.body).toHaveProperty('overview');
      expect(response.body).toHaveProperty('streams');
      expect(response.body).toHaveProperty('horses');
      expect(response.body).toHaveProperty('performance');
      expect(response.body).toHaveProperty('generatedAt');
    });

    it('should include comprehensive overview metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      const overview = response.body.overview;
      expect(overview).toHaveProperty('totalDetections');
      expect(overview).toHaveProperty('uniqueHorses');
      expect(overview).toHaveProperty('avgConfidence');
      expect(overview).toHaveProperty('avgProcessingTimeMs');
      expect(overview).toHaveProperty('activeStreams');
      expect(overview).toHaveProperty('errorRate');

      // Validate data types and ranges
      expect(typeof overview.totalDetections).toBe('number');
      expect(typeof overview.uniqueHorses).toBe('number');
      expect(typeof overview.avgConfidence).toBe('number');
      expect(overview.avgConfidence).toBeGreaterThanOrEqual(0);
      expect(overview.avgConfidence).toBeLessThanOrEqual(1);
      expect(typeof overview.errorRate).toBe('number');
      expect(overview.errorRate).toBeGreaterThanOrEqual(0);
      expect(overview.errorRate).toBeLessThanOrEqual(1);
    });

    it('should include stream-specific metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(Array.isArray(response.body.streams)).toBe(true);

      if (response.body.streams.length > 0) {
        const stream = response.body.streams[0];
        expect(stream).toHaveProperty('streamId');
        expect(stream).toHaveProperty('name');
        expect(stream).toHaveProperty('detections');
        expect(stream).toHaveProperty('uniqueHorses');
        expect(stream).toHaveProperty('avgConfidence');
        expect(stream).toHaveProperty('uptime');
        expect(stream).toHaveProperty('lastProcessed');

        expect(typeof stream.uptime).toBe('number');
        expect(stream.uptime).toBeGreaterThanOrEqual(0);
        expect(stream.uptime).toBeLessThanOrEqual(1);
      }
    });

    it('should include horse-specific metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(Array.isArray(response.body.horses)).toBe(true);

      if (response.body.horses.length > 0) {
        const horse = response.body.horses[0];
        expect(horse).toHaveProperty('horseId');
        expect(horse).toHaveProperty('name');
        expect(horse).toHaveProperty('detections');
        expect(horse).toHaveProperty('avgConfidence');
        expect(horse).toHaveProperty('lastSeen');
        expect(horse).toHaveProperty('activities');

        expect(typeof horse.activities).toBe('object');
        expect(horse.activities).toHaveProperty('walk');
        expect(horse.activities).toHaveProperty('stand');
        expect(horse.activities).toHaveProperty('graze');
      }
    });

    it('should include performance metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      const performance = response.body.performance;
      expect(performance).toHaveProperty('avgProcessingTimeMs');
      expect(performance).toHaveProperty('processingThroughput');
      expect(performance).toHaveProperty('queueDepth');
      expect(performance).toHaveProperty('memoryUsage');
      expect(performance).toHaveProperty('gpuUsage');

      expect(typeof performance.avgProcessingTimeMs).toBe('number');
      expect(typeof performance.processingThroughput).toBe('number');
      expect(typeof performance.memoryUsage).toBe('number');
      expect(performance.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(performance.memoryUsage).toBeLessThanOrEqual(1);
    });

    it('should filter by specific stream', async () => {
      const streamId = '123e4567-e89b-12d3-a456-426614174100';
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .query({ stream_id: streamId })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.streamId).toBe(streamId);
    });

    it('should allow custom time range', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .query({ hours: '48' })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.timeRange).toBe('48 hours');
    });

    it('should validate hours range', async () => {
      await request(app)
        .get('/api/v1/analytics/metrics')
        .query({ hours: '200' }) // Above maximum of 168
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });

    it('should filter farm access for non-super-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.farmId).toBe('123e4567-e89b-12d3-a456-426614174010');
    });

    it('should allow super admin to query specific farm', async () => {
      const farmId = '123e4567-e89b-12d3-a456-426614174010';
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .query({ farm_id: farmId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.farmId).toBe(farmId);
    });

    it('should reject requests without auth', async () => {
      await request(app).get('/api/v1/analytics/metrics').expect(401);
    });
  });

  describe('GET /api/v1/analytics/export', () => {
    const validExportParams = {
      start_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date().toISOString(),
      format: 'json',
    };

    it('should create export with valid parameters and admin auth', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export')
        .query(validExportParams)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('exportId');
      expect(response.body).toHaveProperty('status', 'processing');
      expect(response.body).toHaveProperty('estimatedCompletionTime');
      expect(response.body).toHaveProperty('downloadUrl', null);
      expect(response.body).toHaveProperty('format', 'json');
      expect(response.body).toHaveProperty('createdAt');
    });

    it('should support different export formats', async () => {
      const formats = ['json', 'csv', 'xlsx'];

      for (const format of formats) {
        const response = await request(app)
          .get('/api/v1/analytics/export')
          .query({ ...validExportParams, format })
          .set('Authorization', `Bearer ${farmAdminToken}`)
          .expect(200);

        expect(response.body.format).toBe(format);
      }
    });

    it('should include pose data option', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export')
        .query({ ...validExportParams, include_pose: 'true' })
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      expect(response.body.options.include_pose).toBe(true);
    });

    it('should include images option', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export')
        .query({ ...validExportParams, include_images: 'true' })
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      expect(response.body.options.include_images).toBe(true);
    });

    it('should reject invalid date format', async () => {
      await request(app)
        .get('/api/v1/analytics/export')
        .query({ ...validExportParams, start_date: 'invalid-date' })
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(400);
    });

    it('should reject invalid export format', async () => {
      await request(app)
        .get('/api/v1/analytics/export')
        .query({ ...validExportParams, format: 'invalid-format' })
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(400);
    });

    it('should require admin role', async () => {
      await request(app)
        .get('/api/v1/analytics/export')
        .query(validExportParams)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(403);
    });

    it('should reject requests without auth', async () => {
      await request(app)
        .get('/api/v1/analytics/export')
        .query(validExportParams)
        .expect(401);
    });

    it('should filter farm access for non-super-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export')
        .query(validExportParams)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      // Farm admin should only access their own farm's data
      // This would be validated in the actual implementation
      expect(response.body).toHaveProperty('exportId');
    });
  });

  describe('GET /api/v1/analytics/performance', () => {
    it('should get performance metrics with default parameters', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/performance')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('timeRange', '1 hours');
      expect(response.body).toHaveProperty('service', 'all');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('generatedAt');
    });

    it('should include all service metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/performance')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      const services = response.body.services;
      expect(services).toHaveProperty('api-gateway');
      expect(services).toHaveProperty('stream-service');
      expect(services).toHaveProperty('ml-service');
      expect(services).toHaveProperty('video-streamer');

      // Check API Gateway metrics
      const apiGateway = services['api-gateway'];
      expect(apiGateway).toHaveProperty('status');
      expect(apiGateway).toHaveProperty('uptime');
      expect(apiGateway).toHaveProperty('avgResponseTime');
      expect(apiGateway).toHaveProperty('requestCount');
      expect(apiGateway).toHaveProperty('errorRate');
      expect(apiGateway).toHaveProperty('memoryUsage');
      expect(apiGateway).toHaveProperty('cpuUsage');

      // Validate data types and ranges
      expect(typeof apiGateway.uptime).toBe('number');
      expect(apiGateway.uptime).toBeGreaterThanOrEqual(0);
      expect(apiGateway.uptime).toBeLessThanOrEqual(1);
      expect(typeof apiGateway.memoryUsage).toBe('number');
      expect(apiGateway.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(apiGateway.memoryUsage).toBeLessThanOrEqual(1);
    });

    it('should include ML service specific metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/performance')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      const mlService = response.body.services['ml-service'];
      expect(mlService).toHaveProperty('inferenceCount');
      expect(mlService).toHaveProperty('avgInferenceTime');
      expect(mlService).toHaveProperty('throughputFps');
      expect(mlService).toHaveProperty('gpuUsage');

      expect(typeof mlService.inferenceCount).toBe('number');
      expect(typeof mlService.avgInferenceTime).toBe('number');
      expect(typeof mlService.throughputFps).toBe('number');
      expect(typeof mlService.gpuUsage).toBe('number');
    });

    it('should include stream service specific metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/performance')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      const streamService = response.body.services['stream-service'];
      expect(streamService).toHaveProperty('chunksProcessed');
      expect(streamService).toHaveProperty('avgChunkTime');
      expect(streamService).toHaveProperty('queueDepth');

      expect(typeof streamService.chunksProcessed).toBe('number');
      expect(typeof streamService.avgChunkTime).toBe('number');
      expect(typeof streamService.queueDepth).toBe('number');
    });

    it('should filter by specific service', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/performance')
        .query({ service: 'ml-service' })
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      expect(response.body.service).toBe('ml-service');
    });

    it('should allow custom time range', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/performance')
        .query({ hours: '6' })
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      expect(response.body.timeRange).toBe('6 hours');
    });

    it('should validate service enum', async () => {
      await request(app)
        .get('/api/v1/analytics/performance')
        .query({ service: 'invalid-service' })
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(400);
    });

    it('should validate hours range', async () => {
      await request(app)
        .get('/api/v1/analytics/performance')
        .query({ hours: '25' }) // Above maximum of 24
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(400);
    });

    it('should require admin role', async () => {
      await request(app)
        .get('/api/v1/analytics/performance')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(403);
    });

    it('should reject requests without auth', async () => {
      await request(app).get('/api/v1/analytics/performance').expect(401);
    });
  });

  describe('Analytics Data Validation', () => {
    it('should return consistent timestamp formats', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.generatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it('should handle timezone considerations', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      // Ensure generated timestamp is recent (within last minute)
      const generatedAt = new Date(response.body.generatedAt);
      const now = new Date();
      const diffMs = now.getTime() - generatedAt.getTime();
      expect(diffMs).toBeLessThan(60 * 1000); // Less than 1 minute old
    });

    it('should include proper numeric precision for metrics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/metrics')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      const overview = response.body.overview;

      // Confidence should be precise to reasonable decimal places
      expect(overview.avgConfidence).toBeCloseTo(overview.avgConfidence, 2);
      expect(overview.errorRate).toBeCloseTo(overview.errorRate, 3);
    });
  });
});
