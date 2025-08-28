import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(8000),

  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Database Configuration
  DATABASE_URL: z.string().url().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(1000),

  // CORS Configuration
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Service URLs
  STREAM_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8002'),
  VIDEO_STREAMER_URL: z.string().url().default('http://localhost:8003'),

  // Redis Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
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
