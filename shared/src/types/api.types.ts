import { z } from 'zod';

// Standard API response wrapper
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.string().datetime(),
  request_id: z.string().uuid().optional(),
});

// Paginated response
export const PaginatedResponseSchema = z.object({
  data: z.array(z.unknown()),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(1000),
    total: z.number().int().min(0),
    pages: z.number().int().min(0),
    has_next: z.boolean(),
    has_prev: z.boolean(),
  }),
  success: z.boolean(),
  message: z.string().optional(),
  timestamp: z.string().datetime(),
});

// Error response
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  error_code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
  request_id: z.string().uuid().optional(),
});

// Health check response
export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.string().datetime(),
  uptime: z.number().positive(),
  services: z.record(
    z.object({
      status: z.enum(['up', 'down', 'degraded']),
      latency_ms: z.number().optional(),
      last_check: z.string().datetime(),
      error: z.string().optional(),
    })
  ),
});

// WebSocket message types
export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  // Client messages
  z.object({
    type: z.literal('subscribe'),
    stream_id: z.string().uuid(),
    channels: z.array(z.enum(['detections', 'poses', 'metrics', 'alerts'])),
    request_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('unsubscribe'),
    stream_id: z.string().uuid(),
    channels: z.array(z.string()).optional(),
    request_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('ping'),
    timestamp: z.string().datetime(),
    request_id: z.string().uuid().optional(),
  }),

  // Server messages
  z.object({
    type: z.literal('detection:update'),
    stream_id: z.string().uuid(),
    data: z.record(z.unknown()),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('horse:identified'),
    stream_id: z.string().uuid(),
    horse_id: z.string().uuid(),
    data: z.record(z.unknown()),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('metrics:update'),
    stream_id: z.string().uuid(),
    horse_id: z.string().uuid().optional(),
    data: z.record(z.unknown()),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('chunk:ready'),
    stream_id: z.string().uuid(),
    chunk_id: z.string().uuid(),
    data: z.record(z.unknown()),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
    error_code: z.string().optional(),
    request_id: z.string().uuid().optional(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('pong'),
    timestamp: z.string().datetime(),
    request_id: z.string().uuid().optional(),
  }),
]);

// Authentication schemas
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  remember_me: z.boolean().default(false),
});

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().positive(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(['admin', 'manager', 'viewer']),
    name: z.string().optional(),
  }),
});

export const RefreshTokenRequestSchema = z.object({
  refresh_token: z.string(),
});

// User management schemas
export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'manager', 'viewer']).default('viewer'),
  name: z.string().min(1).optional(),
});

export const UpdateUserRequestSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'manager', 'viewer']).optional(),
  password: z.string().min(8).optional(),
});

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'viewer']),
  name: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  last_login: z.string().datetime().optional(),
});

// Query parameters for lists
export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
  filter: z.record(z.string()).optional(),
});

// Analytics query parameters
export const AnalyticsQuerySchema = z.object({
  stream_id: z.string().uuid().optional(),
  horse_id: z.string().uuid().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  granularity: z.enum(['minute', 'hour', 'day', 'week', 'month']).default('hour'),
  metrics: z.array(z.string()).optional(),
});

// System metrics
export const SystemMetricsSchema = z.object({
  timestamp: z.string().datetime(),
  cpu_usage: z.number().min(0).max(100),
  memory_usage: z.number().min(0).max(100),
  disk_usage: z.number().min(0).max(100),
  network_io: z.object({
    bytes_sent: z.number().min(0),
    bytes_received: z.number().min(0),
  }),
  active_streams: z.number().int().min(0),
  processing_queue_size: z.number().int().min(0),
  ml_inference_rate: z.number().min(0), // fps
  gpu_usage: z.number().min(0).max(100).optional(),
  gpu_memory: z.number().min(0).max(100).optional(),
});

// Export types
export type ApiResponse<T = unknown> = z.infer<typeof ApiResponseSchema> & {
  data?: T;
};
export type PaginatedResponse<T = unknown> = Omit<
  z.infer<typeof PaginatedResponseSchema>,
  'data'
> & { data: T[] };
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type User = z.infer<typeof UserSchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;
export type SystemMetrics = z.infer<typeof SystemMetricsSchema>;