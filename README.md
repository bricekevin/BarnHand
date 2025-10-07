# BarnHand Horse Streaming Platform

**Intelligent horse streaming platform with real-time detection, tracking, and behavioral analysis using advanced ML models.**

[![Version](https://img.shields.io/badge/version-0.9.0-blue.svg)](https://github.com/yourusername/barnhand)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://python.org/)

## 🎯 Overview

BarnHand processes video streams in 10-second chunks to deliver real-time horse detection, pose analysis, and **advanced behavioral analysis** with a 10-30 second processing delay. The platform serves processed video with overlays back to the frontend for comprehensive equine monitoring.

### 🆕 Phase 2: Behavioral Analysis Integration

**Now featuring advanced behavioral analysis capabilities:**
- **MegaDescriptor ReID**: Wildlife-grade re-identification with 768-dimensional features
- **Real-time State Detection**: Hierarchical and advanced behavioral state analysis  
- **Cross-chunk Continuity**: Persistent horse tracking across video segments
- **Behavioral Timeline**: Interactive visualization of horse activities and states
- **Alert System**: Configurable alerts for significant behavioral changes
- **Comprehensive API**: RESTful endpoints for behavioral data access

## 🏗️ Architecture

```
Frontend (React) → API Gateway → Stream Service → ML Service → Processed Video + Overlays
                               ↓
                    Behavioral Analysis Engine
                               ↓
                    PostgreSQL + TimescaleDB + Redis
```

### Core Components

- **Frontend**: React 18 + TypeScript + Vite with Zustand state management
- **API Gateway**: Express.js (port 8000) with JWT auth, RBAC, and behavioral endpoints
- **Stream Service**: Node.js chunk processor (port 8001) - 10s video chunks
- **ML Service**: Python FastAPI (port 8002) - YOLO11/YOLOv5 + RTMPose + Behavioral Analysis
- **Video Streamer**: Local HLS server (port 8003) for test videos
- **Database**: PostgreSQL + TimescaleDB for behavioral time-series data
- **Cache**: Redis for real-time data and cross-chunk horse persistence

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- 8GB+ RAM (16GB+ recommended for ML processing)
- NVIDIA GPU (optional but recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/barnhand.git
   cd barnhand
   ```

2. **Environment setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Download ML models**
   ```bash
   ./scripts/download_models.sh
   ```

4. **Start services**
   ```bash
   docker-compose up -d
   ```

5. **Run tests (optional)**
   ```bash
   npm run test           # All tests
   npm run test:e2e       # E2E tests
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - API Gateway: http://localhost:8000
   - Video Streams: http://localhost:8003

### Development Mode

```bash
# Individual services
npm run api:dev          # API Gateway
npm run ml:dev           # ML Service  
npm run frontend:dev     # React Frontend

# Database operations
npm run db:migrate       # Run migrations
npm run db:seed         # Seed test data
```

## 🧠 Behavioral Analysis Features

### 🔬 Advanced State Detection

- **Hierarchical State Detection**: Multi-level behavioral analysis
  - Body states: grazing, standing, walking, running, lying
  - Head position tracking: up, down, alert
  - Leg activity monitoring: standing, moving, resting

- **Advanced State Detection**: Temporal analysis and pattern recognition
  - Movement pattern analysis with velocity tracking
  - Gait classification: walk, trot, canter
  - Activity intensity scoring: low, medium, high
  - Alert generation for significant behavioral changes

### 🎯 Horse Re-identification

- **MegaDescriptor Model**: State-of-the-art wildlife ReID
  - 768-dimensional feature vectors
  - >95% re-identification accuracy
  - Cross-chunk horse persistence
  - Similarity threshold: 0.6 (optimized for horses)

- **Fallback CNN Model**: Traditional approach
  - 512-dimensional features  
  - Similarity threshold: 0.7
  - Automatic model switching

### 📊 Real-time Data Processing

- **Cross-chunk Continuity**: Redis-based horse registry with TTL
- **Behavioral Storage**: TimescaleDB hypertables for time-series data
- **WebSocket Events**: Real-time behavioral updates
  - `behavioral:update` - State and action changes
  - `behavioral:alert` - Significant behavioral events
  - `behavioral:summary` - Periodic insights

### 📈 Behavioral Timeline Interface

- **Interactive Timeline**: Duration bars with color-coded states
- **Event Details**: Comprehensive behavioral event information  
- **Confidence Scoring**: ML confidence levels for all detections
- **Alert Visualization**: Visual indicators for significant events
- **Time Range Controls**: 1 hour, 6 hours, 24 hours views

### 🧪 Testing Framework

- **Manual Chunk Processing**: "Process Next 10 Seconds" testing interface
- **Layer-by-layer Validation**: Detection → Pose → Behavioral analysis results
- **Performance Metrics**: FPS, memory usage, processing times
- **Error Reporting**: Detailed error and warning tracking

## 🔧 Configuration

### Environment Variables

Key behavioral analysis configuration options:

```bash
# Behavioral Analysis
REID_MODEL_TYPE=megadescriptor
BEHAVIORAL_CONFIDENCE_THRESHOLD=0.7
ENABLE_HIERARCHICAL_STATE_DETECTION=true
ENABLE_ADVANCED_STATE_DETECTION=true

# Cross-Chunk Persistence  
HORSE_REGISTRY_TTL=300
CROSS_CHUNK_CONTINUITY=true

# Alert Configuration
BEHAVIORAL_ALERTS_ENABLED=true
ALERT_SIGNIFICANCE_THRESHOLD=0.8
CRITICAL_ALERT_THRESHOLD=0.9

# Performance
BEHAVIORAL_ANALYSIS_MAX_FPS=30
BEHAVIORAL_PROCESSING_TIMEOUT=10
```

See `.env.example` for complete configuration options.

### ML Models

- **Primary**: YOLO11 (yolo11m.pt) - confidence threshold 0.5
- **Fallback**: YOLOv5 (yolov5m.pt) - performance comparison  
- **Pose**: RTMPose-M AP10K - 17 keypoints, confidence 0.3
- **ReID**: MegaDescriptor-T-224 via Hugging Face Hub

## 📡 API Reference

### Behavioral Analysis Endpoints

```http
GET /api/v1/behavioral/horses/{id}/timeline
GET /api/v1/behavioral/horses/{id}/current-action  
GET /api/v1/behavioral/horses/{id}/summary
POST /api/v1/behavioral/horses/{id}/moments
POST /api/v1/behavioral/horses/{id}/actions
GET /api/v1/behavioral/streams/{streamId}/activity
```

### WebSocket Events

```javascript
// Subscribe to horse behavioral events
socket.emit('subscribe', 'horse:${horseId}:behavioral');

// Listen for behavioral updates
socket.on('behavioral:update', (data) => {
  console.log('Behavioral state changed:', data);
});
```

## 🧪 Testing

### Test Suites

```bash
# Frontend unit tests (Vitest)
npm run test:unit

# Backend API tests (Jest)  
npm run test:api

# E2E tests (Playwright)
npm run test:e2e

# ML pipeline tests (pytest)
cd backend/ml-service && python -m pytest
```

### Test Coverage

- **Frontend**: React components and Zustand store
- **Backend**: All API endpoints with authentication
- **ML**: Pose analysis, horse tracking, behavioral analysis
- **Integration**: Cross-service communication testing

## 📊 Performance Targets

- **Detection**: >50 FPS processing speed
- **Behavioral Analysis**: >30 FPS with state detection
- **API Response**: <100ms for behavioral endpoints  
- **State Change Latency**: <2 seconds for real-time updates
- **ReID Accuracy**: >95% horse re-identification
- **Cross-chunk Continuity**: <5% ID switching

## 🏠 Data Storage

### Database Schema

- **Streams**: Video source configuration
- **Horses**: Registry with MegaDescriptor feature vectors
- **Detections**: TimescaleDB hypertable for time-series data
- **Horse Behavioral Data**:
  - `horse_pose_frames`: Individual pose frame data
  - `horse_moments`: Behavioral moments and state changes
  - `horse_actions`: Activity analysis with duration and intensity
- **Video Chunks**: Processed segments with overlay metadata

### Data Retention

- **Real-time**: Redis with 300s TTL for active tracks
- **Historical**: TimescaleDB with 90-day retention
- **Features**: PostgreSQL with pgvector indexes for similarity search

## 🎨 Design System

The UI uses a forest/nature theme optimized for equine monitoring:

- **Colors**: Forest greens, cyan accents, earth tones
- **Typography**: Inter (primary), Sora (display), JetBrains Mono (data)
- **Horse Tracking**: 10 distinctive colors for multi-horse identification
- **Animations**: Subtle micro-animations with smooth transitions

## 🔍 Troubleshooting

### Common Issues

**Behavioral analysis not working**
```bash
# Check ML service logs
docker-compose logs ml-service

# Verify environment variables
grep BEHAVIORAL .env

# Test behavioral endpoints
curl http://localhost:8000/api/v1/horses/123/timeline
```

**Models not loading**
```bash
# Download models
./scripts/download_models.sh

# Check model paths
ls -la models/
```

**Database connection issues**
```bash
# Check PostgreSQL
docker-compose ps postgres

# Run migrations
npm run db:migrate

# Test connection
psql postgresql://admin:password@localhost:5432/barnhand
```

### Performance Issues

- **Low FPS**: Check `ML_DEVICE` setting, consider GPU acceleration
- **High Memory**: Reduce `BATCH_SIZE` or `MAX_CONCURRENT_STREAMS`
- **Slow Behavioral Analysis**: Adjust `BEHAVIORAL_CONFIDENCE_THRESHOLD`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code patterns and naming conventions
- Add tests for new features
- Update documentation for API changes
- Use TypeScript for frontend, Python type hints for backend

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **MegaDescriptor**: Advanced wildlife re-identification model
- **RTMPose**: Real-time multi-person pose estimation
- **TimescaleDB**: Time-series database for behavioral data
- **YOLO**: Object detection framework

## 📞 Support

- **Documentation**: Check `/docs` folder for detailed guides
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Use GitHub Discussions for questions

---

**Built with ❤️ for equine enthusiasts and researchers**