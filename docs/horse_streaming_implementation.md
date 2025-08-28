# Horse Streaming Platform - Technical Implementation Guide

## Implementation Status: ✅ Section 4.3 Complete - Pose Analysis Pipeline

### Current Checkpoint: v0.4.1 - Pose Analysis Pipeline Complete

**✅ COMPLETED SECTIONS:**

- Section 1: Project Setup & Infrastructure
- Section 2: Database & Data Layer
- Section 3: Backend Services (API Gateway, Stream Service, ML Service, Video Streamer)
- Section 4.1: Model Setup and Management (YOLO11, YOLOv5, RTMPose)
- Section 4.2: Horse Re-identification System (DeepSort tracking, 512-dim features)
- Section 4.3: Pose Analysis Pipeline (Joint angles, gait classification, biomechanics)

## 1. Project Setup & Structure ✅ COMPLETE

### 1.1 Repository Structure

```bash
BarnHand/
├── frontend/                 # React TypeScript application (pending)
├── backend/
│   ├── api-gateway/         # ✅ Express.js API gateway with JWT + RBAC
│   ├── stream-service/      # ✅ Node.js chunk processing service
│   ├── ml-service/          # ✅ Python FastAPI ML processing service
│   ├── video-streamer/      # ✅ Local HLS video streaming service
│   └── database/            # ✅ PostgreSQL + TimescaleDB layer
├── models/                  # Model storage (download script ready)
├── media/                   # ✅ Test horse videos (5 files)
├── shared/                  # ✅ TypeScript shared types and utilities
├── testing/                 # ✅ Test infrastructure (Jest/Playwright)
├── scripts/                 # ✅ Model download script
├── docs/                    # ✅ Architecture and design documentation
└── docker-compose.yml       # ✅ Multi-service development environment
```

### 1.2 Initial Setup Commands

```bash
# Clone and setup
git clone <repository>
cd horse-streaming-platform

# Install dependencies
npm run install:all

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Download ML models
./scripts/download_models.sh

# Start development environment
docker-compose up -d

# Run migrations
npm run db:migrate
```

## 2. Frontend Implementation

### 2.1 Core Components Implementation

#### Video Player Component

```typescript
// src/components/streaming/VideoPlayer.tsx
import React, { useRef, useEffect, useState } from 'react';
import { useStreamStore } from '@/stores/streamStore';
import { OverlayCanvas } from './OverlayCanvas';

interface VideoPlayerProps {
  streamId: string;
  showOverlays: boolean;
  processingDelay?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamId,
  showOverlays,
  processingDelay = 0
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [detections, setDetections] = useState([]);
  const { streams, connectStream } = useStreamStore();

  useEffect(() => {
    const initStream = async () => {
      const stream = streams[streamId];
      if (!stream) return;

      if (stream.type === 'youtube') {
        // YouTube stream integration
        await initYouTubeStream(stream.url);
      } else if (stream.type === 'rtsp') {
        // WebRTC connection for IP cameras
        await initWebRTCStream(stream.url);
      }
    };

    initStream();

    // WebSocket subscription for detections
    const ws = new WebSocket(`${WS_URL}/stream/${streamId}`);
    ws.on('detection:update', (data) => {
      setDetections(data.detections);
    });

    return () => ws.close();
  }, [streamId]);

  return (
    <div className="relative w-full h-full bg-stone-800 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted
      />
      {showOverlays && (
        <OverlayCanvas
          videoRef={videoRef}
          detections={detections}
          className="absolute inset-0"
        />
      )}
      <StreamControls streamId={streamId} />
    </div>
  );
};
```

#### Detection Overlay Renderer

```typescript
// src/components/streaming/OverlayCanvas.tsx
import React, { useRef, useEffect } from 'react';
import { drawBoundingBox, drawSkeleton } from '@/utils/canvasUtils';

export const OverlayCanvas: React.FC<{
  videoRef: React.RefObject<HTMLVideoElement>;
  detections: Detection[];
}> = ({ videoRef, detections }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      detections.forEach((detection) => {
        // Draw bounding box
        drawBoundingBox(ctx, detection.bbox, {
          color: '#87CEEB',
          lineWidth: 2,
          label: `Horse ${detection.id} (${detection.confidence.toFixed(2)})`
        });

        // Draw pose skeleton
        if (detection.pose) {
          drawSkeleton(ctx, detection.pose, {
            jointColor: '#DAA520',
            boneColor: '#2D5016',
            jointRadius: 4
          });
        }
      });

      requestAnimationFrame(animate);
    };

    animate();
  }, [detections]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
    />
  );
};
```

### 2.2 State Management

```typescript
// src/stores/streamStore.ts
import { create } from 'zustand';
import { streamService } from '@/services/streamService';

interface StreamState {
  streams: Record<string, Stream>;
  activeStreams: string[];
  isLoading: boolean;

  // Actions
  fetchStreams: () => Promise<void>;
  addStream: (stream: StreamConfig) => Promise<void>;
  removeStream: (id: string) => Promise<void>;
  toggleStream: (id: string) => Promise<void>;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  streams: {},
  activeStreams: [],
  isLoading: false,

  fetchStreams: async () => {
    set({ isLoading: true });
    try {
      const streams = await streamService.getAll();
      set({ streams: streams.reduce((acc, s) => ({ ...acc, [s.id]: s }), {}) });
    } finally {
      set({ isLoading: false });
    }
  },

  addStream: async config => {
    const stream = await streamService.create(config);
    set(state => ({
      streams: { ...state.streams, [stream.id]: stream },
    }));
  },

  toggleStream: async id => {
    const { streams, activeStreams } = get();
    const isActive = activeStreams.includes(id);

    if (isActive) {
      await streamService.stop(id);
      set({ activeStreams: activeStreams.filter(s => s !== id) });
    } else {
      await streamService.start(id);
      set({ activeStreams: [...activeStreams, id] });
    }
  },
}));
```

## 3. Horse Re-identification System Implementation ✅ NEW

### 3.1 Feature Extraction Model

