# 🐎 BarnHand - Intelligent Horse Streaming Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://docs.docker.com/compose/)

**BarnHand** is an intelligent horse streaming platform that processes video streams in real-time for horse detection, tracking, pose analysis, and biomechanical monitoring. Built with computer vision AI (YOLO11/YOLOv5 + RTMPose), it provides actionable insights for equestrian professionals, researchers, and horse enthusiasts.

## 🚀 Quick Start

### Prerequisites
- **Docker & Docker Compose** (recommended)
- **Node.js 18+** and **Python 3.11+** (for development)
- **8GB+ RAM** (16GB+ recommended for ML processing)
- **NVIDIA GPU** (optional but recommended for optimal performance)

### 30-Second Setup (Docker)

```bash
# Clone and start
git clone https://github.com/bricekevin/BarnHand.git
cd BarnHand

# Download ML models
./scripts/download_models.sh

# Start all services
docker compose up -d

# Access the platform
open http://localhost:3000
```

**🎥 Add Your Videos**: Place horse video files (MP4/MOV) in the `media/` folder for streaming.

## ✨ Features

### 🎯 **Computer Vision AI**
- **Horse Detection**: YOLO11 primary model with YOLOv5 fallback
- **Pose Analysis**: 17-point skeletal tracking with RTMPose-M AP10K
- **Real-time Tracking**: Multi-horse identification with persistent tracking
- **Biomechanical Analysis**: Gait classification, joint angles, movement metrics

### 📊 **Real-time Dashboard**
- **Live Streaming**: HLS video with detection overlays
- **Multi-stream Management**: Monitor multiple camera feeds simultaneously
- **Horse Registry**: Automatic identification and manual naming
- **Analytics**: Performance metrics, detection statistics, system health

### 🔧 **Production Ready**
- **Scalable Architecture**: Microservices with Docker containerization
- **Real-time Communication**: WebSocket updates for live data
- **Comprehensive Testing**: Unit, integration, and E2E test suites
- **Full Documentation**: Setup guides, API docs, troubleshooting

### 🌐 **Streaming Support**
- **Local Videos**: MP4/MOV files from media folder
- **IP Cameras**: RTSP stream support
- **Future**: YouTube Live, Twitch integration

## 📋 System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Web     │    │   API Gateway   │    │  Stream Service │
│   Frontend      │◄──►│  (Express.js)   │◄──►│   (Node.js)     │
│  + WebSocket    │    │  + Socket.io    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐    ┌─────────────────┐
                       │   ML Service    │    │ Video Streamer  │
                       │   (Python)      │    │   (FFmpeg)      │
                       │ YOLO + RTMPose  │    │   HLS Output    │
                       └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐    ┌─────────────────┐
                       │   PostgreSQL    │    │     Redis       │
                       │  + TimescaleDB  │    │   + pub/sub     │
                       │   + pgvector    │    │                 │
                       └─────────────────┘    └─────────────────┘
```

## 🛠️ Installation & Setup

### Option 1: Docker (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/bricekevin/BarnHand.git
cd BarnHand

# 2. Copy environment configuration
cp .env.example .env
# Edit .env with your settings (optional for local development)

# 3. Download ML models (138MB)
./scripts/download_models.sh

# 4. Start all services
docker compose up -d

# 5. Verify services are running
docker compose ps
./scripts/health.sh

# 6. Access the application
echo "Frontend: http://localhost:3000"
echo "API Gateway: http://localhost:8000"
echo "Video Streams: http://localhost:8003"
```

### Option 2: Development Setup

```bash
# 1. Install dependencies
npm run install:all

# 2. Setup database
docker compose up postgres redis -d
npm run db:migrate
npm run db:seed

# 3. Download ML models
./scripts/download_models.sh

# 4. Start services in development mode
npm run dev
```

**📝 Detailed Setup Instructions**: See [SETUP.md](SETUP.md) for comprehensive installation guide.

## 🎮 Usage

### Adding Video Streams

1. **Local Videos**: Copy horse video files to `media/` folder
2. **Stream Access**: Videos auto-loop on ports 8003/stream1, stream2, etc.
3. **Dashboard**: Add streams through the web interface at http://localhost:3000

### Managing Horse Detection

1. **Real-time Detection**: View live detections on dashboard
2. **Horse Identification**: Name and track individual horses
3. **Pose Analysis**: Monitor gait patterns and biomechanics
4. **Export Data**: Download detection data in CSV/JSON formats

### Configuration

**Model Selection**: Choose between YOLO11 (primary) or YOLOv5 (fallback)
```bash
# Via environment
ML_MODEL=yolo11  # or yolov5

# Via web interface
Settings → Model Configuration → Select Model
```

**Processing Parameters**:
- **Chunk Duration**: 10-second video segments (configurable)
- **Processing Delay**: 10-30 seconds for real-time display
- **Confidence Threshold**: 0.5 for detections, 0.3 for pose points

## 🧪 Testing

