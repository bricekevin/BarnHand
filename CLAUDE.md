# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BarnHand is an intelligent horse streaming platform that processes video streams in 10-second chunks for real-time detection, tracking, and biomechanical analysis using ML models (YOLO11/YOLOv5 + RTMPose). The system provides a 10-30 second processing delay to serve processed video with overlays back to the frontend.

## Architecture

**Core Flow**: Frontend (React) → API Gateway → Stream Processing Service → ML Processing Service → Processed Video + Overlays → Frontend Playback

**Key Components**:
- **Frontend**: React 18 + TypeScript + Vite with Zustand state management
- **API Gateway**: Express.js API (port 8000) with JWT auth and RBAC
- **Stream Service**: Node.js chunk processor (port 8001) - extracts 10s video chunks
- **ML Service**: Python FastAPI (port 8002) - YOLO11/YOLOv5 + RTMPose inference
- **Video Streamer**: Local HLS server (port 8003) for test videos
- **Database**: PostgreSQL + TimescaleDB for time-series data
- **Storage**: Redis for real-time data, models stored locally

## Development Commands

### Testing
```bash
# Unit tests (Jest + Vitest)
npm run test           # All tests
npm run test:unit      # Unit tests only
npm run test:e2e       # E2E tests with Playwright

# Individual test runners
jest --config testing/unit/jest.config.js    # Frontend unit tests
pytest backend/ml-service/tests/             # ML pipeline tests
playwright test --config testing/e2e/playwright.config.ts  # E2E tests

# Test validation
node testing/validate-tests.js              # Check test implementation
```

### Services
```bash
# Docker services
docker-compose up -d                        # Start all services
docker-compose up service_name              # Start specific service

# Development services
npm run api:dev                             # API Gateway
npm run stream:dev                          # Stream Service
npm run ml:dev                              # ML Service
npm run video:dev                           # Local Video Streamer
npm run frontend:dev                        # React Frontend

# Database operations
npm run db:migrate                          # Run migrations
npm run db:seed                             # Seed test data
npm run db:reset                            # Reset to clean state
```

### ML Models
```bash
# Download required models
./scripts/download_models.sh               # YOLO11, YOLOv5, RTMPose models
```

## Key Architecture Patterns

### Chunk Processing Pipeline
Video streams are processed in 10-second chunks with 1-second overlap for smooth transitions. The ML service processes chunks in batches of 8 for GPU efficiency.

### Horse Re-identification System
Uses 512-dimension feature vectors stored in PostgreSQL with pgvector for similarity search. Each horse gets a unique tracking ID and color assignment for UI consistency.

### WebSocket Communication
Real-time updates via Socket.io with room-based subscriptions for:
- `detection:update` - Horse detection results
- `metrics:update` - Biomechanical analysis data
- `chunk_ready` - Processed video chunk availability

### Database Schema
- **streams**: Video source configuration and status
- **horses**: Horse registry with feature vectors for re-identification
- **detections**: TimescaleDB hypertable for time-series detection data
- **video_chunks**: Processed video segments with overlay data
- **horse_features**: Feature vectors for similarity matching

## Configuration Files

- `testing/unit/jest.config.js` - Frontend unit test configuration
- `testing/e2e/playwright.config.ts` - End-to-end test configuration
- `docs/horse_streaming_architecture.md` - Detailed technical architecture
- `docs/styles.md` - Complete design system and component styles

## Design System

The UI uses a forest/nature theme with glass morphism effects:
- **Colors**: Forest greens, cyan accents, earth tones
- **Typography**: Inter (primary), Sora (display), JetBrains Mono (data)
- **Horse Tracking**: 10 distinctive colors for multi-horse identification
- **Animations**: Subtle micro-animations with `cubic-bezier(0.4, 0, 0.2, 1)`

## Development Workflow

The project follows a checkpoint-based development system with Git tags (v0.1.0, v0.2.0, etc.) representing working states. Each major feature completion should create a new checkpoint.

**Task Structure**: Follow `PROJECT_TASKS.md` for the complete development roadmap organized into 10 major sections from infrastructure setup to production deployment.

## Environment Setup

Required services:
- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- PostgreSQL with TimescaleDB
- Redis
- 8GB+ RAM (16GB+ recommended for ML processing)
- NVIDIA GPU (optional but recommended)

**Media Setup**: Place test horse videos (MP4/MOV) in the `media/` folder for local streaming. The video-streamer service will loop these as HLS streams on ports 8003/stream1, stream2, etc.

## Key Technical Details

### ML Processing
- **Primary Model**: YOLO11 (yolo11m.pt) with 0.5 confidence threshold
- **Fallback Model**: YOLOv5 (yolov5m.pt) for performance comparison
- **Pose Model**: RTMPose-M AP10K with 17 keypoints, 0.3 confidence
- **Target Performance**: >50 FPS processing speed

### Data Storage
- **Real-time**: Redis with 3600s TTL for current tracks and processing queue
- **Historical**: TimescaleDB with 90-day retention and compression
- **Features**: 512-dimension vectors in PostgreSQL with ivfflat indexes

### Stream Processing
- **Chunk Duration**: 10 seconds with 1-second overlap
- **Processing Delay**: Configurable 10-30 seconds
- **Output Format**: HLS with 2-second segments + synchronized overlay JSON