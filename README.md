BarnHand Horse Streaming Platform
Repository: https://github.com/bricekevin/BarnHand
Overview
BarnHand is an intelligent horse streaming platform that processes video streams in 10-second chunks for real-time detection, tracking, and biomechanical analysis. The backend performs ML processing on chunks and serves processed video with overlays back to the frontend with a configurable 10-30 second delay.
Architecture
Frontend (React) → API Gateway → Stream Processing Service
                                         ↓
                                  10s Video Chunks
                                         ↓
                                  ML Processing Service
                                  (YOLO11 + RTMPose)
                                         ↓
                                  Processed Video + Overlays
                                         ↓
                                  Frontend Playback (10-30s delay)
Starting Fresh
Prerequisites

Docker & Docker Compose
Node.js 18+
Python 3.11+
Git
8GB+ RAM (16GB+ for ML processing)
NVIDIA GPU (optional but recommended)

# Docs
 - see the docs folder for styles to use, archtiecture, implementation ideas, and research 

Initial Setup
bash# Clone repository
git clone https://github.com/bricekevin/BarnHand.git
cd BarnHand

# Create directory structure
mkdir -p frontend backend/{api-gateway,stream-service,ml-service,video-streamer} 
mkdir -p models infrastructure media shared tests

# Add test videos to media folder
# Place 5+ horse video files (MP4/MOV) in media/ for local streaming

# Copy environment template
cp .env.example .env
# Edit .env with your configuration
Development Workflow
Follow the task list in order, creating Git checkpoints after each major section:
bash# After completing each section
git add -A
git commit -m "Complete: [Section Name]"
git tag -a v0.X.0 -m "Checkpoint: [Description]"
git push origin main --tags
Project Structure
BarnHand/
├── frontend/              # React 18 + TypeScript + Vite
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/
│   ├── api-gateway/       # Express.js API (port 8000)
│   ├── stream-service/    # Chunk processor (port 8001)
│   ├── ml-service/        # Python FastAPI (port 8002)
│   └── video-streamer/    # Local video HLS server (port 8003)
├── models/                # YOLO11, YOLOv5, RTMPose models
├── infrastructure/        # Docker configs
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
├── media/                 # Local test videos (looped streaming)
├── shared/                # Shared TypeScript types
├── tests/                 # Test suites
└── scripts/              
    └── download_models.sh # ML model downloader
Checkpoint System
Each checkpoint represents a working state you can restore to:
CheckpointTagDescriptionRollback CommandInfrastructurev0.1.0Docker, environment setupgit checkout v0.1.0Databasev0.2.0PostgreSQL + TimescaleDBgit checkout v0.2.0Core Servicesv0.3.0API Gateway, Stream Servicegit checkout v0.3.0ML Pipelinev0.4.0YOLO11/YOLOv5 detectiongit checkout v0.4.0Frontend MVPv0.5.0React UI with video playergit checkout v0.5.0Real-timev0.6.0WebSocket communicationgit checkout v0.6.0API Completev0.7.0All REST endpointsgit checkout v0.7.0Testingv0.8.0Unit/Integration/E2E testsgit checkout v0.8.0Productionv1.0.0Local deployment readygit checkout v1.0.0
Quick Start Commands
bash# Download ML models
./scripts/download_models.sh

# Start all services (Docker)
docker-compose up -d

# Start individual services for development
npm run api:dev        # API Gateway
npm run stream:dev     # Stream Service  
npm run ml:dev         # ML Service
npm run video:dev      # Local Video Streamer
npm run frontend:dev   # React Frontend

# Database operations
npm run db:migrate     # Run migrations
npm run db:seed        # Seed test data
npm run db:reset       # Reset to clean state

# Testing
npm run test           # All tests
npm run test:unit      # Unit tests only
npm run test:e2e       # E2E tests only
Local Video Streaming Setup
The video-streamer service loops videos from media/ folder as HLS streams:
bash# Add test videos
cp your-horse-videos/*.mp4 media/

# Configure streams in docker-compose.yml
services:
  video-streamer:
    volumes:
      - ./media:/media
    environment:
      - STREAM_COUNT=5
      - VIDEO_FOLDER=/media
Access test streams at:

Stream 1: http://localhost:8003/stream1/index.m3u8
Stream 2: http://localhost:8003/stream2/index.m3u8
(etc...)

ML Models Configuration
yaml# Primary Model - YOLO11
model: yolo11m.pt
confidence: 0.5
target_fps: 50

# Fallback Model - YOLOv5  
model: yolov5m.pt
confidence: 0.5
auto_switch: true

# Pose Model - RTMPose
model: rtmpose-m-ap10k.pth
keypoints: 17
confidence: 0.3
Environment Variables
bash# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/barnhand
REDIS_URL=redis://localhost:6379

# Services
API_PORT=8000
STREAM_PORT=8001
ML_PORT=8002
VIDEO_PORT=8003

# ML Processing
ML_DEVICE=cuda  # or cpu
CHUNK_DURATION=10
PROCESSING_DELAY=10

# Video Streaming
VIDEO_FOLDER=./media
STREAM_COUNT=5
HLS_SEGMENT_TIME=2
Development Checkpoints
After completing each major section, document in CHECKPOINTS.md:
markdown## v0.X.0 - [Checkpoint Name]

### Working Features
- Feature 1
- Feature 2

### Environment Setup
DATABASE_URL=...
REQUIRED_VAR=...

### Run Commands
docker-compose up service1 service2
npm run specific:command

### Known Issues
- Issue 1 and workaround
- Issue 2 status

### Next Steps
- Continue with Section X
- Or branch for alternative approach
Getting Help

Check existing checkpoints: git tag -l -n
Review task list: See detailed breakdown in project root
Restore to last working state: git checkout [tag]
Create recovery branch: git checkout -b recovery-from-[tag]

License
MIT

Starting Point: Fresh repository
First Task: Section 1.1 - Repository Initialization
Repository: https://github.com/bricekevin/BarnHand