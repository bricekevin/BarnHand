import { z } from 'zod';

// Bounding box schema
export const BoundingBoxSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  confidence: z.number().min(0).max(1),
});

// Pose keypoint schema
export const KeypointSchema = z.object({
  x: z.number(),
  y: z.number(),
  confidence: z.number().min(0).max(1),
  visible: z.boolean().default(true),
});

// RTMPose AP10K keypoint names (17 points for animal pose)
export const AnimalKeypointNames = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

// Pose schema with 17 keypoints
export const PoseSchema = z.object({
  keypoints: z.array(KeypointSchema).length(17),
  overall_confidence: z.number().min(0).max(1),
  bbox: BoundingBoxSchema.optional(),
});

// Gait classification
export const GaitTypeSchema = z.enum(['walk', 'trot', 'canter', 'gallop', 'stationary', 'unknown']);

// Movement metrics
export const MovementMetricsSchema = z.object({
  velocity: z.number().min(0).optional(), // pixels per second
  acceleration: z.number().optional(),
  direction: z.number().min(0).max(360).optional(), // degrees
  gait_type: GaitTypeSchema.optional(),
  step_frequency: z.number().min(0).optional(), // steps per second
  stride_length: z.number().min(0).optional(), // pixels
  body_angles: z
    .object({
      head_neck: z.number().optional(),
      neck_back: z.number().optional(),
      back_hip: z.number().optional(),
      front_leg: z.number().optional(),
      rear_leg: z.number().optional(),
    })
    .optional(),
  symmetry_score: z.number().min(0).max(1).optional(),
  activity_level: z.enum(['resting', 'low', 'medium', 'high', 'intense']).optional(),
});

// Detection result for a single horse
export const HorseDetectionSchema = z.object({
  id: z.string().uuid().optional(), // Horse ID if identified
  tracking_id: z.string(), // Temporary tracking ID
  bbox: BoundingBoxSchema,
  confidence: z.number().min(0).max(1),
  pose: PoseSchema.optional(),
  feature_vector: z.array(z.number()).length(512).optional(),
  metrics: MovementMetricsSchema.optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), // Assigned tracking color
  is_new: z.boolean().default(false),
  occlusion_ratio: z.number().min(0).max(1).optional(),
  quality_score: z.number().min(0).max(1).optional(),
  horse_name: z.string().optional(), // Horse name from registry (Phase 3)
});

// Frame detection result
export const FrameDetectionSchema = z.object({
  frame_idx: z.number().int().min(0),
  timestamp: z.number().min(0), // seconds from start
  horses: z.array(HorseDetectionSchema),
  total_horses: z.number().int().min(0),
  processing_time_ms: z.number().positive().optional(),
  model_version: z.string().optional(),
});

// Detection event for real-time streaming
export const DetectionEventSchema = z.object({
  event_type: z.enum(['detection:update', 'horse:identified', 'track:lost', 'metrics:update']),
  stream_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  data: FrameDetectionSchema.or(z.record(z.unknown())),
});

// Chunk processing result
export const ChunkProcessingResultSchema = z.object({
  chunk_id: z.string().uuid(),
  stream_id: z.string().uuid(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  fps: z.number().positive(),
  frame_count: z.number().int().positive(),
  frames: z.array(FrameDetectionSchema),
  summary: z.object({
    unique_horses: z.number().int().min(0),
    total_detections: z.number().int().min(0),
    average_confidence: z.number().min(0).max(1),
    processing_time_ms: z.number().positive(),
    errors: z.array(z.string()).optional(),
  }),
  interpolated: z.boolean().default(false),
});

// Detection query parameters
export const DetectionQuerySchema = z.object({
  stream_id: z.string().uuid(),
  horse_id: z.string().uuid().optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
  include_pose: z.boolean().default(true),
  include_metrics: z.boolean().default(true),
  min_confidence: z.number().min(0).max(1).default(0.5),
});

// Historical detection record
export const DetectionRecordSchema = z.object({
  id: z.string().uuid(),
  stream_id: z.string().uuid(),
  horse_id: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  bbox: BoundingBoxSchema,
  pose_keypoints: z.array(KeypointSchema).optional(),
  confidence: z.number().min(0).max(1),
  metrics: MovementMetricsSchema.optional(),
  feature_vector: z.array(z.number()).length(512).optional(),
  tracking_id: z.string(),
  chunk_id: z.string().uuid().optional(),
});

// Export types
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type Keypoint = z.infer<typeof KeypointSchema>;
export type Pose = z.infer<typeof PoseSchema>;
export type GaitType = z.infer<typeof GaitTypeSchema>;
export type MovementMetrics = z.infer<typeof MovementMetricsSchema>;
export type HorseDetection = z.infer<typeof HorseDetectionSchema>;
export type FrameDetection = z.infer<typeof FrameDetectionSchema>;
export type DetectionEvent = z.infer<typeof DetectionEventSchema>;
export type ChunkProcessingResult = z.infer<typeof ChunkProcessingResultSchema>;
export type DetectionQuery = z.infer<typeof DetectionQuerySchema>;
export type DetectionRecord = z.infer<typeof DetectionRecordSchema>;

// Helper types
export type AnimalKeypointName = (typeof AnimalKeypointNames)[number];

// Constants for keypoint connections (for drawing skeleton)
export const KEYPOINT_CONNECTIONS = [
  ['nose', 'left_eye'],
  ['nose', 'right_eye'],
  ['left_eye', 'left_ear'],
  ['right_eye', 'right_ear'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
] as const;