```bash
# Run all tests
npm test

# Specific test suites
npm run test:unit      # Unit tests (Jest/Vitest)
npm run test:e2e       # End-to-end tests (Playwright)

# ML model tests
cd backend/ml-service
python -m pytest tests/ -v
```

**Test Coverage**: 130+ tests covering API endpoints, ML models, frontend components, and full user workflows.

## 📊 Performance

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 4 cores | 8+ cores |
| **RAM** | 8GB | 16GB+ |
| **GPU** | CPU mode | NVIDIA RTX 3060+ |
| **Storage** | 10GB | 50GB+ |
| **Network** | 100 Mbps | 1 Gbps |

### Performance Targets

- **Detection Speed**: >50 FPS processing target
- **Real-time Latency**: 10-30 second processing delay
- **Concurrent Streams**: Up to 10 simultaneous video feeds
- **Horse Tracking**: 99%+ accuracy with 512-dim feature vectors

## 🔧 Configuration

### Environment Variables

Key configuration options (see `.env.example` for complete list):

```bash
# Database
DATABASE_URL=postgresql://admin:password@localhost:5432/barnhand

# ML Processing
ML_DEVICE=cpu                    # or cuda for GPU
CONFIDENCE_THRESHOLD=0.5         # Detection confidence
CHUNK_DURATION=10               # Video chunk length (seconds)
PROCESSING_DELAY=20             # Real-time delay (seconds)

# Video Streaming
VIDEO_FOLDER=./media            # Local video directory
STREAM_COUNT=5                  # Number of test streams
```

### Service Ports

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8000
- **Stream Service**: http://localhost:8001
- **ML Service**: http://localhost:8002
- **Video Streamer**: http://localhost:8003

## 🚨 Troubleshooting

### Common Issues

**Docker Compose Issues**:
```bash
# Use docker compose (not docker-compose)
docker compose up -d

# Check service logs
docker compose logs -f [service-name]
```

**GPU Not Detected**:
```bash
# Check GPU availability
nvidia-smi

# Fallback to CPU mode
echo "ML_DEVICE=cpu" >> .env
```

**Port Conflicts**:
```bash
# Check port usage
lsof -i :8000

# Modify ports in .env file
API_GATEWAY_PORT=8001
```

**📋 Complete Troubleshooting Guide**: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions.

## 📚 Documentation

- **[SETUP.md](SETUP.md)** - Detailed installation instructions
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions
- **[CHECKPOINTS.md](CHECKPOINTS.md)** - Version milestones and rollback guide
- **[API Documentation](docs/)** - Complete API reference
- **[Architecture Guide](docs/horse_streaming_architecture.md)** - Technical architecture

## 🏗️ Development

### Project Structure

```
BarnHand/
├── frontend/              # React 18 + TypeScript + Vite
├── backend/
│   ├── api-gateway/       # Express.js API (port 8000)
│   ├── stream-service/    # Node.js chunk processor (port 8001)
│   ├── ml-service/        # Python FastAPI ML inference (port 8002)
│   └── video-streamer/    # FFmpeg HLS streaming (port 8003)
├── models/                # YOLO11, YOLOv5, RTMPose models
├── media/                 # Local test videos
├── infrastructure/        # Docker & deployment configs
├── testing/              # Test suites (unit, integration, e2e)
└── docs/                 # Technical documentation
```

### Development Commands

```bash
# Install all dependencies
npm run install:all

# Development servers
npm run dev                # All services concurrently
npm run dev:frontend       # React dev server
npm run dev:api           # API Gateway
npm run dev:stream        # Stream Service
npm run ml:dev            # ML Service

# Database operations
npm run db:migrate        # Run migrations
npm run db:seed          # Seed test data
npm run db:reset         # Reset database

# Code quality
npm run lint             # ESLint + Prettier
npm run typecheck        # TypeScript checking
```

### Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📈 Roadmap

### Current Version: v1.0.1
- ✅ Complete horse detection and tracking
- ✅ Real-time pose analysis and biomechanics
- ✅ Multi-stream dashboard with WebSocket updates
- ✅ Comprehensive testing and documentation

### Future Releases
- **v1.1.0**: YouTube Live stream integration
- **v1.2.0**: Advanced biomechanical analysis
- **v1.3.0**: Mobile application
- **v2.0.0**: Cloud deployment and scaling

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

- **📧 Email**: kevin@barnhand.ai
- **🐛 Issues**: [GitHub Issues](https://github.com/bricekevin/BarnHand/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/bricekevin/BarnHand/discussions)
- **📖 Wiki**: [Project Wiki](https://github.com/bricekevin/BarnHand/wiki)

## 🌟 Acknowledgments

- **YOLO**: Object detection by Ultralytics
- **RTMPose**: Pose estimation by OpenMMLab
- **TimescaleDB**: Time-series database optimization
- **pgvector**: Vector similarity search in PostgreSQL

---

**Built with ❤️ for the equestrian community**

*BarnHand - Intelligent insights for better horse care*