```python
# backend/ml-service/src/models/horse_reid.py
class HorseReIDModel:
    """512-dimension feature extraction for horse re-identification."""

    def __init__(self):
        self.feature_dimension = 512
        self.model = SimpleReIDNet()  # CNN-based feature extractor
        self.feature_index = faiss.IndexFlatL2(512)  # FAISS similarity search

    def extract_features(self, horse_crop):
        """Extract normalized 512-dim feature vector from horse crop."""
        # Preprocess: resize to 256x128, normalize
        # CNN forward pass
        # L2 normalize output features
        return features  # np.ndarray(512,)

    def find_similar_horses(self, features, threshold=0.7):
        """Find horses with similar appearance using FAISS cosine similarity."""
        return [(horse_id, similarity_score), ...]
```

### 3.2 DeepSort-style Tracking

```python
# backend/ml-service/src/models/horse_tracker.py
class HorseTracker:
    """Multi-horse tracking with re-identification capabilities."""

    def update_tracks(self, detections, frame, timestamp):
        """Core tracking algorithm:
        1. Extract ReID features for all detections
        2. Predict track positions using motion model
        3. Associate detections to tracks via Hungarian algorithm
        4. Update matched tracks with exponential moving average
        5. Try re-identification for unmatched detections
        6. Create new tracks for unknown horses
        """

    def _associate_detections(self, detections, features):
        """Cost matrix: 0.3*IoU_cost + 0.7*feature_cost"""
        # Hungarian algorithm for optimal assignment

    def _try_reidentification(self, features, detection):
        """Match against recently lost tracks using:
        - Feature similarity > threshold
        - Spatial proximity (no teleportation)
        - Time window (< 10 seconds since lost)
        """
```

### 3.3 Database Storage with pgvector

```python
# backend/ml-service/src/services/horse_database.py
class HorseDatabaseService:
    """PostgreSQL + pgvector storage for horse tracking."""

    async def save_horse(self, horse_data):
        """Save/update horse with 512-dim feature vector."""

    async def find_similar_horses(self, feature_vector):
        """pgvector cosine similarity search:
        SELECT *, 1 - (feature_vector <=> %s::vector) as similarity
        FROM horses WHERE similarity > threshold
        ORDER BY feature_vector <=> %s::vector
        """

    async def merge_horse_tracks(self, primary_id, secondary_id):
        """Merge two tracks determined to be same horse."""

    async def split_horse_track(self, horse_id, split_timestamp):
        """Split track that was incorrectly merged."""
```

### 3.4 API Integration

New FastAPI endpoints in `/api/tracking/`:

- **Threshold Control**: `POST /threshold` - Tune similarity matching (0.0-1.0)
- **Track Management**: `GET /horses` - List all active/lost tracks
- **Horse Details**: `GET /horses/{id}` - Get track history and appearance data
- **Manual Corrections**: `POST /merge`, `POST /split` - Fix tracking errors
- **Analytics**: `GET /stats` - Tracking performance metrics

### 3.5 Track Confidence Scoring

Multi-factor confidence calculation:

- **Detection Confidence**: Average of recent detection scores
- **Track Longevity**: Longer tracks = higher confidence (max at 20 detections)
- **Feature Consistency**: Low variance in appearance features
- **Velocity Consistency**: Realistic movement patterns (no teleportation)

### 3.6 Color Assignment System

10 distinctive tracking colors for visual identification:

- Consistent color assignment via hash(horse_id)
- Colors: Red, Teal, Blue, Mint, Yellow, Pink, Light Blue, Purple, Cyan, Orange
- UI maintains color consistency across sessions

## 3.7 Pose Analysis Pipeline ✅ NEW

### 3.7.1 Joint Angle Calculations

```python
# backend/ml-service/src/models/pose_analysis.py
class PoseAnalyzer:
    """Analyze horse poses for biomechanical metrics."""

    def calculate_angle(self, p1, p2, p3):
        """Calculate angle at p2 formed by p1-p2-p3."""
        v1 = np.array(p1) - np.array(p2)
        v2 = np.array(p3) - np.array(p2)
        cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
        return np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0)))

    def calculate_joint_angles(self, keypoints):
        """Calculate important joint angles from AP10K keypoints."""
        angles = {}

        # Front leg angles (shoulder, elbow)
        if all(keypoints[[5, 6, 7], 2] > self.confidence_threshold):
            angles["front_left_shoulder"] = self.calculate_angle(
                keypoints[3, :2], keypoints[5, :2], keypoints[6, :2]
            )
            angles["front_left_elbow"] = self.calculate_angle(
                keypoints[5, :2], keypoints[6, :2], keypoints[7, :2]
            )

        # Back leg angles (hip, knee)
        if all(keypoints[[11, 12, 13], 2] > self.confidence_threshold):
            angles["back_left_hip"] = self.calculate_angle(
                keypoints[4, :2], keypoints[11, :2], keypoints[12, :2]
            )
            angles["back_left_knee"] = self.calculate_angle(
                keypoints[11, :2], keypoints[12, :2], keypoints[13, :2]
            )

        return angles
```

### 3.7.2 Gait Classification System

```python
# backend/ml-service/src/models/gait_classifier.py
from enum import Enum

class GaitType(Enum):
    STANDING = "standing"
    WALK = "walk"
    TROT = "trot"
    CANTER = "canter"
    GALLOP = "gallop"

class ActionType(Enum):
    STANDING = "standing"
    WALKING = "walking"
    RUNNING = "running"
    GRAZING = "grazing"    # Head down, eating
    RESTING = "resting"    # Lying down
    ALERT = "alert"        # Head up, ears forward

class GaitClassifier:
    """Classify horse gaits from pose sequences."""

    def detect_footfall_pattern(self, poses):
        """Detect footfall patterns from pose sequence."""
        footfall_patterns = {
            "front_left": [], "front_right": [],
            "back_left": [], "back_right": []
        }

        hoof_indices = {
            "front_left": 7, "front_right": 10,
            "back_left": 13, "back_right": 16
        }

        for pose in poses:
            keypoints = pose["keypoints"]
            for leg, idx in hoof_indices.items():
                if keypoints[idx, 2] > 0.3:  # Confident detection
                    # Hoof in contact if minimal movement
                    is_contact = self._check_ground_contact(keypoints[idx])
                    footfall_patterns[leg].append(is_contact)

        return footfall_patterns

    def classify_gait_from_pattern(self, frequency, velocity):
        """Classify gait type from stride frequency and velocity."""
        if velocity is not None:
            if velocity < 0.5: return GaitType.STANDING
            elif velocity < 2.0: return GaitType.WALK
            elif velocity < 4.0: return GaitType.TROT
            elif velocity < 6.0: return GaitType.CANTER
            else: return GaitType.GALLOP

        # Frequency-based classification
        if frequency < 0.1: return GaitType.STANDING
        elif frequency < 1.5: return GaitType.WALK
        elif frequency < 2.5: return GaitType.TROT
        elif frequency < 3.5: return GaitType.CANTER
        else: return GaitType.GALLOP
```

