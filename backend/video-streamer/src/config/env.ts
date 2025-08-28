import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8003),
  
  // Media Configuration
  MEDIA_PATH: z.string().default('/Users/kevinbrice/GIT/BarnHand/media'),
  OUTPUT_PATH: z.string().default('/tmp/barnhand/streams'),
  
  // FFmpeg Configuration
  FFMPEG_BINARY: z.string().default('ffmpeg'),
  SEGMENT_DURATION: z.coerce.number().default(2), // HLS segment duration in seconds
  PLAYLIST_SIZE: z.coerce.number().default(6), // Keep 6 segments in playlist
  
  // Stream Configuration
  MAX_STREAMS: z.coerce.number().default(10),
  VIDEO_QUALITY: z.enum(['720p', '1080p', '480p']).default('720p'),
  FRAME_RATE: z.coerce.number().default(30),
  BITRATE: z.string().default('2M'), // 2 Mbps
  
  // Health Check Configuration
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