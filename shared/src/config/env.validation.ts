import { z } from 'zod';

// Database configuration schema
export const DatabaseConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_SSL: z.coerce.boolean().default(false),
});

// Redis configuration schema
export const RedisConfigSchema = z.object({
  REDIS_URL: z.string().url(),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
});

// Service ports schema
export const ServicePortsSchema = z.object({
  API_GATEWAY_PORT: z.coerce.number().int().min(1000).max(65535),
  STREAM_SERVICE_PORT: z.coerce.number().int().min(1000).max(65535),
  ML_SERVICE_PORT: z.coerce.number().int().min(1000).max(65535),
  VIDEO_STREAMER_PORT: z.coerce.number().int().min(1000).max(65535),
  FRONTEND_PORT: z.coerce.number().int().min(1000).max(65535),
});

// ML configuration schema
export const MLConfigSchema = z.object({
  ML_DEVICE: z.enum(['cpu', 'cuda']).default('cpu'),
  MODEL_PATH: z.string().min(1),
  YOLO_MODEL_PATH: z.string().min(1),
  YOLOV5_MODEL_PATH: z.string().min(1),
  RTMPOSE_MODEL_PATH: z.string().min(1),
  BATCH_SIZE: z.coerce.number().int().min(1).max(32).default(8),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  POSE_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  MAX_FPS_TARGET: z.coerce.number().int().min(1).max(120).default(50),
});

// Stream processing schema
export const StreamProcessingConfigSchema = z.object({
  CHUNK_DURATION: z.coerce.number().int().min(5).max(60).default(10),
  PROCESSING_DELAY: z.coerce.number().int().min(10).max(120).default(20),
  MAX_CONCURRENT_STREAMS: z.coerce.number().int().min(1).max(50).default(10),
  STREAM_BUFFER_SIZE: z.coerce.number().int().min(10).max(300).default(30),
  HLS_SEGMENT_TIME: z.coerce.number().int().min(1).max(10).default(2),
  VIDEO_FOLDER: z.string().min(1),
  STREAM_COUNT: z.coerce.number().int().min(1).max(20).default(5),
});

// Security schema
export const SecurityConfigSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().min(1),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url(),
  RATE_LIMIT_REQUESTS: z.coerce.number().int().min(1).max(1000).default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().int().min(1).max(60).default(15),
});

// Environment type
export const EnvironmentSchema = z.enum(['development', 'production', 'test']);

// Complete configuration schema
export const ConfigSchema = z.object({
  NODE_ENV: EnvironmentSchema.default('development'),
  ...DatabaseConfigSchema.shape,
  ...RedisConfigSchema.shape,
  ...ServicePortsSchema.shape,
  ...MLConfigSchema.shape,
  ...StreamProcessingConfigSchema.shape,
  ...SecurityConfigSchema.shape,
});

export type Config = z.infer<typeof ConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type MLConfig = z.infer<typeof MLConfigSchema>;
export type StreamProcessingConfig = z.infer<typeof StreamProcessingConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

// Configuration validation function
export function validateConfig(env: Record<string, string | undefined>): Config {
  try {
    return ConfigSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(
        (issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`
      );
      throw new Error(
        `Configuration validation failed:\n${issues.join('\n')}`
      );
    }
    throw error;
  }
}

// Environment-specific configurations
export const developmentDefaults = {
  LOG_LEVEL: 'debug',
  DEBUG: 'barnhand:*',
  HOT_RELOAD: true,
  WATCH_FILES: true,
};

export const productionDefaults = {
  LOG_LEVEL: 'info',
  DEBUG: '',
  HOT_RELOAD: false,
  WATCH_FILES: false,
  DATABASE_SSL: true,
  HELMET_ENABLED: true,
  RATE_LIMIT_ENABLED: true,
};