import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../config/logger';
import { validateSchema } from '../middleware/validation';
import { emitHorsesDetected } from '../websocket/events';

const router = Router();

// Validation schema for horses detected webhook
const horsesDetectedSchema = z.object({
  streamId: z.string().uuid(),
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

export default router;