### 3.7.3 Pose Validation & Outlier Detection

```python
# backend/ml-service/src/models/pose_validator.py
class PoseValidator:
    """Validate and correct horse pose detections."""

    def __init__(self):
        self.bone_length_ratios = {
            ("neck", "spine"): (0.6, 0.9),    # Neck 60-90% of spine
            ("lower_leg", "upper_leg"): (0.8, 1.2)  # Leg proportions
        }

        self.joint_angle_ranges = {
            "shoulder": (30, 150), "elbow": (45, 180),
            "hip": (30, 150), "knee": (40, 180)
        }

    def check_anatomical_constraints(self, keypoints):
        """Check if pose satisfies anatomical constraints."""
        issues = []

        # Check spine length
        if all(keypoints[[3, 4], 2] > self.confidence_threshold):
            spine_length = np.linalg.norm(keypoints[3, :2] - keypoints[4, :2])
            if spine_length < 20:
                issues.append("Spine length unusually short")

        # Check leg proportions
        for upper, middle, lower, leg_name in self._leg_configs():
            if all(keypoints[[upper, middle, lower], 2] > self.confidence_threshold):
                upper_len = np.linalg.norm(keypoints[upper, :2] - keypoints[middle, :2])
                lower_len = np.linalg.norm(keypoints[middle, :2] - keypoints[lower, :2])

                if upper_len > 0:
                    ratio = lower_len / upper_len
                    min_r, max_r = self.bone_length_ratios[("lower_leg", "upper_leg")]
                    if not (min_r <= ratio <= max_r):
                        issues.append(f"{leg_name}: Invalid leg proportions")

        return len(issues) == 0, issues

    def detect_outlier_keypoints(self, keypoints):
        """Detect outlier keypoints using z-score analysis."""
        outliers = []

        for kp_idx in range(keypoints.shape[0]):
            if keypoints[kp_idx, 2] < self.confidence_threshold:
                continue

            # Get historical positions
            historical = self._get_historical_positions(kp_idx)
            if len(historical) >= 3:
                # Calculate z-scores
                z_score_x = abs(stats.zscore([*historical, keypoints[kp_idx, 0]]))[-1]
                z_score_y = abs(stats.zscore([*historical, keypoints[kp_idx, 1]]))[-1]

                # Flag as outlier if z-score > 3
                if z_score_x > 3 or z_score_y > 3:
                    outliers.append(kp_idx)

        return outliers
```

### 3.7.4 Biomechanical Analysis Metrics

```python
# Extended pose analysis with biomechanical metrics
@dataclass
class PoseMetrics:
    """Container for biomechanical metrics."""
    joint_angles: Dict[str, float]       # Joint angles in degrees
    stride_length: Optional[float]       # Distance between hooves
    back_angle: float                    # Spine curvature
    head_height: float                   # Head relative to body
    center_of_mass: Tuple[float, float]  # Estimated CoM position
    velocity: Optional[float]            # Movement velocity
    confidence: float                    # Overall pose confidence

class PoseAnalyzer:
    def analyze_pose(self, keypoints, timestamp=None):
        """Perform complete biomechanical analysis."""
        # Calculate all metrics
        joint_angles = self.calculate_joint_angles(keypoints)
        stride_metrics = self.calculate_stride_metrics(keypoints)
        back_angle = self.calculate_back_angle(keypoints)
        center_of_mass = self.estimate_center_of_mass(keypoints)

        # Estimate velocity from temporal history
        velocity = None
        if len(self.pose_history) >= 2:
            prev_com = self.pose_history[-1]["center_of_mass"]
            dt = timestamp - self.pose_history[-1]["timestamp"]
            if dt > 0:
                velocity = np.linalg.norm(
                    np.array(center_of_mass) - np.array(prev_com)
                ) / dt

        return PoseMetrics(
            joint_angles=joint_angles,
            stride_length=stride_metrics.get("diagonal_stride"),
            back_angle=back_angle,
            head_height=keypoints[2, 1] if keypoints[2, 2] > 0.3 else 0,
            center_of_mass=center_of_mass,
            velocity=velocity,
            confidence=np.mean(keypoints[:, 2])
        )
```

### 3.7.5 Integration with ML Processor

```python
# backend/ml-service/src/services/processor.py
class ChunkProcessor:
    def __init__(self):
        # Existing components...
        self.pose_analyzers = {}      # Per-horse analyzers
        self.gait_classifiers = {}    # Per-horse gait classifiers
        self.pose_validator = PoseValidator()

    async def process_chunk(self, chunk_path, chunk_metadata):
        for frame_idx, frame in enumerate(frames):
            # Existing detection and tracking...

            for track_info in tracked_horses:
                pose_data, _ = self.pose_model.estimate_pose(frame, track_info["bbox"])
                if pose_data:
                    horse_id = track_info["id"]

                    # Get or create analyzers
                    if horse_id not in self.pose_analyzers:
                        self.pose_analyzers[horse_id] = PoseAnalyzer()
                        self.gait_classifiers[horse_id] = GaitClassifier()

                    keypoints = np.array(pose_data["keypoints"])

                    # Validate and correct pose
                    validation = self.pose_validator.validate(keypoints)
                    if validation.corrected_keypoints is not None:
                        keypoints = validation.corrected_keypoints

                    # Biomechanical analysis
                    if validation.is_valid:
                        pose_metrics = self.pose_analyzers[horse_id].analyze_pose(
                            keypoints, frame_timestamp
                        )

                        # Gait classification
                        self.gait_classifiers[horse_id].add_pose(keypoints, frame_timestamp)
                        gait_metrics = self.gait_classifiers[horse_id].classify(fps)

                        # Add analysis data
                        pose_data["biomechanics"] = {
                            "joint_angles": pose_metrics.joint_angles,
                            "stride_length": pose_metrics.stride_length,
                            "back_angle": pose_metrics.back_angle,
                            "center_of_mass": pose_metrics.center_of_mass,
                            "velocity": pose_metrics.velocity
                        }

                        if gait_metrics:
                            pose_data["gait"] = {
                                "type": gait_metrics.gait_type.value,
                                "action": gait_metrics.action_type.value,
                                "stride_frequency": gait_metrics.stride_frequency,
                                "symmetry_score": gait_metrics.symmetry_score,
                                "confidence": gait_metrics.confidence
                            }

                    pose_data["validation"] = {
                        "is_valid": validation.is_valid,
                        "confidence": validation.confidence,
                        "issues": validation.issues[:3]  # Limit for JSON size
                    }
```

