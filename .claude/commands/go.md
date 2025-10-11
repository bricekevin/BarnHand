# BarnHand Development Session Command

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
- Docs in docs folder

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
│ ├── phase1/
│ ├── phase2/
│ └── [other docs] # Be sure to search here for docs by name
├── testing/ # Test suites
└── scripts/ # Utility scripts

## SESSION START PROTOCOL

### 1. MANDATORY: Read Current State

```bash
# Read these IN ORDER before any work:
1. docs/HANDOFF_NOTES.md (or phase-specific handoff notes)
2. git log --oneline -10
3. git status
4. docker compose ps
CRITICAL: The handoff notes contain context about what was done last session, current blockers, and next priorities. READ THEM FIRST.
2. Review Relevant Documentation
Based on task keywords, automatically reference:

video/streaming/playback → docs/horse_streaming_implementation.md, docs/horse_streaming_architecture.md
ML/detection/pose/tracking → backend/ml-service/README.md, test_advanced_state_pipeline.py
chunk/processing → Phase 2 docs in docs/phase2/
frontend/UI/component → docs/styles.md, frontend component structure
database/schema → backend/database/src/migrations/sql/
deployment/docker → docker-compose.yml, service Dockerfiles

3. Understand Before Changing
IMPORTANT: This is an integrated system. Before modifying any component:

Trace how it connects to other services
Check for existing patterns (don't reinvent)
Verify you won't break existing functionality
Look for TODO markers or existing partial implementations

TASK: {USER_SPECIFIED_TASK}
EXECUTION APPROACH
Phase 1: Planning & Assessment

Break down task into logical, testable steps
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
Service Ports:

Frontend Dev: http://localhost:5174 (Vite HMR)
Frontend Prod: http://localhost:3000
API Gateway: http://localhost:8000
Stream Service: http://localhost:8001
ML Service: http://localhost:8002 (health: /health)
Video Streamer: http://localhost:8003
PostgreSQL: localhost:5432
Redis: localhost:6379

TESTING GUIDELINES
Always test in Docker:

❌ NO local npm run dev or python main.py
✅ YES docker compose up -d --build [service]

Testing Flow:

Make code changes
Rebuild affected service(s)
Check logs for errors
Provide Kevin with specific steps to verify in browser
Use Playwright MCP for automated frontend checks if applicable

Frontend Testing:

Login: admin@barnhand.com / admin123
Navigate to specific feature being tested
Check browser console for errors
Verify WebSocket connections (if applicable)

ML Service Testing:
bash# Health check
curl http://localhost:8002/health

# Process test chunk
curl -X POST http://localhost:8002/api/process-chunk \
  -H "Content-Type: application/json" \
  -d '{"chunk_id":"test","chunk_path":"/path","farm_id":"farm1","stream_id":"stream1"}'
SESSION LOGGING
Work Session Log Entry
After completing work, add entry to docs/WORK_LOG.md:
markdown---
## Session [N] - [Date] - [Brief Description]

**Duration**: ~X hours

**Completed**:
- Task 1 description
- Task 2 description

**Files Changed**:
- path/to/file.ts - what changed
- path/to/file.py - what changed

**Git Commits**:
- abc1234 - commit message
- def5678 - commit message

**Testing Notes**:
- What was tested
- Any issues found
- Performance observations

**Decisions Made**:
- Why approach X was chosen over Y
- Any trade-offs considered

**Next Session Should**:
- Priority task 1
- Priority task 2
Handoff Notes Update
Update docs/HANDOFF_NOTES.md (or phase-specific) with:
markdown---
## Last Work Session

**Date**: [Current Date and Time]

**Current Status**:
[What's working now, what state the system is in]

**Completed This Session**:
- [x] Task description
- [x] Task description

**In Progress**:
- [~] Partially complete task

**Next Priority Tasks**:
1. Task with reasoning why it's next
2. Task with reasoning

**Known Issues/Blockers**:
- Issue description and potential solution
- Blocker and what's needed to unblock

**Testing Instructions**:
[How to verify what was built, specific commands/steps]

**Important Context**:
[Critical info the next session needs to know]
KEVIN'S WORK PREFERENCES

✅ Concise and efficient: Skip preambles, get to the point
✅ Parse typos: Understand intent from context
✅ Challenge ideas: Suggest better approaches when warranted
✅ Just the output: For code/text requests, provide directly without explanation (unless asked)
✅ Complete solutions: Don't leave obvious next steps unfinished
❌ No over-explanation: Don't repeat yourself or explain obvious things
❌ No unnecessary follow-ups: Include everything needed in one response

CRITICAL REMINDERS

READ HANDOFF NOTES FIRST - Contains essential context from last session
Docker-only testing - Never test locally, always in containers
Understand before changing - This is an integrated system, changes ripple
Update existing docs - Don't proliferate new markdown files
Small commits - Easier to debug and rollback
Collaborative testing - Give Kevin clear steps, use Playwright MCP
Follow established patterns - Check existing code for similar features
Log your work - Future sessions depend on good notes

AVAILABLE TOOLS

Playwright MCP: Automated frontend testing and screenshots
Docker logs: Real-time service debugging
Git history: Understanding past decisions
Existing test suites: Unit, integration, E2E tests
Health endpoints: Quick service status checks
```
