import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { UserRole } from '../types/auth';

describe('Horses API', () => {
  let authToken: string;
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

  describe('GET /api/v1/horses', () => {
    it('should list horses with valid auth', async () => {
      const response = await request(app)
        .get('/api/v1/horses')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('horses');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.horses)).toBe(true);
    });

    it('should filter horses by farm for non-super-admin users', async () => {
      const response = await request(app)
        .get('/api/v1/horses')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.horses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            farm_id: '123e4567-e89b-12d3-a456-426614174010',
          }),
        ])
      );
    });

    it('should return properly structured horse objects', async () => {
      const response = await request(app)
        .get('/api/v1/horses')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.horses.length > 0) {
        const horse = response.body.horses[0];

        expect(horse).toHaveProperty('id');
        expect(horse).toHaveProperty('farm_id');
        expect(horse).toHaveProperty('name');
        expect(horse).toHaveProperty('description');
        expect(horse).toHaveProperty('tracking_id');
        expect(horse).toHaveProperty('color_assignment');
        expect(horse).toHaveProperty('last_seen');
        expect(horse).toHaveProperty('detection_count');
        expect(horse).toHaveProperty('metadata');
        expect(horse).toHaveProperty('created_at');
        expect(horse).toHaveProperty('updated_at');

        // Validate data types
        expect(typeof horse.detection_count).toBe('number');
        expect(typeof horse.metadata).toBe('object');
        expect(horse.color_assignment).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('should reject requests without auth', async () => {
      await request(app).get('/api/v1/horses').expect(401);
    });

    it('should allow super admin to query specific farm', async () => {
      const farmId = '123e4567-e89b-12d3-a456-426614174010';
      const response = await request(app)
        .get('/api/v1/horses')
        .query({ farm_id: farmId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Super admin should be able to filter by any farm
      response.body.horses.forEach((horse: any) => {
        expect(horse.farm_id).toBe(farmId);
      });
    });
  });

  describe('GET /api/v1/horses/:id', () => {
    const horseId = '123e4567-e89b-12d3-a456-426614174200';

    it('should get specific horse with valid ID and auth', async () => {
      const response = await request(app)
        .get(`/api/v1/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', horseId);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('tracking_id');
      expect(response.body).toHaveProperty('color_assignment');
    });

    it('should reject invalid UUID format', async () => {
      await request(app)
        .get('/api/v1/horses/invalid-id')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });

    it('should check farm access for non-super-admin users', async () => {
      const response = await request(app)
        .get(`/api/v1/horses/${horseId}`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      // Mock data should belong to the same farm as the user
      expect(response.body.farm_id).toBe(
        '123e4567-e89b-12d3-a456-426614174010'
      );
    });

    it('should reject requests without auth', async () => {
      await request(app).get(`/api/v1/horses/${horseId}`).expect(401);
    });
  });

  describe('POST /api/v1/horses/:id/identify', () => {
    const horseId = '123e4567-e89b-12d3-a456-426614174200';

    const validIdentificationData = {
      name: 'Thunder',
      description: 'Bay stallion, main breeding horse',
      metadata: { breed: 'Thoroughbred', age: 8 },
    };

    it('should identify horse with valid data and auth', async () => {
      const response = await request(app)
        .post(`/api/v1/horses/${horseId}/identify`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send(validIdentificationData)
        .expect(200);

      expect(response.body).toHaveProperty(
        'message',
        'Horse identified successfully'
      );
      expect(response.body.horse).toHaveProperty('id', horseId);
      expect(response.body.horse).toHaveProperty(
        'name',
        validIdentificationData.name
      );
      expect(response.body.horse).toHaveProperty(
        'description',
        validIdentificationData.description
      );
      expect(response.body.horse).toHaveProperty('identified_by');
      expect(response.body.horse).toHaveProperty('identified_at');
    });

    it('should reject identification with invalid data', async () => {
      await request(app)
        .post(`/api/v1/horses/${horseId}/identify`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send({ name: '' }) // Invalid: empty name
        .expect(400);
    });

    it('should reject identification with name too long', async () => {
      await request(app)
        .post(`/api/v1/horses/${horseId}/identify`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send({
          name: 'a'.repeat(101), // Too long: over 100 characters
        })
        .expect(400);
    });

    it('should reject identification with description too long', async () => {
      await request(app)
        .post(`/api/v1/horses/${horseId}/identify`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send({
          name: 'Valid Name',
          description: 'a'.repeat(501), // Too long: over 500 characters
        })
        .expect(400);
    });

    it('should accept identification without optional fields', async () => {
      const response = await request(app)
        .post(`/api/v1/horses/${horseId}/identify`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send({ name: 'Simple Name' })
        .expect(200);

      expect(response.body.horse.name).toBe('Simple Name');
    });

    it('should reject invalid UUID format', async () => {
      await request(app)
        .post('/api/v1/horses/invalid-id/identify')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .send(validIdentificationData)
        .expect(400);
    });

    it('should reject requests without auth', async () => {
      await request(app)
        .post(`/api/v1/horses/${horseId}/identify`)
        .send(validIdentificationData)
        .expect(401);
    });
  });

  describe('GET /api/v1/horses/:id/timeline', () => {
    const horseId = '123e4567-e89b-12d3-a456-426614174200';

    it('should get horse timeline with default parameters', async () => {
      const response = await request(app)
        .get(`/api/v1/horses/${horseId}/timeline`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('horseId', horseId);
      expect(response.body).toHaveProperty('timeRange', '24 hours');
      expect(response.body).toHaveProperty('detections');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.detections)).toBe(true);
    });

    it('should accept custom time range', async () => {
      const response = await request(app)
        .get(`/api/v1/horses/${horseId}/timeline`)
        .query({ hours: '48' })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.timeRange).toBe('48 hours');
    });

    it('should include pose data when requested', async () => {
      const response = await request(app)
        .get(`/api/v1/horses/${horseId}/timeline`)
        .query({ include_pose: 'true' })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.detections.length > 0) {
        expect(response.body.detections[0]).toHaveProperty('pose_keypoints');
      }
    });

    it('should validate hours range', async () => {
      await request(app)
        .get(`/api/v1/horses/${horseId}/timeline`)
        .query({ hours: '200' }) // Above maximum of 168 (7 days)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);

      await request(app)
        .get(`/api/v1/horses/${horseId}/timeline`)
        .query({ hours: '0' }) // Below minimum of 1
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });

    it('should return properly structured timeline data', async () => {
      const response = await request(app)
        .get(`/api/v1/horses/${horseId}/timeline`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.detections.length > 0) {
        const detection = response.body.detections[0];

        expect(detection).toHaveProperty('time');
        expect(detection).toHaveProperty('stream_id');
        expect(detection).toHaveProperty('bbox');
        expect(detection).toHaveProperty('confidence');
        expect(detection).toHaveProperty('gait_type');
        expect(detection).toHaveProperty('velocity');

        // Validate bbox structure
        expect(detection.bbox).toHaveProperty('x');
        expect(detection.bbox).toHaveProperty('y');
        expect(detection.bbox).toHaveProperty('width');
        expect(detection.bbox).toHaveProperty('height');

        // Validate data types
        expect(typeof detection.confidence).toBe('number');
        expect(typeof detection.velocity).toBe('number');
        expect(detection.confidence).toBeGreaterThanOrEqual(0);
        expect(detection.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should reject invalid UUID format', async () => {
      await request(app)
        .get('/api/v1/horses/invalid-id/timeline')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });

    it('should reject requests without auth', async () => {
      await request(app).get(`/api/v1/horses/${horseId}/timeline`).expect(401);
    });
  });

  describe('Horse Registry Features', () => {
    it('should include tracking and identification data', async () => {
      const response = await request(app)
        .get('/api/v1/horses')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.horses.length > 0) {
        const horse = response.body.horses[0];

        expect(horse).toHaveProperty('tracking_id');
        expect(horse).toHaveProperty('color_assignment');
        expect(horse).toHaveProperty('last_seen');
        expect(horse).toHaveProperty('detection_count');

        expect(typeof horse.tracking_id).toBe('string');
        expect(horse.color_assignment).toMatch(/^#[0-9a-f]{6}$/i);
        expect(typeof horse.detection_count).toBe('number');
      }
    });

    it('should include metadata for breeding and management', async () => {
      const response = await request(app)
        .get('/api/v1/horses')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.horses.length > 0) {
        const horse = response.body.horses[0];

        expect(horse).toHaveProperty('metadata');
        expect(typeof horse.metadata).toBe('object');

        // Mock data should include breed and age
        if (horse.metadata.breed) {
          expect(typeof horse.metadata.breed).toBe('string');
        }
        if (horse.metadata.age) {
          expect(typeof horse.metadata.age).toBe('number');
        }
      }
    });
  });
});
