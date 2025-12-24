# Horse Streaming Platform - System Architecture

## 1. High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                         │
├───────────────┬─────────────────┬──────────────────────────┤
│  React Web App  │  Mobile Apps  │   Admin Dashboard        │
│  + WebSocket    │               │                          │
└───────┬───────────┴───────┬───────┴────────┬────────────────┘
        │                   │                 │
        ▼                   ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                API GATEWAY + WEBSOCKET SERVER                │
│               (Express.js + Socket.io)                      │
└───────┬────────────────────┬────────────────┬───────────────┘
        │                    │                │
        ▼                    ▼                ▼
┌──────────────┐    ┌──────────────┐   ┌──────────────┐
│ Stream Service│    │  ML Service  │   │Video Streamer│
│  (Node.js)    │    │  (Python)    │   │  (FFmpeg)    │
│  + WebSocket  │    │ + WebSocket  │   │              │
└───────┬──────┘    └──────┬───────┘   └──────┬───────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐    ┌──────────────┐   ┌──────────────┐
│   Database   │    │Message Queue │   │ Media Storage│
│ (PostgreSQL  │    │ + WebSocket  │   │    (Local)   │
│ +TimescaleDB)│    │   Events     │   │              │
└──────────────┘    └──────────────┘   └──────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                      VIDEO SOURCES                           │
├──────────────┬──────────────────┬───────────────────────────┤
│  Local Videos │   IP Cameras     │    Future: Live Streams  │
│   (MP4/MOV)   │     (RTSP)       │     (YouTube/Twitch)     │
└──────────────┴──────────────────┴───────────────────────────┘
```

## 2. Component Architecture

### 2.1 Frontend Architecture

```typescript
// Component Structure
src/
├── components/
│   ├── streaming/
│   │   ├── VideoPlayer.tsx
│   │   ├── StreamGrid.tsx
│   │   ├── OverlayCanvas.tsx
│   │   └── DetectionOverlay.tsx
│   ├── controls/
│   │   ├── ModelSelector.tsx
│   │   ├── StreamControls.tsx
│   │   └── AlertSettings.tsx
│   └── analytics/
│       ├── Timeline.tsx
│       ├── MetricsPanel.tsx
│       └── HorseProfile.tsx
├── services/
│   ├── streamService.ts
│   ├── mlService.ts
│   └── websocketService.ts
├── stores/
│   ├── streamStore.ts
│   ├── detectionStore.ts
│   └── uiStore.ts
└── utils/
    ├── videoProcessing.ts
    ├── overlayRenderer.ts
    └── poseCalculations.ts
```

### 2.2 Backend Microservices

#### Stream Ingestion Service

```javascript
// Node.js + Express Service Structure
class StreamIngestionService {
  // YouTube Integration
  async connectYouTubeStream(streamUrl) {
    // YouTube API integration
    // Stream quality negotiation
    // Buffering and forwarding
  }

  // Camera Integration
  async connectIPCamera(rtspUrl) {
    // RTSP/RTMP connection
    // Stream transcoding
    // WebRTC negotiation
  }

  // Stream Management
  async manageStreamLifecycle() {
    // Connection monitoring
    // Automatic reconnection
    // Quality adaptation
  }
}
```

#### ML Processing Pipeline

```python
# Python FastAPI Service Structure
class MLProcessingPipeline:
    def __init__(self):
        self.yolo_model = self.load_yolo_model()
        self.pose_model = self.load_rtmpose_model()
        self.frame_buffer = FrameBuffer(max_delay=30)

    async def process_frame(self, frame):
        # Frame preprocessing
        preprocessed = self.preprocess_frame(frame)

        # Horse detection
        detections = await self.detect_horses(preprocessed)

        # Pose estimation for each horse
        poses = await self.estimate_poses(detections)

        # Calculate metrics
        metrics = self.calculate_metrics(poses)

        return {
            'detections': detections,
            'poses': poses,
            'metrics': metrics,
            'timestamp': time.time()
        }

    def detect_horses(self, frame):
        # YOLOv5 inference
        return self.yolo_model(frame)

    def estimate_poses(self, detections):
        # RTMPose inference
        poses = []
        for detection in detections:
            pose = self.pose_model(detection.crop)
            poses.append(pose)
        return poses
