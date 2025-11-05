import { z } from 'zod';

// Stream source types
export const StreamSourceTypeSchema = z.enum([
  'youtube',
  'rtsp',
  'rtmp',
  'file',
  'webcam',
]);

export const StreamStatusSchema = z.enum([
  'inactive',
  'active',
  'processing',
  'error',
  'reconnecting',
]);

// Stream configuration
export const StreamConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  source_type: StreamSourceTypeSchema,
  source_url: z.string().url(),
  farm_id: z.string().uuid().optional(),
  processing_delay: z.number().int().min(10).max(120).default(30),
  chunk_duration: z.number().int().min(5).max(60).default(10),
  confidence_threshold: z.number().min(0).max(1).default(0.5),
  pose_confidence_threshold: z.number().min(0).max(1).default(0.3),
  enable_pose_detection: z.boolean().default(true),
  enable_tracking: z.boolean().default(true),
  max_horses: z.number().int().min(1).max(20).default(10),
  metadata: z.record(z.unknown()).optional(),
});

// Stream status
export const StreamSchema = StreamConfigSchema.extend({
  status: StreamStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  last_active: z.string().datetime().optional(),
  error_message: z.string().optional(),
  stats: z
    .object({
      uptime_seconds: z.number(),
      frames_processed: z.number(),
      horses_detected: z.number(),
      average_fps: z.number(),
      last_detection: z.string().datetime().optional(),
    })
    .optional(),
});

// Stream creation request
export const CreateStreamRequestSchema = StreamConfigSchema.omit({
  id: true,
});

// Stream update request
export const UpdateStreamRequestSchema = StreamConfigSchema.omit({
  id: true,
  source_type: true,
  source_url: true,
}).partial();

// Video chunk information
export const VideoChunkSchema = z.object({
  id: z.string().uuid(),
  stream_id: z.string().uuid(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  duration_seconds: z.number().positive(),
  status: z.enum(['processing', 'processed', 'failed']),
  original_url: z.string().url().optional(),
  processed_url: z.string().url().optional(),
  overlay_data: z.record(z.unknown()).optional(),
  created_at: z.string().datetime(),
  last_corrected: z.string().datetime().optional(),
  correction_count: z.number().int().nonnegative().default(0),
});

// Export types
export type StreamSourceType = z.infer<typeof StreamSourceTypeSchema>;
export type StreamStatus = z.infer<typeof StreamStatusSchema>;
export type StreamConfig = z.infer<typeof StreamConfigSchema>;
export type Stream = z.infer<typeof StreamSchema>;
export type CreateStreamRequest = z.infer<typeof CreateStreamRequestSchema>;
export type UpdateStreamRequest = z.infer<typeof UpdateStreamRequestSchema>;
export type VideoChunk = z.infer<typeof VideoChunkSchema>;