### 3.7.6 AP10K Keypoint Mapping

The pose analysis uses RTMPose-M AP10K model with 17 keypoints:

```python
KEYPOINT_NAMES = {
    0: "left_eye", 1: "right_eye", 2: "nose",
    3: "neck", 4: "root_of_tail",
    5: "left_shoulder", 6: "left_elbow", 7: "left_front_paw",
    8: "right_shoulder", 9: "right_elbow", 10: "right_front_paw",
    11: "left_hip", 12: "left_knee", 13: "left_back_paw",
    14: "right_hip", 15: "right_knee", 16: "right_back_paw"
}

# Skeletal connections for visualization
SKELETON_CONNECTIONS = [
    (0, 2), (1, 2), (2, 3),           # Head
    (3, 4),                           # Spine
    (3, 5), (5, 6), (6, 7),          # Left front leg
    (3, 8), (8, 9), (9, 10),         # Right front leg
    (4, 11), (11, 12), (12, 13),     # Left back leg
    (4, 14), (14, 15), (15, 16),     # Right back leg
]
```

**✅ Section 4.3 Benefits:**

- Real-time biomechanical analysis with joint angles, stride metrics
- Automatic gait classification (walk, trot, canter, gallop)
- Action recognition (standing, grazing, running, alert, resting)
- Pose validation with outlier detection and correction
- Temporal smoothing for more stable analysis
- Per-horse analysis history for velocity calculations

## 4. Backend Services Implementation

### 3.1 Stream Ingestion Service with YouTube Rate Limit Mitigation

```javascript
// backend/stream-service/src/services/StreamIngestionService.js
const EventEmitter = require('events');
const ytdl = require('ytdl-core');
const YtDlpWrap = require('yt-dlp-wrap').default; // Alternative to ytdl
const NodeMediaServer = require('node-media-server');
const FFmpeg = require('fluent-ffmpeg');
const { HttpsProxyAgent } = require('https-proxy-agent');

class StreamIngestionService extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map();
    this.chunkProcessors = new Map();
    this.proxyList = this.loadProxies();
    this.currentProxyIndex = 0;
    this.ytDlp = new YtDlpWrap('/usr/local/bin/yt-dlp');
    this.initMediaServer();
  }

  initMediaServer() {
    this.nms = new NodeMediaServer({
      rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60,
      },
      http: {
        port: 8000,
        allow_origin: '*',
        mediaroot: './media',
      },
      trans: {
        ffmpeg: '/usr/local/bin/ffmpeg',
        tasks: [
          {
            app: 'live',
            hls: true,
            hlsFlags: '[hls_time=10:hls_list_size=6:hls_flags=delete_segments]',
            dash: true,
            dashFlags: '[f=dash:window_size=3:extra_window_size=5]',
          },
        ],
      },
    });

    this.nms.run();
  }

  loadProxies() {
    // Load proxy list from config
    return [
      'http://proxy1.example.com:8080',
      'http://proxy2.example.com:8080',
      'http://proxy3.example.com:8080',
    ];
  }

  getNextProxy() {
    const proxy = this.proxyList[this.currentProxyIndex];
    this.currentProxyIndex =
      (this.currentProxyIndex + 1) % this.proxyList.length;
    return proxy;
  }

  async addYouTubeStream(streamId, youtubeUrl) {
    try {
      // Strategy 1: Try yt-dlp with cookies first
      let streamUrl = await this.getYouTubeStreamWithYtDlp(youtubeUrl);

      if (!streamUrl) {
        // Strategy 2: Fallback to ytdl-core with proxy rotation
        streamUrl = await this.getYouTubeStreamWithProxy(youtubeUrl);
      }

      if (!streamUrl) {
        // Strategy 3: Cache and rebroadcast
        streamUrl = await this.getCachedStream(youtubeUrl);
      }

      // Setup chunk-based processing
      const chunkProcessor = new ChunkProcessor(streamId, streamUrl);
      this.chunkProcessors.set(streamId, chunkProcessor);

      // Start chunked streaming
      await chunkProcessor.start();

      this.activeStreams.set(streamId, {
        type: 'youtube',
        url: youtubeUrl,
        processor: chunkProcessor,
        status: 'active',
      });

      this.emit('stream:started', { streamId, type: 'youtube' });
    } catch (error) {
      console.error('YouTube stream error:', error);
      this.emit('stream:error', { streamId, error: error.message });
    }
  }

  async getYouTubeStreamWithYtDlp(youtubeUrl) {
    try {
      // Use yt-dlp with cookies for authentication
      const output = await this.ytDlp.execPromise([
        youtubeUrl,
        '--cookies',
        '/config/youtube_cookies.txt',
        '--get-url',
        '--format',
        'best[height<=720]',
        '--no-warnings',
      ]);

      return output.trim();
    } catch (error) {
      console.log('yt-dlp failed, trying next strategy:', error.message);
      return null;
    }
  }

  async getYouTubeStreamWithProxy(youtubeUrl) {
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const proxy = this.getNextProxy();
        const agent = new HttpsProxyAgent(proxy);

        const info = await ytdl.getInfo(youtubeUrl, {
          requestOptions: { agent },
        });

        const format = ytdl.chooseFormat(info.formats, {
          quality: 'highest',
          filter: 'videoandaudio',
        });

        return format.url;
      } catch (error) {
        console.log(`Proxy attempt ${i + 1} failed:`, error.message);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return null;
  }

  async getCachedStream(youtubeUrl) {
    // Check if we have a recent cache
    const cacheKey = `stream:cache:${youtubeUrl}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Create a local rebroadcast stream
    // This would be a more complex implementation in production
    return null;
  }
}