```

### 2.3 WebSocket Real-time Communication Architecture

```typescript
// WebSocket Event Flow
┌─────────────┐    WebSocket     ┌─────────────────┐    Events    ┌─────────────┐
│   React     │◄──────────────► │  API Gateway    │◄────────────► │   Backend   │
│   Client    │    Socket.io     │  WebSocket      │   Message     │  Services   │
│             │                  │    Server       │    Queue      │             │
└─────────────┘                  └─────────────────┘              └─────────────┘
       │                                   │                             │
       │ - detection:update                │ - Room management           │
       │ - chunk:processed                 │ - Authentication            │
       │ - metrics:update                  │ - Message queuing           │
       │ - stream:status                   │ - Connection tracking       │
       │ - horse:update                    │ - Auto-reconnection        │
       │                                   │                             │
       └─── Connection Status UI ──────────┘                             │
                                                                         │
// Real-time Data Flow                                                   │
┌─────────────┐    Process      ┌─────────────┐    Emit Event  ┌─────────▼─────┐
│  ML Service │───────────────► │   Stream    │──────────────► │   WebSocket   │
│  Detection  │    Chunk        │  Service    │   via API      │    Server     │
│   Results   │                 │             │                │               │
└─────────────┘                 └─────────────┘                └───────────────┘
                                                                        │
                                                              Broadcast │
                                                                        ▼
                                                              ┌─────────────────┐
                                                              │ Subscribed Clients│
                                                              │  - Farm rooms     │
                                                              │  - Stream rooms   │
                                                              │  - User sessions  │
                                                              └─────────────────┘
```

#### WebSocket Server Implementation

```typescript
class WebSocketServer {
  private io: Server;
  private connections: Map<string, ExtendedSocket> = new Map();
  private streamRooms: Map<string, Set<string>> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();

  // Authentication middleware
  private setupAuthentication() {
    this.io.use(async (socket, next) => {
      const token = socket.handshake.auth.token;
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.data.user = decoded;
      next();
    });
  }

  // Room-based subscriptions
  public async subscribeToStream(socket: Socket, streamId: string) {
    await socket.join(`stream:${streamId}`);
    this.streamRooms.get(`stream:${streamId}`)?.add(socket.id);
  }

  // Event broadcasting
  public emitDetectionUpdate(streamId: string, detection: any) {
    this.io.to(`stream:${streamId}`).emit('detection:update', {
      streamId,
      detection,
      timestamp: new Date().toISOString(),
    });
  }
}
```

#### Frontend WebSocket Integration

```typescript
class WebSocketService {
  private socket: Socket | null = null;
  private connectionStatus:
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'error';
  private reconnectTimer?: NodeJS.Timeout;
  private subscribedStreams: Set<string> = new Set();

  // Auto-reconnection with exponential backoff
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(wsUrl, {
        auth: { token: localStorage.getItem('authToken') },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });

