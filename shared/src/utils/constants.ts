// Design system constants (from docs/styles.md)
export const DESIGN_TOKENS = {
  colors: {
    // Core Brand Colors
    forest: {
      900: '#0A1F0D',
      700: '#1A3A1F',
      500: '#2D5016',
      300: '#4A7C2E',
    },
    // Technical Accent Colors
    cyan: {
      500: '#06B6D4',
      400: '#22D3EE',
      300: '#67E8F9',
    },
    // Earth Tones
    amber: {
      600: '#D97706',
      500: '#F59E0B',
      400: '#FBBF24',
    },
    // Neutral Scale
    slate: {
      950: '#020617',
      900: '#0F172A',
      800: '#1E293B',
      700: '#334155',
      600: '#475569',
      400: '#94A3B8',
      200: '#E2E8F0',
      100: '#F1F5F9',
    },
    // Semantic Colors
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#06B6D4',
  },
  fonts: {
    primary: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
    display: ['Sora', 'Inter', 'sans-serif'],
    mono: ['JetBrains Mono', 'SF Mono', 'Monaco', 'monospace'],
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
    '3xl': '4rem',
  },
} as const;

// Horse tracking colors (10 distinctive colors)
export const HORSE_TRACKING_COLORS = [
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

// API endpoints
export const API_ENDPOINTS = {
  // Authentication
  auth: {
    login: '/api/v1/auth/login',
    logout: '/api/v1/auth/logout',
    refresh: '/api/v1/auth/refresh',
    me: '/api/v1/auth/me',
  },
  // Streams
  streams: {
    list: '/api/v1/streams',
    create: '/api/v1/streams',
    get: (id: string) => `/api/v1/streams/${id}`,
    update: (id: string) => `/api/v1/streams/${id}`,
    delete: (id: string) => `/api/v1/streams/${id}`,
    start: (id: string) => `/api/v1/streams/${id}/start`,
    stop: (id: string) => `/api/v1/streams/${id}/stop`,
    processed: (id: string) => `/api/v1/streams/${id}/processed`,
  },
  // Horses
  horses: {
    list: '/api/v1/horses',
    create: '/api/v1/horses',
    get: (id: string) => `/api/v1/horses/${id}`,
    update: (id: string) => `/api/v1/horses/${id}`,
    delete: (id: string) => `/api/v1/horses/${id}`,
    identify: (id: string) => `/api/v1/horses/${id}/identify`,
    timeline: (id: string) => `/api/v1/horses/${id}/timeline`,
    features: (id: string) => `/api/v1/horses/${id}/features`,
  },
  // Detections
  detections: {
    list: '/api/v1/detections',
    get: (id: string) => `/api/v1/detections/${id}`,
    export: '/api/v1/detections/export',
  },
  // Chunks
  chunks: {
    get: (id: string) => `/api/v1/chunks/${id}`,
    status: (id: string) => `/api/v1/chunks/${id}/status`,
  },
  // Analytics
  analytics: {
    metrics: '/api/v1/analytics/metrics',
    export: '/api/v1/analytics/export',
    performance: '/api/v1/analytics/performance',
    timeline: '/api/v1/analytics/timeline',
  },
  // System
  system: {
    health: '/api/v1/system/health',
    metrics: '/api/v1/system/metrics',
    config: '/api/v1/system/config',
  },
} as const;

// WebSocket events
export const WS_EVENTS = {
  // Client -> Server
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  PING: 'ping',
  
  // Server -> Client
  DETECTION_UPDATE: 'detection:update',
  HORSE_IDENTIFIED: 'horse:identified',
  TRACK_LOST: 'track:lost',
  METRICS_UPDATE: 'metrics:update',
  CHUNK_READY: 'chunk:ready',
  STREAM_STATUS: 'stream:status',
  ERROR: 'error',
  PONG: 'pong',
  
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  RECONNECT: 'reconnect',
} as const;

// Model configuration
export const ML_MODELS = {
  yolo: {
    primary: 'yolo11m.pt',
    fallback: 'yolov5m.pt',
    confidence_threshold: 0.5,
    target_fps: 50,
  },
  pose: {
    model: 'rtmpose-m-ap10k.pth',
    keypoints: 17,
    confidence_threshold: 0.3,
  },
  reid: {
    feature_dimension: 512,
    similarity_threshold: 0.7,
  },
} as const;

// Stream processing constants
export const STREAM_PROCESSING = {
  chunk_duration: 10, // seconds
  overlap: 1, // seconds
  default_delay: 20, // seconds
  min_delay: 10,
  max_delay: 120,
  max_streams: 10,
  buffer_size: 30, // seconds
  segment_time: 2, // seconds for HLS
  target_fps: 10,
  batch_size: 8,
} as const;

// Database constants
export const DATABASE = {
  max_connections: 20,
  connection_timeout: 30000,
  idle_timeout: 10000,
  chunk_time_interval: '1 day',
  retention_period: '90 days',
  compression_enabled: true,
  max_feature_history: 100,
  max_pose_history: 100,
} as const;

// File upload limits
export const UPLOAD_LIMITS = {
  max_file_size: 100 * 1024 * 1024, // 100MB
  allowed_video_types: [
    'video/mp4',
    'video/mov',
    'video/avi',
    'video/mkv',
    'video/webm',
  ],
  allowed_image_types: [
    'image/jpeg',
    'image/png',
    'image/webp',
  ],
  max_thumbnail_size: 2 * 1024 * 1024, // 2MB
} as const;

// Performance thresholds
export const PERFORMANCE_THRESHOLDS = {
  ml_inference_fps: 10,
  api_response_time: 1000, // ms
  websocket_latency: 100, // ms
  memory_usage_warning: 80, // %
  cpu_usage_warning: 85, // %
  gpu_usage_warning: 90, // %
  disk_usage_warning: 85, // %
} as const;

// Error codes
export const ERROR_CODES = {
  // Authentication
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  
  // Resources
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  
  // Stream processing
  STREAM_NOT_AVAILABLE: 'STREAM_NOT_AVAILABLE',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  MODEL_LOAD_FAILED: 'MODEL_LOAD_FAILED',
  
  // System
  SYSTEM_OVERLOAD: 'SYSTEM_OVERLOAD',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// Rate limiting
export const RATE_LIMITS = {
  api: {
    requests_per_window: 100,
    window_ms: 15 * 60 * 1000, // 15 minutes
  },
  websocket: {
    connections_per_ip: 10,
    messages_per_minute: 60,
  },
  upload: {
    files_per_hour: 20,
    total_size_per_hour: 500 * 1024 * 1024, // 500MB
  },
} as const;