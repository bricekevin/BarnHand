import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { UserRole } from '../types/auth';

describe('Detections API', () => {
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

  describe('GET /api/v1/detections', () => {
    it('should query detections with default parameters', async () => {
      const response = await request(app)
        .get('/api/v1/detections')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('detections');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit', 100);
      expect(response.body).toHaveProperty('offset', 0);
      expect(Array.isArray(response.body.detections)).toBe(true);
    });

    it('should filter by stream_id', async () => {
      const streamId = '123e4567-e89b-12d3-a456-426614174100';
      const response = await request(app)
        .get('/api/v1/detections')
        .query({ stream_id: streamId })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.filters.stream_id).toBe(streamId);
    });

    it('should filter by horse_id', async () => {
      const horseId = '123e4567-e89b-12d3-a456-426614174200';
      const response = await request(app)
        .get('/api/v1/detections')
        .query({ horse_id: horseId })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.filters.horse_id).toBe(horseId);
    });

    it('should include pose data when requested', async () => {
      const response = await request(app)
        .get('/api/v1/detections')
        .query({ include_pose: 'true' })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.detections.length > 0) {
        expect(response.body.detections[0]).toHaveProperty('pose_keypoints');
        expect(response.body.detections[0]).toHaveProperty('pose_angles');
      }
    });

    it('should filter by confidence threshold', async () => {
      const response = await request(app)
        .get('/api/v1/detections')
        .query({ confidence_threshold: '0.9' })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.filters.confidence_threshold).toBe(0.9);

      // All returned detections should meet the confidence threshold
      response.body.detections.forEach((detection: any) => {
        expect(detection.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should apply pagination', async () => {
      const response = await request(app)
        .get('/api/v1/detections')
        .query({ limit: '10', offset: '5' })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(5);
    });

    it('should validate datetime format for time filters', async () => {
      await request(app)
        .get('/api/v1/detections')
        .query({ start_time: 'invalid-date' })
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });

    it('should validate limit range', async () => {
      await request(app)
        .get('/api/v1/detections')
        .query({ limit: '2000' }) // Above maximum of 1000
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });

    it('should validate confidence_threshold range', async () => {
      await request(app)
        .get('/api/v1/detections')
        .query({ confidence_threshold: '1.5' }) // Above maximum of 1.0
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });

    it('should reject requests without auth', async () => {
      await request(app).get('/api/v1/detections').expect(401);
    });
  });

  describe('GET /api/v1/detections/chunks/:id/status', () => {
    const chunkId = '123e4567-e89b-12d3-a456-426614174300';

    it('should get chunk status with valid ID and auth', async () => {
      const response = await request(app)
        .get(`/api/v1/detections/chunks/${chunkId}/status`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', chunkId);
      expect(response.body).toHaveProperty('stream_id');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('duration');
      expect(response.body).toHaveProperty('processing_time_ms');
      expect(response.body).toHaveProperty('detections_count');
      expect(response.body).toHaveProperty('horses_detected');
      expect(response.body).toHaveProperty('output_url');
      expect(response.body).toHaveProperty('overlay_url');
    });

    it('should reject invalid UUID format', async () => {
      await request(app)
        .get('/api/v1/detections/chunks/invalid-id/status')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(400);
    });

    it('should reject requests without auth', async () => {
      await request(app)
        .get(`/api/v1/detections/chunks/${chunkId}/status`)
        .expect(401);
    });

    it('should return processing status for active chunks', async () => {
      const response = await request(app)
        .get(`/api/v1/detections/chunks/${chunkId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(['queued', 'processing', 'completed', 'error']).toContain(
        response.body.status
      );
    });

    it('should include timing information', async () => {
      const response = await request(app)
        .get(`/api/v1/detections/chunks/${chunkId}/status`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('start_time');
      expect(response.body).toHaveProperty('end_time');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');
      expect(typeof response.body.duration).toBe('number');
    });

    it('should include output URLs for completed chunks', async () => {
      const response = await request(app)
        .get(`/api/v1/detections/chunks/${chunkId}/status`)
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.status === 'completed') {
        expect(response.body.output_url).toMatch(/\.m3u8$/);
        expect(response.body.overlay_url).toMatch(/\.json$/);
      }
    });
  });

  describe('Detection Data Validation', () => {
    it('should return properly structured detection objects', async () => {
      const response = await request(app)
        .get('/api/v1/detections')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.detections.length > 0) {
        const detection = response.body.detections[0];

        expect(detection).toHaveProperty('time');
        expect(detection).toHaveProperty('stream_id');
        expect(detection).toHaveProperty('chunk_id');
        expect(detection).toHaveProperty('horse_id');
        expect(detection).toHaveProperty('tracking_id');
        expect(detection).toHaveProperty('bbox');
        expect(detection).toHaveProperty('confidence');
        expect(detection).toHaveProperty('processing_time_ms');
        expect(detection).toHaveProperty('model_version');

        // Validate bbox structure
        expect(detection.bbox).toHaveProperty('x');
        expect(detection.bbox).toHaveProperty('y');
        expect(detection.bbox).toHaveProperty('width');
        expect(detection.bbox).toHaveProperty('height');

        // Validate data types
        expect(typeof detection.confidence).toBe('number');
        expect(typeof detection.processing_time_ms).toBe('number');
        expect(detection.confidence).toBeGreaterThanOrEqual(0);
        expect(detection.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include gait and movement data', async () => {
      const response = await request(app)
        .get('/api/v1/detections')
        .set('Authorization', `Bearer ${farmUserToken}`)
        .expect(200);

      if (response.body.detections.length > 0) {
        const detection = response.body.detections[0];

        expect(detection).toHaveProperty('gait_type');
        expect(detection).toHaveProperty('velocity');
        expect(detection).toHaveProperty('acceleration');

        expect(typeof detection.velocity).toBe('number');
        expect(typeof detection.acceleration).toBe('number');
      }
    });
  });
});
