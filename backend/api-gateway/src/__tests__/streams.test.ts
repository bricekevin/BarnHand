import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { UserRole } from '../types/auth';

describe('Streams API', () => {
  let authToken: string;
  let farmAdminToken: string;
  let farmUserToken: string;

  beforeAll(() => {
    // Create test JWT tokens
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

  describe('GET /api/v1/streams', () => {
    it('should list streams with valid auth', async () => {
      const response = await request(app)
        .get('/api/v1/streams')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('streams');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.streams)).toBe(true);
    });

    it('should reject requests without auth', async () => {
      await request(app).get('/api/v1/streams').expect(401);
    });

    it('should filter streams by farm for non-super-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/streams')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      expect(response.body.streams).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            farm_id: '123e4567-e89b-12d3-a456-426614174010',
          }),
        ])
      );
    });
  });

  describe('POST /api/v1/streams', () => {
    const validStreamData = {
      farm_id: '123e4567-e89b-12d3-a456-426614174010',
      name: 'Test Stream',
      source_type: 'local' as const,
      source_url: 'http://localhost:8003/stream1',
      processing_delay: 20,
      chunk_duration: 10,
      config: {},
    };

    it('should create stream with valid data and admin auth', async () => {
      const response = await request(app)
        .post('/api/v1/streams')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send(validStreamData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(validStreamData.name);
      expect(response.body.status).toBe('inactive');
    });

    it('should reject creation with invalid data', async () => {
      await request(app)
        .post('/api/v1/streams')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({ name: '' }) // Invalid: missing required fields
        .expect(400);
    });

    it('should reject creation with farm user role', async () => {
      await request(app)
        .post('/api/v1/streams')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send(validStreamData)
        .expect(403);
    });

    it('should validate source_type enum', async () => {
      await request(app)
        .post('/api/v1/streams')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({
          ...validStreamData,
          source_type: 'invalid_type',
        })
        .expect(400);
    });

    it('should validate processing_delay range', async () => {
      await request(app)
        .post('/api/v1/streams')
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({
          ...validStreamData,
          processing_delay: 5, // Invalid: below minimum of 10
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/streams/:id', () => {
    const streamId = '123e4567-e89b-12d3-a456-426614174100';

    it('should get stream with valid ID and auth', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', streamId);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('source_type');
    });

    it('should reject invalid UUID format', async () => {
      await request(app)
        .get('/api/v1/streams/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should check farm access for non-super-admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      // Mock data should belong to the same farm as the user
      expect(response.body.farm_id).toBe(
        '123e4567-e89b-12d3-a456-426614174010'
      );
    });
  });

  describe('PUT /api/v1/streams/:id', () => {
    const streamId = '123e4567-e89b-12d3-a456-426614174100';

    it('should update stream with valid data and admin auth', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({
          name: 'Updated Stream Name',
          processing_delay: 25,
        })
        .expect(200);
    });

    it('should reject update with farm user role', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send({ name: 'Updated Name' })
        .expect(403);
    });

    it('should validate update data', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({
          processing_delay: 5, // Invalid: below minimum
        })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/streams/:id', () => {
    const streamId = '123e4567-e89b-12d3-a456-426614174100';

    it('should delete stream with admin auth', async () => {
      await request(app)
        .delete(`/api/v1/streams/${streamId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);
    });

    it('should reject deletion with farm user role', async () => {
      await request(app)
        .delete(`/api/v1/streams/${streamId}`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(403);
    });
  });

  describe('POST /api/v1/streams/:id/start', () => {
    const streamId = '123e4567-e89b-12d3-a456-426614174100';

    it('should start stream processing with valid auth', async () => {
      const response = await request(app)
        .post(`/api/v1/streams/${streamId}/start`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty(
        'message',
        'Stream processing started'
      );
      expect(response.body).toHaveProperty('streamId', streamId);
      expect(response.body).toHaveProperty('status', 'starting');
    });

    it('should reject invalid stream ID', async () => {
      await request(app)
        .post('/api/v1/streams/invalid-id/start')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });
  });

  describe('POST /api/v1/streams/:id/stop', () => {
    const streamId = '123e4567-e89b-12d3-a456-426614174100';

    it('should stop stream processing with valid auth', async () => {
      const response = await request(app)
        .post(`/api/v1/streams/${streamId}/stop`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty(
        'message',
        'Stream processing stopped'
      );
      expect(response.body).toHaveProperty('streamId', streamId);
      expect(response.body).toHaveProperty('status', 'stopped');
    });
  });

  describe('GET /api/v1/streams/:id/processed', () => {
    const streamId = '123e4567-e89b-12d3-a456-426614174100';

    it('should get processed stream URL with valid auth', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}/processed`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('streamId', streamId);
      expect(response.body).toHaveProperty('processedUrl');
      expect(response.body).toHaveProperty('format', 'hls');
      expect(response.body).toHaveProperty('available', true);
      expect(response.body.processedUrl).toContain('playlist.m3u8');
    });
  });
});
