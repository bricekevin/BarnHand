import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8001),
  
  // Chunk Processing Configuration
  CHUNK_DURATION: z.coerce.number().default(10), // seconds
  CHUNK_OVERLAP: z.coerce.number().default(1), // seconds overlap
  PROCESSING_DELAY: z.coerce.number().default(20), // seconds delay before serving
  
  // Storage Configuration
  CHUNK_OUTPUT_PATH: z.string().default('/tmp/barnhand/chunks'),
  PROCESSED_OUTPUT_PATH: z.string().default('/tmp/barnhand/processed'),
  CHUNK_RETENTION_HOURS: z.coerce.number().default(24),
  
  // FFmpeg Configuration
  FFMPEG_BINARY: z.string().default('ffmpeg'),
  VIDEO_QUALITY: z.enum(['720p', '1080p', '480p']).default('720p'),
  
  // Queue Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),
  QUEUE_CONCURRENCY: z.coerce.number().default(3),
  MAX_QUEUE_SIZE: z.coerce.number().default(1000),
  
  // Service URLs
  ML_SERVICE_URL: z.string().url().default('http://localhost:8002'),
  VIDEO_STREAMER_URL: z.string().url().default('http://localhost:8003'),
  
  // Health Configuration
  HEALTH_CHECK_INTERVAL: z.coerce.number().default(30000), // 30 seconds
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
});

export type Environment = z.infer<typeof envSchema>;

let env: Environment;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Invalid environment configuration:', error);
  process.exit(1);
}

export { env };

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';