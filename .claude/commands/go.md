markdown# BarnHand Development Session Command

You are working on BarnHand, an intelligent horse streaming platform with ML-powered video detection, tracking, and behavioral analysis. This is an actively evolving system where understanding the complete architecture is CRITICAL before making any changes.

## PROJECT OVERVIEW

**Core System:**

- Real-time video processing with chunk-based ML inference
- Multi-horse tracking with persistent IDs across chunks
- Pose estimation (17 keypoints) and behavioral state detection
- HLS streaming with synchronized detection overlays

**Tech Stack:**

- Frontend: React 18 + TypeScript + Vite (dev: 5174, prod: 3000)
- Backend: Express.js API Gateway (8000), Node.js Stream Service (8001), Python ML Service (8002), FFmpeg Video Streamer (8003)
- ML Models: YOLO11 (primary), YOLOv5 (fallback), RTMPose-M AP10K, MegaDescriptor ReID
- Database: PostgreSQL + TimescaleDB + pgvector
- Cache/Queue: Redis
- Infrastructure: Docker Compose (ALL development/testing in Docker)

**Project Structure:**
BarnHand/
├── frontend/ # React app
├── backend/
│ ├── api-gateway/ # Express.js REST API + WebSocket
│ ├── stream-service/ # Node.js chunk processor
│ ├── ml-service/ # Python FastAPI ML inference
│ ├── video-streamer/ # FFmpeg HLS streaming
│ └── database/ # Migrations and schema
├── models/ # ML model weights (138MB)
├── media/ # Test videos
├── docs/ # Phase folders + general docs
│ ├── phase1/ # Phase 1 planning docs
│ ├── phase2/ # Phase 2 planning docs
│ ├── phase[N]/ # Future phase planning
│ │ ├── [epic]-overview.md # PM-generated overview
│ │ └── [epic]-tasks.md # PM-generated task checklist
│ └── [general docs] # Architecture, styles, implementation guides
├── testing/ # Test suites
└── scripts/ # Utility scripts

## SESSION START PROTOCOL

### 1. MANDATORY: Read Current State

```bash
# Read these IN ORDER before any work:
1. docs/HANDOFF_NOTES.md (or phase-specific handoff notes)
2. docs/phase[N]/[epic-name]-tasks.md (if working from PM-generated plan)
3. git log --oneline -10
4. git status
5. docker compose ps
CRITICAL: The handoff notes contain context about what was done last session, current blockers, and next priorities. READ THEM FIRST.
If working from a planned EPIC: Check docs/phase[N]/ for:

[epic-name]-overview.md - Strategic context and architecture decisions
[epic-name]-tasks.md - Task checklist with detailed implementation steps

2. Review Relevant Documentation
Based on task keywords, automatically reference:

video/streaming/playback → docs/horse_streaming_implementation.md, docs/horse_streaming_architecture.md
ML/detection/pose/tracking → backend/ml-service/README.md, test_advanced_state_pipeline.py
chunk/processing → Phase 2 docs in docs/phase2/
frontend/UI/component → docs/styles.md, frontend component structure
database/schema → backend/database/src/migrations/sql/
deployment/docker → docker-compose.yml, service Dockerfiles
phase planning → docs/phase[N]/[epic-name]-overview.md and [epic-name]-tasks.md

3. Understand Before Changing
IMPORTANT: This is an integrated system. Before modifying any component:

Trace how it connects to other services
Check for existing patterns (don't reinvent)
Verify you won't break existing functionality
Look for TODO markers or existing partial implementations

TASK: {USER_SPECIFIED_TASK}
EXECUTION APPROACH
Phase 1: Planning & Assessment

Break down task into logical, testable steps (or follow PM-generated task breakdown)
Identify all affected components/services
Check for existing implementations or patterns to follow
Confirm approach before implementing

Phase 2: Implementation

Docker-only workflow: All changes must run in Docker
Commit strategy: Small, focused commits with conventional format (feat:, fix:, docs:, test:)
Update existing files: Prefer modifying over creating new (unless truly needed)
Follow established patterns: Review similar implementations first

Phase 3: Testing (Collaborative)

Provide clear testing steps for Kevin to execute
Use Playwright MCP for automated frontend testing when applicable
Request inspection of Docker logs: docker compose logs -f [service]
Verify end-to-end flow, not just individual components

Phase 4: Documentation

Update EXISTING docs (don't create new unless necessary)
Add session notes to work log (see format below)
Update handoff notes for next session
Update task checklist (if working from PM plan): mark tasks [x] complete or [~] in progress

DOCKER WORKFLOW
Service Management:
bash# Start all services
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
