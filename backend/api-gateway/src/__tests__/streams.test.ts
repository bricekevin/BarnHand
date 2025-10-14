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

  // ========================================
  // Horse Registry Endpoint Tests
  // ========================================

  describe('GET /api/v1/streams/:id/horses', () => {
    const streamId = 'stream-123';

    it('should list horses for a stream with valid auth', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}/horses`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('horses');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.horses)).toBe(true);
    });

    it('should return summary when summary=true query param provided', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}/horses?summary=true`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('recent');
      expect(Array.isArray(response.body.recent)).toBe(true);
    });

    it('should reject requests without authentication', async () => {
      await request(app).get(`/api/v1/streams/${streamId}/horses`).expect(401);
    });

    it('should allow FARM_USER, FARM_ADMIN, and SUPER_ADMIN roles', async () => {
      // Test FARM_USER
      await request(app)
        .get(`/api/v1/streams/${streamId}/horses`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      // Test FARM_ADMIN
      await request(app)
        .get(`/api/v1/streams/${streamId}/horses`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .expect(200);

      // Test SUPER_ADMIN
      await request(app)
        .get(`/api/v1/streams/${streamId}/horses`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('should reject invalid stream ID format', async () => {
      await request(app)
        .get('/api/v1/streams//horses')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(404); // Empty ID should hit 404
    });

    it('should handle database unavailable gracefully', async () => {
      // This test will fail gracefully if database is not available
      // In production, we'd mock the service to throw the error
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}/horses`)
        .set('Authorization', `Bearer ${farmUserToken}`);

      expect([200, 503]).toContain(response.status);
    });
  });

  describe('GET /api/v1/streams/:id/horses/:horseId', () => {
    const streamId = 'stream-123';
    const horseId = 'horse-456';

    it('should get specific horse with valid auth', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect([200, 404]); // 404 if horse doesn't exist in test DB

      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('farm_id');
      }
    });

    it('should reject requests without authentication', async () => {
      await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .expect(401);
    });

    it('should allow all authenticated roles to view horse', async () => {
      // Test FARM_USER
      const response1 = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmUserToken}`);
      expect([200, 404]).toContain(response1.status);

      // Test FARM_ADMIN
      const response2 = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`);
      expect([200, 404]).toContain(response2.status);
    });

    it('should reject invalid horse ID format', async () => {
      await request(app)
        .get(`/api/v1/streams/${streamId}/horses/`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/v1/streams/:id/horses/:horseId', () => {
    const streamId = 'stream-123';
    const horseId = 'horse-456';

    const validUpdate = {
      name: 'Thunder',
      breed: 'Thoroughbred',
      age: 5,
      color: 'Bay',
      markings: 'White blaze',
      gender: 'mare' as const,
    };

    it('should update horse with valid data and FARM_ADMIN auth', async () => {
      const response = await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send(validUpdate);

      expect([200, 404]).toContain(response.status);
    });

    it('should reject update with FARM_USER role', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send(validUpdate)
        .expect(403);
    });

    it('should allow SUPER_ADMIN to update', async () => {
      const response = await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(validUpdate);

      expect([200, 404]).toContain(response.status);
    });

    it('should validate name length (max 100 chars)', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({ name: 'a'.repeat(101) })
        .expect(400);
    });

    it('should validate age range (0-50)', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({ age: -1 })
        .expect(400);

      await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({ age: 51 })
        .expect(400);
    });

    it('should validate gender enum', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({ gender: 'invalid' })
        .expect(400);
    });

    it('should accept partial updates', async () => {
      const response = await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({ name: 'Thunder' });

      expect([200, 404]).toContain(response.status);
    });

    it('should validate markings length (max 500 chars)', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({ markings: 'a'.repeat(501) })
        .expect(400);
    });

    it('should accept metadata updates', async () => {
      const response = await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({
          metadata: {
            custom_field: 'value',
            notes: 'Some notes',
          },
        });

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('GET /api/v1/streams/:id/horses/:horseId/avatar', () => {
    const streamId = 'stream-123';
    const horseId = 'horse-456';

    it('should get horse avatar with valid auth', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}/avatar`)
        .set('Authorization', `Bearer ${farmUserToken}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.headers['content-type']).toBe('image/jpeg');
        expect(response.headers['cache-control']).toContain('public');
        expect(response.body).toBeInstanceOf(Buffer);
      }
    });

    it('should reject requests without authentication', async () => {
      await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}/avatar`)
        .expect(401);
    });

    it('should allow all authenticated roles to view avatar', async () => {
      // Test FARM_USER
      const response1 = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}/avatar`)
        .set('Authorization', `Bearer ${farmUserToken}`);
      expect([200, 404]).toContain(response1.status);

      // Test FARM_ADMIN
      const response2 = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}/avatar`)
        .set('Authorization', `Bearer ${farmAdminToken}`);
      expect([200, 404]).toContain(response2.status);

      // Test SUPER_ADMIN
      const response3 = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}/avatar`)
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404]).toContain(response3.status);
    });

    it('should set correct cache headers', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/${horseId}/avatar`)
        .set('Authorization', `Bearer ${farmUserToken}`);

      if (response.status === 200) {
        expect(response.headers['cache-control']).toBe('public, max-age=3600');
        expect(response.headers['content-type']).toBe('image/jpeg');
      }
    });

    it('should return 404 when horse has no avatar', async () => {
      const response = await request(app)
        .get(`/api/v1/streams/${streamId}/horses/horse-no-avatar/avatar`)
        .set('Authorization', `Bearer ${farmUserToken}`);

      expect([404, 503]).toContain(response.status);
    });
  });

  describe('Horse Registry RBAC Tests', () => {
    const streamId = 'stream-123';
    const horseId = 'horse-456';

    it('should enforce read-only access for FARM_USER on PUT endpoint', async () => {
      await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send({ name: 'New Name' })
        .expect(403);
    });

    it('should allow FARM_ADMIN write access', async () => {
      const response = await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmAdminToken}`)
        .send({ name: 'New Name' });

      expect([200, 404, 503]).toContain(response.status);
    });

    it('should allow SUPER_ADMIN full access', async () => {
      const response = await request(app)
        .put(`/api/v1/streams/${streamId}/horses/${horseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'New Name' });

      expect([200, 404, 503]).toContain(response.status);
    });
  });
});
