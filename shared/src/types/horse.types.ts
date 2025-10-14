import { z } from 'zod';

// Horse tracking colors (matches design system)
export const HorseTrackingColors = [
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#84CC16', // Lime
  '#EF4444', // Red
] as const;

// Horse identification status
export const HorseStatusSchema = z.enum([
  'unidentified',
  'identified',
  'confirmed',
  'disputed',
]);

// Horse metadata
export const HorseSchema = z.object({
  id: z.string().uuid(),
  farm_id: z.string().uuid().optional(),
  stream_id: z.string().uuid().optional(),
  name: z.string().min(1).max(255).optional(),
  breed: z.string().max(100).optional(),
  age: z.number().int().min(0).max(50).optional(),
  color: z.string().max(50).optional(),
  markings: z.string().max(1000).optional(),
  tracking_id: z.string().max(50),
  assigned_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  status: HorseStatusSchema,
  confidence_score: z.number().min(0).max(1),
  first_detected: z.string().datetime(),
  last_seen: z.string().datetime(),
  total_detections: z.number().int().min(0).default(0),
  thumbnail_url: z.string().url().optional(),
  avatar_thumbnail: z.string().optional(), // base64 encoded JPEG
  feature_vector: z.array(z.number()).length(512).optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Horse identification request
export const IdentifyHorseRequestSchema = z.object({
  name: z.string().min(1).max(255),
  breed: z.string().max(100).optional(),
  age: z.number().int().min(0).max(50).optional(),
  color: z.string().max(50).optional(),
  markings: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Horse feature for re-identification
export const HorseFeatureSchema = z.object({
  id: z.string().uuid(),
  horse_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  feature_vector: z.array(z.number()).length(512),
  confidence: z.number().min(0).max(1),
  image_snapshot: z.string().optional(), // base64 or URL
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});

// Horse appearance history
export const HorseAppearanceSchema = z.object({
  timestamp: z.string().datetime(),
  stream_id: z.string().uuid(),
  bbox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    confidence: z.number().min(0).max(1),
  }),
  thumbnail_url: z.string().url().optional(),
  features: z.array(z.number()).length(512).optional(),
  pose_data: z.record(z.unknown()).optional(),
});

// Horse tracking statistics
export const HorseStatsSchema = z.object({
  horse_id: z.string().uuid(),
  stream_id: z.string().uuid(),
  time_range: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  total_detections: z.number().int().min(0),
  average_confidence: z.number().min(0).max(1),
  time_visible: z.number().min(0), // seconds
  activity_level: z.enum(['low', 'medium', 'high']),
  dominant_location: z
    .object({
      x: z.number(),
      y: z.number(),
      confidence: z.number().min(0).max(1),
    })
    .optional(),
  movement_patterns: z.array(z.string()).optional(),
  health_indicators: z.record(z.unknown()).optional(),
});

// Export types
export type Horse = z.infer<typeof HorseSchema>;
export type HorseStatus = z.infer<typeof HorseStatusSchema>;
export type IdentifyHorseRequest = z.infer<typeof IdentifyHorseRequestSchema>;
export type HorseFeature = z.infer<typeof HorseFeatureSchema>;
export type HorseAppearance = z.infer<typeof HorseAppearanceSchema>;
export type HorseStats = z.infer<typeof HorseStatsSchema>;

// Helper type for tracking colors
export type HorseTrackingColor = (typeof HorseTrackingColors)[number];
