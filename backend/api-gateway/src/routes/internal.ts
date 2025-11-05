import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../config/logger';
import { validateSchema } from '../middleware/validation';
import {
  emitHorsesDetected,
  emitReprocessingProgress,
  emitChunkUpdated,
  emitReprocessingError,
} from '../websocket/events';

const router = Router();

// Validation schema for horses detected webhook
const horsesDetectedSchema = z.object({
  streamId: z.string().min(1), // Accept any non-empty string (e.g., stream_001, UUID, etc.)
  horses: z.array(
    z.object({
      id: z.string(),
      tracking_id: z.string(),
      assigned_color: z.string(),
      confidence_score: z.number().min(0).max(1),
      first_detected: z.string().optional(),
      last_seen: z.string(),
      total_detections: z.number().int().min(0),
      thumbnail_url: z.string().optional(),
    })
  ),
});

// Validation schema for reprocessing event webhook
const reprocessingEventSchema = z.object({
  chunk_id: z.string().uuid(),
  event: z.enum([
    'reprocessing:progress',
    'chunk:updated',
    'reprocessing:error',
  ]),
  data: z.object({
    chunk_id: z.string().uuid(),
    progress: z.number().int().min(0).max(100).optional(),
    step: z.string().optional(),
    error: z.string().optional(),
  }),
});

// POST /api/internal/webhooks/horses-detected
// Internal webhook endpoint called by ML service after chunk processing
router.post(
  '/webhooks/horses-detected',
  validateSchema(horsesDetectedSchema),
  async (req, res) => {
    try {
      const { streamId, horses } = req.body;

      logger.info('Received horses detected webhook', {
        streamId,
        horseCount: horses.length,
      });

      // Emit WebSocket event to all clients subscribed to this stream
      emitHorsesDetected(streamId, horses);

      return res.json({ success: true, emitted: horses.length });
    } catch (error: any) {
      logger.error('Horses detected webhook error', {
        error: error.message,
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/internal/webhooks/reprocessing-event
// Internal webhook endpoint called by ML service during chunk re-processing
router.post(
  '/webhooks/reprocessing-event',
  validateSchema(reprocessingEventSchema),
  async (req, res) => {
    try {
      const { chunk_id, event, data } = req.body;

      logger.debug('Received reprocessing event webhook', {
        chunkId: chunk_id,
        event,
        data,
      });

      // Emit appropriate WebSocket event based on event type
      switch (event) {
        case 'reprocessing:progress':
          emitReprocessingProgress(chunk_id, {
            progress: data.progress || 0,
            step: data.step || '',
          });
          break;

        case 'chunk:updated':
          emitChunkUpdated(chunk_id);
          break;

        case 'reprocessing:error':
          emitReprocessingError(chunk_id, data.error || 'Unknown error');
          break;

        default:
          logger.warn('Unknown reprocessing event type', { event });
      }

      return res.json({ success: true, event });
    } catch (error: any) {
      logger.error('Reprocessing event webhook error', {
        error: error.message,
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