      this.socket.on('connect', () => {
        this.updateConnectionStatus('connected');
        this.resubscribeToStreams();
        resolve();
      });
    });
  }

  // Event handling
  private setupEventHandlers() {
    this.socket?.on('detection:update', data => {
      const store = useAppStore.getState();
      store.addDetections([data.detection]);
    });
  }
}
```

### 2.4 Data Pipeline Architecture

```yaml
# Data Flow Pipeline with Chunk Processing
pipeline:
  ingestion:
    - source: video_stream
    - protocol: WebRTC/HLS
    - chunk_size: 10_seconds # Process in chunks
    - buffer_size: 30_seconds

  youtube_mitigation:
    - strategy_1:
        name: proxy_rotation
        proxies: [proxy1, proxy2, proxy3]
        rotation_interval: 300_seconds
    - strategy_2:
        name: stream_caching
        cache_duration: 60_seconds
        rebroadcast: true
    - strategy_3:
        name: cookie_auth
        tool: yt-dlp
        cookies_file: /config/youtube_cookies.txt

  processing:
    - stage_1:
        name: chunk_extraction
        chunk_duration: 10_seconds
        overlap: 1_second # For smooth transitions
        fps: 10
        format: RGB

    - stage_2:
        name: ml_inference
        models:
          - yolov5
          - rtmpose
          - deepsort_tracking # For horse re-identification
        batch_size: 8

    - stage_3:
        name: horse_tracking
        operations:
          - feature_extraction
          - identity_matching
          - track_interpolation
          - occlusion_handling

    - stage_4:
        name: post_processing
        operations:
          - nms_suppression
          - pose_smoothing
          - metric_calculation
          - overlay_generation

  playback:
    - processed_stream:
        delay: 10-30_seconds
        format: HLS
        segment_duration: 2_seconds
        overlay_data: synchronized_json

  storage:
    - real_time:
        store: Redis
        ttl: 3600
        data:
          - current_tracks
          - horse_features
          - processing_queue

    - historical:
        store: TimescaleDB
        compression: enabled
        retention: 90_days

  distribution:
    - websocket:
        protocol: Socket.io
        events:
          - chunk_ready
          - horse_identified
          - track_updated
          - metrics_update
```

## 3. Database Schema

### 3.1 Core Tables

```sql
-- Streams Table
CREATE TABLE streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    source_type ENUM('youtube', 'rtsp', 'rtmp', 'file'),
    source_url TEXT NOT NULL,
    status ENUM('active', 'inactive', 'error'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Horses Table with Tracking Features
CREATE TABLE horses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    stream_id UUID REFERENCES streams(id),
    tracking_id VARCHAR(50) UNIQUE, -- Visual tracking ID (e.g., "Horse_1")
    color_hex VARCHAR(7), -- Assigned color for UI
    first_detected TIMESTAMP,
    last_seen TIMESTAMP,
    total_detections INTEGER DEFAULT 0,
    feature_vector VECTOR(512), -- For re-identification
    thumbnail_url TEXT,
    metadata JSONB
);

-- Horse Tracking Features (for re-identification)
CREATE TABLE horse_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID REFERENCES horses(id),
    timestamp TIMESTAMPTZ NOT NULL,
    feature_vector VECTOR(512),
    confidence FLOAT,
    image_snapshot BYTEA
);

-- Create index for vector similarity search
CREATE INDEX ON horse_features USING ivfflat (feature_vector vector_cosine_ops);

-- Detections Table (TimescaleDB Hypertable)
CREATE TABLE detections (
    time TIMESTAMPTZ NOT NULL,
    stream_id UUID NOT NULL,
    horse_id UUID,
    tracking_id VARCHAR(50), -- Temporary ID before confirmation
    chunk_id UUID, -- Video chunk reference
    bbox JSONB NOT NULL, -- {x, y, width, height, confidence}
    pose_keypoints JSONB, -- Array of {x, y, confidence} for each joint
    feature_vector VECTOR(512), -- For matching
    metrics JSONB -- {velocity, acceleration, angles, etc}
);

SELECT create_hypertable('detections', 'time');

-- Video Chunks Table
CREATE TABLE video_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID REFERENCES streams(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_seconds FLOAT,
    status VARCHAR(50), -- processing, processed, failed
    original_url TEXT,
    processed_url TEXT,
    overlay_data JSONB, -- Synchronized overlay information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts Table
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID REFERENCES streams(id),
    horse_id UUID REFERENCES horses(id),
    alert_type VARCHAR(100),
    severity ENUM('info', 'warning', 'critical'),
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT FALSE
);

