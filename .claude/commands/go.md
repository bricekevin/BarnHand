markdown# BarnHand Development Session Start

You are working on BarnHand, an intelligent horse streaming platform with ML-powered video detection, tracking, and behavioral analysis.

## CURRENT STATE

**Branch**: `feature/documentation`
**Recent Completion**: Barn-based ReID implementation (cross-stream horse tracking) ✅

**Key Recent Work**:
- ✅ Barn-based ReID pooling (horses tracked across all streams in same barn)
- ✅ Horse ID collision fixes and performance profiling
- ✅ Stream-to-barn management infrastructure
- ✅ Frontend improvements: horse context display, stream management UI

## PROJECT OVERVIEW

**Core System:**
- Real-time video processing with 10s chunk-based ML inference
- Multi-horse tracking with barn-scoped persistent ReID
- Pose estimation (17 keypoints) + behavioral state detection
- HLS streaming with synchronized detection overlays

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite + Zustand (dev: 5174, prod: 3000)
- Backend: Express.js API Gateway (8000), Node.js Stream Service (8001), Python ML Service (8002), Video Streamer (8003)
- ML Models: YOLO11 (primary), YOLOv5 (fallback), RTMPose-M AP10K, MegaDescriptor ReID
- Database: PostgreSQL + TimescaleDB + pgvector (512-dim feature vectors)
- Cache/Queue: Redis (real-time tracking state + processing queue)
- Infrastructure: Docker Compose (ALL development/testing in Docker)

**Project Structure:**
```
BarnHand/
├── frontend/                    # React app
├── backend/
│   ├── api-gateway/            # Express.js REST API + WebSocket
│   ├── stream-service/         # Node.js chunk processor
│   ├── ml-service/             # Python FastAPI ML inference
│   ├── video-streamer/         # FFmpeg HLS streaming
│   └── database/               # Migrations and schema
├── models/                     # ML model weights (138MB)
├── media/                      # Test videos
├── docs/
│   ├── BARN_BASED_REID_IMPLEMENTATION.md  # Recent completion
│   ├── BARN_REID_QUICK_REFERENCE.md       # Quick reference
│   └── [other docs]            # Architecture, styles, guides
├── testing/                    # Test suites
└── scripts/                    # Utility scripts
```

## SESSION START PROTOCOL

### 1. MANDATORY: Read Current State (IN ORDER)

```bash
1. docs/HANDOFF_NOTES.md        # Last session context
2. git status                   # Current uncommitted changes
3. git log --oneline -10        # Recent commits
```

**CRITICAL**: Handoff notes contain what was done last session, current blockers, and next priorities.

### 2. Context-Specific Documentation (by topic)

**By Topic** (auto-reference based on keywords):
- **video/streaming/playback** → `docs/horse_streaming_implementation.md`, `docs/horse_streaming_architecture.md`
- **ML/detection/pose/tracking** → `backend/ml-service/README.md`, `backend/ml-service/src/services/processor.py`
- **ReID/horse matching** → `docs/BARN_BASED_REID_IMPLEMENTATION.md`, `backend/ml-service/src/services/horse_database.py`
- **chunk processing** → `backend/stream-service/`
- **frontend/UI/components** → `docs/styles.md`, `frontend/src/components/`
- **database/schema** → `backend/database/src/migrations/sql/`
- **barn/farm management** → `backend/api-gateway/src/services/settingsService.ts`

### 3. Understand System Architecture Before Changing

**IMPORTANT**: This is an integrated system with multiple services. Before modifying:

1. **Trace connections**: How does this component interact with other services?
2. **Check patterns**: Look for existing implementations to follow (don't reinvent)
3. **Verify safety**: Will this break existing functionality?
4. **Check TODOs**: Are there partial implementations or notes?

**Data Flow to Understand**:
- Video chunks → ML Service → Detections → API Gateway → Frontend
- Horse ReID: Barn-scoped pool (all streams in barn share horse registry)
- Stream assignment: farm_id links streams to barns
- Redis: Real-time state, PostgreSQL: Persistent storage

---

## EXECUTION APPROACH

### Phase 1: Planning & Assessment
1. Break down task into logical, testable steps
2. Identify all affected components/services
3. Check for existing implementations or patterns to follow
4. Confirm approach before implementing if task is complex

### Phase 2: Implementation
- **Docker-first**: All changes must run in Docker containers
- **Commit strategy**: Small, focused commits
  - Format: `{type}(scope): description`
  - Types: feat, fix, docs, test, refactor, chore
- **File changes**: Prefer modifying existing files over creating new ones
- **Pattern matching**: Review similar implementations before writing new code
- **Test as you go**: Don't wait until end to test

### Phase 3: Testing & Validation
- **Unit tests**: Write tests alongside implementation
- **Integration tests**: Test service interactions in Docker
- **Manual testing**: Provide clear testing steps for validation
- **E2E tests**: Use Playwright MCP for automated frontend testing
- **Logs**: Always check Docker logs: `docker compose logs -f [service]`
- **End-to-end**: Verify complete flow, not just individual components

### Phase 4: Documentation & Handoff
- **Update existing docs**: Don't create new docs unless necessary
- **Handoff notes**: Update `docs/HANDOFF_NOTES.md` at session end with:
  - What was completed
  - Current blockers (if any)
  - Next priorities
  - Testing notes
  - Context for next developer

---

## DOCKER WORKFLOW

### Service Management

```bash
# Start all services
docker compose up -d

# Rebuild specific service after changes
docker compose up -d --build [service-name]

# View logs (essential for debugging)
docker compose logs -f [service-name]

# Restart without rebuild
docker compose restart [service-name]

# Stop everything
docker compose down

# Clean restart (if needed)
docker compose down -v && docker compose up -d --build
```