class ChunkProcessor extends EventEmitter {
  constructor(streamId, sourceUrl) {
    super();
    this.streamId = streamId;
    this.sourceUrl = sourceUrl;
    this.chunkDuration = 10; // seconds
    this.chunkQueue = [];
    this.currentChunk = null;
    this.isProcessing = false;
  }

  async start() {
    // Start capturing chunks
    this.captureChunks();

    // Start processing pipeline
    this.processChunks();

    // Start playback stream
    this.startPlayback();
  }

  captureChunks() {
    const outputPattern = `./chunks/${this.streamId}/chunk_%03d.ts`;

    this.ffmpeg = FFmpeg(this.sourceUrl)
      .inputOptions(['-re'])
      .outputOptions([
        '-c:v copy',
        '-c:a copy',
        '-f segment',
        `-segment_time ${this.chunkDuration}`,
        '-segment_format mpegts',
        '-segment_list_type m3u8',
        `-segment_list ./chunks/${this.streamId}/playlist.m3u8`,
        '-segment_list_flags +live',
        '-reset_timestamps 1',
      ])
      .output(outputPattern)
      .on('stderr', stderrLine => {
        // Parse chunk completion
        if (stderrLine.includes('segment:')) {
          const chunkPath = this.parseChunkPath(stderrLine);
          if (chunkPath) {
            this.chunkQueue.push({
              path: chunkPath,
              timestamp: Date.now(),
              status: 'pending',
            });
            this.emit('chunk:created', chunkPath);
          }
        }
      });

    this.ffmpeg.run();
  }

  async processChunks() {
    setInterval(async () => {
      if (this.isProcessing || this.chunkQueue.length === 0) return;

      this.isProcessing = true;
      const chunk = this.chunkQueue.shift();

      try {
        // Send chunk for ML processing
        const processedData = await this.sendForProcessing(chunk);

        // Store processed chunk with overlay data
        chunk.overlayData = processedData;
        chunk.status = 'processed';

        // Emit for playback
        this.emit('chunk:processed', chunk);
      } catch (error) {
        console.error('Chunk processing error:', error);
        chunk.status = 'failed';
      }

      this.isProcessing = false;
    }, 1000);
  }