-- Performance Indexes
CREATE INDEX idx_detections_stream_time ON detections(stream_id, time DESC);
CREATE INDEX idx_detections_horse_time ON detections(horse_id, time DESC);
CREATE INDEX idx_alerts_unacknowledged ON alerts(acknowledged, created_at DESC);
```

## 4. API Specification

### 4.1 RESTful Endpoints

```yaml
# Core API Endpoints
api:
  version: v1
  base_url: https://api.horsestream.com/v1

  endpoints:
    # Stream Management
    - path: /streams
      methods:
        GET: List all streams
        POST: Create new stream

    - path: /streams/{id}
      methods:
        GET: Get stream details
        PUT: Update stream config
        DELETE: Remove stream

    - path: /streams/{id}/start
      methods:
        POST: Start stream processing

    - path: /streams/{id}/stop
      methods:
        POST: Stop stream processing

    # Detection Data
    - path: /detections
      methods:
        GET:
          params:
            - stream_id: UUID
            - start_time: ISO8601
            - end_time: ISO8601
            - limit: integer

    # ML Models
    - path: /models
      methods:
        GET: List available models
        POST: Upload custom model

    - path: /models/{id}/activate
      methods:
        POST: Activate model for stream

    # PTZ Camera Controls
    - path: /streams/{id}/ptz/snapshot
      methods:
        GET:
          description: Proxy camera snapshot (avoids CORS)
          params:
            - usr: Camera username
            - pwd: Camera password
          response: Binary JPEG image
```

### 4.2 PTZ Camera Control

```yaml
# HiPro Camera PTZ API (frontend calls directly via no-cors)
ptz_control:
  base_url: http://{camera_hostname}:8080

  endpoints:
    # Pan/Tilt/Zoom Movement
    - path: /web/cgi-bin/hi3510/ptzctrl.cgi
      params:
        - step: 0 (continuous mode)
        - act: up|down|left|right|zoomin|zoomout|stop
        - speed: 1-63
        - usr: username
        - pwd: password

    # Preset Management
    - path: /web/cgi-bin/hi3510/param.cgi
      params:
        - cmd: preset
        - act: set|goto
        - status: 1
        - number: 1-8
        - usr: username
        - pwd: password

    # Snapshot (proxied through API gateway)
    - path: /web/tmpfs/auto.jpg
      notes: Must be proxied to avoid CORS - use /api/v1/streams/{id}/ptz/snapshot
```

### 4.3 WebSocket Events

```javascript
// WebSocket Event Structure
const wsEvents = {
  // Client -> Server
  subscribe: {
    event: 'subscribe',
    data: {
      streamId: 'uuid',
      channels: ['detections', 'poses', 'metrics']
    }
  },

  // Server -> Client
  detectionUpdate: {
    event: 'detection:update',
    data: {
      streamId: 'uuid',
      timestamp: 'ISO8601',
      horses: [{
        id: 'uuid',
        bbox: {x, y, width, height, confidence},
        pose: {keypoints: [...], confidence}
      }]
    }
  },

  metricsUpdate: {
    event: 'metrics:update',
    data: {
      streamId: 'uuid',
      horseId: 'uuid',
      metrics: {
        velocity: 0.0,
        gaitType: 'walk|trot|canter|gallop',
        angles: {...}
      }
    }
  }
};
```

## 5. Deployment Architecture

### 5.1 Container Architecture

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Frontend
  webapp:
    build: ./frontend
    ports:
      - '3000:3000'
    environment:
      - REACT_APP_API_URL=http://api:8000
      - REACT_APP_WS_URL=ws://api:8000/ws

  # API Gateway
  api_gateway:
    image: kong:latest
    ports:
      - '8000:8000'
    environment:
      - KONG_DATABASE=postgres
      - KONG_PG_HOST=db

  # Stream Service
  stream_service:
    build: ./services/stream
    ports:
      - '8001:8001'
    depends_on:
      - redis
      - db

  # ML Service
  ml_service:
    build: ./services/ml
    ports:
      - '8002:8002'
    volumes:
      - ./models:/app/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  # Media Server
  media_server:
    build: ./services/media
    ports:
      - '8003:8003'
      - '1935:1935' # RTMP
      - '5000-5100:5000-5100/udp' # WebRTC

  # Databases
  db:
    image: timescale/timescaledb:latest-pg14
    environment:
      - POSTGRES_DB=horsestream
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=secret
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 5.2 Kubernetes Architecture

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-processing
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ml-processing
  template:
    metadata:
      labels:
        app: ml-processing
    spec:
      containers:
        - name: ml-service
          image: horsestream/ml-service:latest
          resources:
            requests:
              memory: '4Gi'
              cpu: '2'
              nvidia.com/gpu: 1
            limits:
              memory: '8Gi'
              cpu: '4'
              nvidia.com/gpu: 1
---
apiVersion: v1
kind: Service
metadata:
  name: ml-service
spec:
  selector:
    app: ml-processing
  ports:
    - protocol: TCP
      port: 8002
      targetPort: 8002
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ml-processing-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ml-processing
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## 6. Security Architecture

### 6.1 Authentication & Authorization

```javascript
// JWT-based Auth Flow
const authFlow = {
  // User Authentication
  login: async credentials => {
    // Validate with Auth0/Cognito
    const token = await authProvider.authenticate(credentials);
    return {
      accessToken: token.access,
      refreshToken: token.refresh,
      expiresIn: 3600,
    };
  },

  // Role-Based Access Control
  rbac: {
    roles: {
      admin: ['*'],
      manager: ['streams:*', 'horses:*', 'analytics:read'],
      viewer: ['streams:read', 'horses:read'],
    },

    checkPermission: (user, resource, action) => {
      const permission = `${resource}:${action}`;
      return user.roles.some(
        role =>
          rbac.roles[role].includes(permission) ||
          rbac.roles[role].includes(`${resource}:*`) ||
          rbac.roles[role].includes('*')
      );
    },
  },
};
```

### 6.2 Data Encryption

```yaml
encryption:
  at_rest:
    database: AES-256
    file_storage: AES-256

  in_transit:
    api: HTTPS/TLS 1.3
    websocket: WSS
    video_stream: SRTP (WebRTC)

  key_management:
    provider: AWS KMS / HashiCorp Vault
    rotation: 90_days
