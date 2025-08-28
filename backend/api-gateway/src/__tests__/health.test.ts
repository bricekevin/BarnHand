import request from 'supertest';

import app from '../app';

describe('Health Check Endpoints', () => {
  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('api-gateway');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return detailed health status', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('details');

      // Check services object structure
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('redis');

      // Check details object structure
      expect(response.body.details).toHaveProperty('memory');
      expect(response.body.details.memory).toHaveProperty('used');
      expect(response.body.details.memory).toHaveProperty('total');
      expect(response.body.details.memory).toHaveProperty('percentage');
    });

    it('should include performance metrics', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.body.details.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(response.body.details.memory.percentage).toBeLessThanOrEqual(100);
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/v1/health/detailed', () => {
    it('should return comprehensive system metrics', async () => {
      const response = await request(app).get('/api/v1/health/detailed');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('metrics');

      // Check system metrics
      expect(response.body.system).toHaveProperty('memory');
      expect(response.body.system).toHaveProperty('cpu');
      expect(response.body.system).toHaveProperty('platform');
      expect(response.body.system).toHaveProperty('nodeVersion');

      // Check service metrics
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('redis');
      expect(response.body.services).toHaveProperty('streamService');
      expect(response.body.services).toHaveProperty('mlService');
      expect(response.body.services).toHaveProperty('videoStreamer');

      // Check performance metrics
      expect(response.body.metrics).toHaveProperty('requestsPerMinute');
      expect(response.body.metrics).toHaveProperty('avgResponseTime');
      expect(response.body.metrics).toHaveProperty('errorRate');
    });
  });
});