  async sendForProcessing(chunk) {
    // Send to ML service for processing
    const response = await fetch(`http://ml-service:8002/process-chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streamId: this.streamId,
        chunkPath: chunk.path,
        timestamp: chunk.timestamp,
      }),
    });

    return response.json();
  }

  startPlayback() {
    // Create processed stream with delay
    const delay = 20; // seconds

    // This would create a new HLS stream with overlays burned in
    // or send synchronized overlay data via websocket
    this.on('chunk:processed', chunk => {
      setTimeout(() => {
        this.emit('chunk:ready', chunk);
      }, delay * 1000);
    });
  }
}

module.exports = StreamIngestionService;
```

### 3.2 Enhanced ML Processing Service with Multi-Horse Tracking

```python
# backend/ml-service/src/processing/ml_pipeline.py
import asyncio
import numpy as np
import cv2
import torch
from collections import deque, defaultdict
from typing import List, Dict, Any, Tuple
import redis.asyncio as redis
from fastapi import FastAPI, WebSocket
import json
import time
from dataclasses import dataclass
import faiss  # For efficient similarity search

from models import YOLOv5Detector, RTMPoseEstimator, HorseReIDModel
from utils import calculate_angles, detect_gait

@dataclass
class Horse:
    id: str
    tracking_id: int
    color: Tuple[int, int, int]
    feature_vector: np.ndarray
    last_bbox: List[float]
    last_seen: float
    confidence: float
    appearance_history: deque
    pose_history: deque

class EnhancedHorseTracker:
    """Advanced multi-horse tracking with re-identification"""

    def __init__(self, similarity_threshold=0.7):
        self.horses = {}
        self.next_id = 0
        self.similarity_threshold = similarity_threshold

        # Color palette for visual distinction
        self.colors = [
            (255, 0, 0),    # Red
            (0, 255, 0),    # Green
            (0, 0, 255),    # Blue
            (255, 255, 0),  # Yellow
            (255, 0, 255),  # Magenta
            (0, 255, 255),  # Cyan
            (255, 128, 0),  # Orange
            (128, 0, 255),  # Purple
            (0, 128, 255),  # Light Blue
            (255, 0, 128),  # Pink
        ]
        self.color_index = 0

        # Feature index for fast similarity search
        self.feature_dimension = 512
        self.feature_index = faiss.IndexFlatL2(self.feature_dimension)
        self.id_to_index = {}

        # Re-ID model for horse recognition
        self.reid_model = HorseReIDModel()

    def get_next_color(self):
        color = self.colors[self.color_index % len(self.colors)]
        self.color_index += 1
        return color

    def extract_features(self, image_crop: np.ndarray) -> np.ndarray:
        """Extract re-identification features from horse crop"""
        features = self.reid_model.extract_features(image_crop)
        return features.cpu().numpy().flatten()

    def update_tracks(self, detections: List[Dict], frame: np.ndarray) -> List[Dict]:
        """Update all horse tracks with new detections"""
        current_time = time.time()
        updated_horses = []

        # Extract features for all detections
        detection_features = []
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            crop = frame[int(y1):int(y2), int(x1):int(x2)]
            features = self.extract_features(crop)
            detection_features.append(features)

        # Match detections to existing horses
        matched_pairs = self.match_detections(detections, detection_features)

        # Update matched horses
        for det_idx, horse_id in matched_pairs:
            det = detections[det_idx]
            features = detection_features[det_idx]

            # Update existing horse
            horse = self.horses[horse_id]
            horse.last_bbox = det['bbox']
            horse.last_seen = current_time
            horse.confidence = 0.9 * horse.confidence + 0.1 * det['confidence']

            # Update feature vector with exponential moving average
            horse.feature_vector = 0.8 * horse.feature_vector + 0.2 * features

            # Update appearance history
            horse.appearance_history.append({
                'timestamp': current_time,
                'bbox': det['bbox'],
                'features': features
            })

            updated_horses.append({
                'id': horse.id,
                'tracking_id': horse.tracking_id,
                'color': horse.color,
                'bbox': det['bbox'],
                'confidence': horse.confidence,
                'is_new': False
            })

        # Create new horses for unmatched detections
        unmatched_indices = set(range(len(detections))) - set([p[0] for p in matched_pairs])
        for det_idx in unmatched_indices:
            det = detections[det_idx]
            features = detection_features[det_idx]

            # Check if this might be a previously seen horse
            reidentified_horse = self.try_reidentify(features)

            if reidentified_horse:
                # Reactivate old horse
                horse = reidentified_horse
                horse.last_seen = current_time
                horse.last_bbox = det['bbox']
            else:
                # Create new horse
                horse_id = f"horse_{self.next_id}"
                self.next_id += 1

                horse = Horse(
                    id=horse_id,
                    tracking_id=self.next_id,
                    color=self.get_next_color(),
                    feature_vector=features,
                    last_bbox=det['bbox'],
                    last_seen=current_time,
                    confidence=det['confidence'],
                    appearance_history=deque(maxlen=100),
                    pose_history=deque(maxlen=100)
                )

                self.horses[horse_id] = horse

                # Add to feature index
                self.feature_index.add(features.reshape(1, -1))
                self.id_to_index[horse_id] = self.feature_index.ntotal - 1

            updated_horses.append({
                'id': horse.id,
                'tracking_id': horse.tracking_id,
                'color': horse.color,
                'bbox': det['bbox'],
                'confidence': horse.confidence,
                'is_new': True
            })

        # Clean old tracks
        self.clean_old_tracks(current_time)

        return updated_horses

    def match_detections(self, detections: List[Dict], features: List[np.ndarray]) -> List[Tuple[int, str]]:
        """Match current detections to existing horses using IoU and features"""
        if not self.horses or not detections:
            return []

        matches = []
        used_detections = set()
        used_horses = set()

        # Calculate cost matrix (IoU + feature similarity)
        cost_matrix = np.zeros((len(detections), len(self.horses)))

        horse_ids = list(self.horses.keys())
        for i, (det, feat) in enumerate(zip(detections, features)):
            for j, horse_id in enumerate(horse_ids):
                horse = self.horses[horse_id]

                # IoU between current and last bbox
                iou = self.calculate_iou(det['bbox'], horse.last_bbox)

                # Feature similarity
                feat_sim = self.cosine_similarity(feat, horse.feature_vector)

                # Combined score (weighted)
                cost_matrix[i, j] = 0.3 * iou + 0.7 * feat_sim

        # Hungarian algorithm for optimal matching
        from scipy.optimize import linear_sum_assignment
        row_ind, col_ind = linear_sum_assignment(-cost_matrix)

        for i, j in zip(row_ind, col_ind):
            if cost_matrix[i, j] > self.similarity_threshold:
                matches.append((i, horse_ids[j]))
                used_detections.add(i)
                used_horses.add(horse_ids[j])

        return matches

    def try_reidentify(self, features: np.ndarray, threshold: float = 0.85) -> Optional[Horse]:
        """Try to re-identify a horse that was temporarily lost"""
        if self.feature_index.ntotal == 0:
            return None

        # Search for similar features
        D, I = self.feature_index.search(features.reshape(1, -1), k=1)

        if D[0][0] < (1 - threshold):  # Convert distance to similarity
            # Find horse ID from index
            for horse_id, idx in self.id_to_index.items():
                if idx == I[0][0]:
                    horse = self.horses.get(horse_id)
                    if horse and time.time() - horse.last_seen > 2.0:
                        return horse

        return None

    def calculate_iou(self, bbox1: List[float], bbox2: List[float]) -> float:
        """Calculate Intersection over Union"""
        x1_1, y1_1, x2_1, y2_1 = bbox1
        x1_2, y1_2, x2_2, y2_2 = bbox2

        xi1 = max(x1_1, x1_2)
        yi1 = max(y1_1, y1_2)
        xi2 = min(x2_1, x2_2)
        yi2 = min(y2_1, y2_2)

        inter_area = max(0, xi2 - xi1) * max(0, yi2 - yi1)

        box1_area = (x2_1 - x1_1) * (y2_1 - y1_1)
        box2_area = (x2_2 - x1_2) * (y2_2 - y1_2)

        union_area = box1_area + box2_area - inter_area

        return inter_area / union_area if union_area > 0 else 0

    def cosine_similarity(self, feat1: np.ndarray, feat2: np.ndarray) -> float:
        """Calculate cosine similarity between feature vectors"""
        dot_product = np.dot(feat1, feat2)
        norm1 = np.linalg.norm(feat1)
        norm2 = np.linalg.norm(feat2)

        if norm1 * norm2 == 0:
            return 0

        return dot_product / (norm1 * norm2)

    def clean_old_tracks(self, current_time: float, timeout: float = 10.0):
        """Remove horses that haven't been seen recently"""
        to_remove = []
        for horse_id, horse in self.horses.items():
            if current_time - horse.last_seen > timeout:
                to_remove.append(horse_id)

        for horse_id in to_remove:
            if horse_id in self.id_to_index:
                # Note: In production, you'd want to properly remove from FAISS index
                del self.id_to_index[horse_id]
            del self.horses[horse_id]

class ChunkMLProcessor:
    """Process video chunks with synchronized overlay generation"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        # Initialize models
        self.detector = YOLOv5Detector(
            model_path=config['yolo_path'],
            device=self.device
        )
        self.pose_estimator = RTMPoseEstimator(
            model_path=config['rtmpose_path'],
            device=self.device
        )

        # Enhanced horse tracker
        self.horse_tracker = EnhancedHorseTracker()

        # Redis for state management
        self.redis_client = None

    async def process_chunk(self, chunk_path: str, stream_id: str) -> Dict:
        """Process a video chunk and generate overlay data"""
        cap = cv2.VideoCapture(chunk_path)

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        overlay_data = {
            'stream_id': stream_id,
            'chunk_path': chunk_path,
            'fps': fps,
            'frame_count': frame_count,
            'frames': []
        }

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Process every 3rd frame for efficiency
            if frame_idx % 3 == 0:
                frame_data = await self.process_frame(frame, stream_id, frame_idx / fps)
                overlay_data['frames'].append({
                    'frame_idx': frame_idx,
                    'timestamp': frame_idx / fps,
                    'horses': frame_data['horses']
                })

            frame_idx += 1

        cap.release()

        # Interpolate missing frames for smooth playback
        overlay_data = self.interpolate_frames(overlay_data)

        return overlay_data

    async def process_frame(self, frame: np.ndarray, stream_id: str, timestamp: float) -> Dict:
        """Process single frame with multi-horse tracking"""

        # Detect horses
        detections = await self.detect_horses(frame)

        # Update tracking
        tracked_horses = self.horse_tracker.update_tracks(detections, frame)

        # Process each tracked horse
        horses_data = []
        for horse_info in tracked_horses:
            # Extract crop for pose estimation
            x1, y1, x2, y2 = horse_info['bbox']
            horse_crop = frame[int(y1):int(y2), int(x1):int(x2)]

            # Pose estimation
            pose = await self.estimate_pose(horse_crop) if horse_crop.size > 0 else None

            # Update pose history
            if pose and horse_info['id'] in self.horse_tracker.horses:
                self.horse_tracker.horses[horse_info['id']].pose_history.append(pose)

            # Calculate metrics
            metrics = self.calculate_metrics(pose, horse_info['id']) if pose else {}

            horses_data.append({
                'id': horse_info['id'],
                'tracking_id': horse_info['tracking_id'],
                'color': horse_info['color'],
                'bbox': horse_info['bbox'],
                'confidence': horse_info['confidence'],
                'pose': pose,
                'metrics': metrics,
                'is_new': horse_info['is_new']
            })

        return {
            'stream_id': stream_id,
            'timestamp': timestamp,
            'horses': horses_data
        }

    def interpolate_frames(self, overlay_data: Dict) -> Dict:
        """Interpolate overlay data for smooth playback"""
        interpolated = overlay_data.copy()
        interpolated['frames'] = []

        frame_data_map = {f['frame_idx']: f for f in overlay_data['frames']}

        for frame_idx in range(overlay_data['frame_count']):
            if frame_idx in frame_data_map:
                # Use actual processed data
                interpolated['frames'].append(frame_data_map[frame_idx])
            else:
                # Interpolate from nearest frames
                prev_idx = max([idx for idx in frame_data_map.keys() if idx < frame_idx], default=None)
                next_idx = min([idx for idx in frame_data_map.keys() if idx > frame_idx], default=None)

                if prev_idx is not None and next_idx is not None:
                    # Linear interpolation
                    alpha = (frame_idx - prev_idx) / (next_idx - prev_idx)
                    interpolated_frame = self.interpolate_frame_data(
                        frame_data_map[prev_idx],
                        frame_data_map[next_idx],
                        alpha
                    )
                    interpolated_frame['frame_idx'] = frame_idx
                    interpolated['frames'].append(interpolated_frame)
                elif prev_idx is not None:
                    # Use previous frame data
                    frame_copy = frame_data_map[prev_idx].copy()
                    frame_copy['frame_idx'] = frame_idx
                    interpolated['frames'].append(frame_copy)

        return interpolated

    def interpolate_frame_data(self, frame1: Dict, frame2: Dict, alpha: float) -> Dict:
        """Interpolate between two frames"""
        interpolated = {
            'timestamp': frame1['timestamp'] + alpha * (frame2['timestamp'] - frame1['timestamp']),
            'horses': []
        }

        # Match horses between frames
        for horse1 in frame1['horses']:
            horse2 = next((h for h in frame2['horses'] if h['id'] == horse1['id']), None)

            if horse2:
                # Interpolate bbox
                bbox1 = np.array(horse1['bbox'])
                bbox2 = np.array(horse2['bbox'])
                interpolated_bbox = (1 - alpha) * bbox1 + alpha * bbox2

                interpolated['horses'].append({
                    'id': horse1['id'],
                    'tracking_id': horse1['tracking_id'],
                    'color': horse1['color'],
                    'bbox': interpolated_bbox.tolist(),
                    'confidence': (1 - alpha) * horse1['confidence'] + alpha * horse2['confidence'],
                    'pose': horse1['pose'],  # Use nearest pose
                    'metrics': horse1['metrics']
                })
            else:
                # Horse only in first frame
                interpolated['horses'].append(horse1)

        return interpolated
```

## 4. Database Setup & Migrations

### 4.1 Database Initialization Script

```sql
-- backend/database/migrations/001_initial_schema.sql

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- Create database
CREATE DATABASE horsestream;
\c horsestream;

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Farms/Organizations table
CREATE TABLE farms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_id UUID REFERENCES users(id),
    location JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Streams configuration
CREATE TABLE streams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES farms(id),
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_url TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'inactive',
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Horses registry
CREATE TABLE horses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES farms(id),
    name VARCHAR(255),
    breed VARCHAR(100),
    age INTEGER,
    color VARCHAR(50),
    markings TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stream-Horse associations
CREATE TABLE stream_horses (
    stream_id UUID REFERENCES streams(id),
    horse_id UUID REFERENCES horses(id),
    first_detected TIMESTAMP,
    last_seen TIMESTAMP,
    PRIMARY KEY (stream_id, horse_id)
);

-- Detection data (Hypertable)
CREATE TABLE detections (
    time TIMESTAMPTZ NOT NULL,
    stream_id UUID NOT NULL,
    horse_id UUID,
    bbox JSONB NOT NULL,
    pose_keypoints JSONB,
    confidence FLOAT,
    metrics JSONB
);

-- Convert to hypertable
SELECT create_hypertable('detections', 'time', chunk_time_interval => INTERVAL '1 day');

-- Create indexes
CREATE INDEX idx_detections_stream ON detections(stream_id, time DESC);
CREATE INDEX idx_detections_horse ON detections(horse_id, time DESC);
CREATE INDEX idx_detections_metrics ON detections USING GIN(metrics);

-- Continuous aggregates for analytics
CREATE MATERIALIZED VIEW hourly_horse_activity
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS hour,
    stream_id,
    horse_id,
    COUNT(*) as detection_count,
    AVG((metrics->>'velocity')::FLOAT) as avg_velocity,
    MAX((metrics->>'velocity')::FLOAT) as max_velocity
FROM detections
WHERE horse_id IS NOT NULL
GROUP BY hour, stream_id, horse_id
WITH NO DATA;

-- Refresh policy
SELECT add_continuous_aggregate_policy('hourly_horse_activity',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');
```

## 5. Docker & Deployment Configuration

### 5.1 Complete Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Frontend React App
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - '3000:3000'
    environment:
      - REACT_APP_API_URL=http://localhost:8000
      - REACT_APP_WS_URL=ws://localhost:8000
    volumes:
      - ./frontend/src:/app/src
    depends_on:
      - api-gateway

  # API Gateway
  api-gateway:
    build:
      context: ./backend/api-gateway
      dockerfile: Dockerfile
    ports:
      - '8000:8000'
    environment:
      - NODE_ENV=development
      - STREAM_SERVICE_URL=http://stream-service:8001
      - ML_SERVICE_URL=http://ml-service:8002
    depends_on:
      - stream-service
      - ml-service
      - postgres
      - redis

  # Stream Ingestion Service
  stream-service:
    build:
      context: ./backend/stream-service
      dockerfile: Dockerfile
    ports:
      - '8001:8001'
      - '1935:1935' # RTMP
      - '8088:8088' # HTTP-FLV
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://admin:password@postgres:5432/horsestream
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./backend/stream-service/src:/app/src
    depends_on:
      - postgres
      - redis

  # ML Processing Service
  ml-service:
    build:
      context: ./backend/ml-service
      dockerfile: Dockerfile
    ports:
      - '8002:8002'
    environment:
      - PYTHONUNBUFFERED=1
      - DATABASE_URL=postgresql://admin:password@postgres:5432/horsestream
      - REDIS_URL=redis://redis:6379
      - MODEL_PATH=/models
    volumes:
      - ./backend/ml-service/src:/app/src
      - ./models:/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - postgres
      - redis

  # PostgreSQL with TimescaleDB
  postgres:
    image: timescale/timescaledb:latest-pg14
    ports:
      - '5432:5432'
    environment:
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=horsestream
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/database/migrations:/docker-entrypoint-initdb.d

  # Redis for caching and pub/sub
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  # Nginx for production
  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./infrastructure/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./infrastructure/nginx/certs:/etc/nginx/certs
    depends_on:
      - frontend
      - api-gateway

volumes:
  postgres_data:
  redis_data:
```

### 5.2 Kubernetes Deployment

```yaml
# infrastructure/kubernetes/deployment.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: horsestream
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-service
  namespace: horsestream
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ml-service
  template:
    metadata:
      labels:
        app: ml-service
    spec:
      containers:
        - name: ml-service
          image: horsestream/ml-service:latest
          ports:
            - containerPort: 8002
          env:
            - name: REDIS_URL
              value: 'redis://redis-service:6379'
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
          resources:
            requests:
              memory: '4Gi'
              cpu: '2'
              nvidia.com/gpu: 1
            limits:
              memory: '8Gi'
              cpu: '4'
              nvidia.com/gpu: 1
          volumeMounts:
            - name: models
              mountPath: /models
      volumes:
        - name: models
          persistentVolumeClaim:
            claimName: models-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: ml-service
  namespace: horsestream
spec:
  selector:
    app: ml-service
  ports:
    - port: 8002
      targetPort: 8002
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ml-service-hpa
  namespace: horsestream
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ml-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: nvidia.com/gpu
        target:
          type: Utilization
          averageUtilization: 80
```

## 6. API Documentation

### 6.1 OpenAPI Specification

```yaml
# api-spec.yaml
openapi: 3.0.0
info:
  title: Horse Streaming Platform API
  version: 1.0.0
  description: API for horse monitoring and streaming platform

servers:
  - url: https://api.horsestream.com/v1
    description: Production server
  - url: http://localhost:8000/v1
    description: Development server

paths:
  /streams:
    get:
      summary: List all streams
      parameters:
        - in: query
          name: farm_id
          schema:
            type: string
            format: uuid
        - in: query
          name: status
          schema:
            type: string
            enum: [active, inactive, error]
      responses:
        200:
          description: List of streams
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Stream'

    post:
      summary: Create a new stream
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/StreamConfig'
      responses:
        201:
          description: Stream created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Stream'

  /streams/{id}/start:
    post:
      summary: Start stream processing
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        200:
          description: Stream started

  /detections:
    get:
      summary: Get detection history
      parameters:
        - in: query
          name: stream_id
          required: true
          schema:
            type: string
            format: uuid
        - in: query
          name: start_time
          schema:
            type: string
            format: date-time
        - in: query
          name: end_time
          schema:
            type: string
            format: date-time
        - in: query
          name: limit
          schema:
            type: integer
            default: 100
      responses:
        200:
          description: Detection data
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Detection'

  /ws/stream/{id}:
    get:
      summary: WebSocket connection for real-time updates
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: string
            format: uuid
      responses:
        101:
          description: WebSocket connection established

components:
  schemas:
    Stream:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        source_type:
          type: string
          enum: [youtube, rtsp, rtmp, file]
        source_url:
          type: string
        status:
          type: string
          enum: [active, inactive, error]
        config:
          type: object
        created_at:
          type: string
          format: date-time

    StreamConfig:
      type: object
      required:
        - name
        - source_type
        - source_url
      properties:
        name:
          type: string
        source_type:
          type: string
          enum: [youtube, rtsp, rtmp]
        source_url:
          type: string
        processing_delay:
          type: integer
          default: 30

    Detection:
      type: object
      properties:
        timestamp:
          type: string
          format: date-time
        stream_id:
          type: string
          format: uuid
        horse_id:
          type: string
        bbox:
          type: object
          properties:
            x:
              type: number
            y:
              type: number
            width:
              type: number
            height:
              type: number
            confidence:
              type: number
        pose:
          type: object
          properties:
            keypoints:
              type: array
              items:
                type: object
                properties:
                  x:
                    type: number
                  y:
                    type: number
```