```

## 7. Monitoring & Observability

### 7.1 Metrics Stack

```yaml
monitoring:
  metrics:
    collector: Prometheus
    storage: VictoriaMetrics
    visualization: Grafana

  key_metrics:
    - stream_health:
        - fps
        - bitrate
        - packet_loss
        - latency

    - ml_performance:
        - inference_time
        - detection_accuracy
        - gpu_utilization
        - queue_depth

    - system:
        - cpu_usage
        - memory_usage
        - disk_io
        - network_throughput

  logging:
    aggregator: Fluentd
    storage: Elasticsearch
    viewer: Kibana

  tracing:
    collector: Jaeger
    sampling_rate: 0.1
```

## 8. Scalability Considerations

### 8.1 Horizontal Scaling Strategy

- **Stream Ingestion:** Scale based on number of active streams
- **ML Processing:** Scale based on GPU utilization and queue depth
- **API Servers:** Scale based on request rate and response time
- **Database:** Read replicas for analytics, write master for real-time

### 8.2 Performance Optimization

```python
# Frame Processing Optimization
class OptimizedProcessor:
    def __init__(self):
        self.frame_buffer = collections.deque(maxlen=300)  # 30s at 10fps
        self.model_cache = {}
        self.thread_pool = ThreadPoolExecutor(max_workers=4)

    async def batch_process(self, frames):
        # Batch frames for GPU efficiency
        batch_size = 8
        batches = [frames[i:i+batch_size]
                  for i in range(0, len(frames), batch_size)]

        results = await asyncio.gather(*[
            self.process_batch(batch) for batch in batches
        ])

        return list(itertools.chain(*results))
```

## 9. Disaster Recovery

### 9.1 Backup Strategy

- **Database:** Daily automated backups with 30-day retention
- **Video Archives:** Optional S3/Cloud storage for historical footage
- **Configuration:** Version controlled in Git
- **Models:** Versioned in model registry

### 9.2 Failover Plan

- **Multi-region deployment** for critical services
- **Automatic health checks** with circuit breakers
- **Graceful degradation** when ML services unavailable
- **Local edge processing** as fallback option
