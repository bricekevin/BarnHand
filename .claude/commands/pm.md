# BarnHand Product Manager - EPIC Breakdown

You are breaking down an EPIC into implementable tasks for BarnHand, a horse streaming platform with ML-powered detection and tracking.

## CONTEXT

**Current System:**

- Video chunk recording
- ML processing: YOLO11 + RTMPose + MegaDescriptor ReID
- Real-time detection overlays via WebSocket
- Multi-horse tracking with persistent IDs
- React frontend (5174) + Express API (8000) + Python ML (8002) + FFmpeg (8003)
- All services run in Docker

**Key Architecture Patterns:**

- Chunk-based processing (not continuous stream)
- Async ML (fire-and-forget, don't block user)
- Microservices (api-gateway, stream-service, ml-service, video-streamer)
- TimescaleDB for time-series, pgvector for embeddings
- WebSocket for real-time updates

## EPIC: {USER_EPIC_DESCRIPTION}

---

## YOUR TASK

1. **Review existing code** - Search for similar features, patterns to reuse
2. **Break down EPIC** - Create stories based on size and need
3. **Size appropriately** - Each task = 1-2 hours, ~5-10 files max
4. **Include testing** - Unit, integration, regression, E2E instructions for each task
5. **Output 3 documents** - Overview + Task checklist + Phase command

## STEP 1: ANALYZE CODEBASE

Before planning, check:

```bash
# Find related code
grep -r "relevant_keyword" frontend/src/ backend/
ls docs/Phase*/*.md
cat docs/horse_streaming_architecture.md
```

Answer:

- What exists already that we can use?
- What services are affected?
- What's the data flow? (Frontend → API → Service → DB)
- What testing patterns exist for this area?

## STEP 2: CREATE PHASE STRUCTURE

Break EPIC into phases:

- Phase 0: Foundation (if needed - schema, types, document current state)
- Phase 1-3: Core implementation (backend → API → frontend → integration)
- Phase N: Testing & Polish (comprehensive tests, docs, optimization)

Each task within a phase should:

- ✅ Complete in one session
- ✅ Be independently testable
- ✅ Have clear acceptance criteria
- ✅ Reference existing patterns

## STEP 3: GENERATE DOCUMENTS

Use the examples below as templates for consistent output.

---

### EXAMPLE DOCUMENT 1: Overview Template

```markdown
# Stream-Level Horse Registry - Phase 3 Overview

## Goal

Upgrade the current chunk-level horse ReID system to maintain persistent horse identities per stream. Add a "Detected Horses" tab in the stream page UI to display, manage, and annotate horses detected across all chunks in that stream.

## Scope

**Includes**:

- Persistent per-stream horse registry in PostgreSQL (survives server reboots)
- Redis-backed horse state for cross-chunk continuity
- New "Detected Horses" tab in Stream UI
- Horse avatar thumbnails and assigned tracking colors
- Manual horse naming/details editing interface

**Excludes**:

- Cross-stream horse matching (Phase 4)
- Advanced horse profile features (age, breed, health - Phase 4)
- Automatic horse naming with computer vision

## Architecture Changes

### Frontend

- **New Tab Component**: `DetectedHorsesTab.tsx` - displays horse registry grid
- **New Horse Card Component**: `HorseCard.tsx` - shows avatar, ID, name
- **Updated**: `PrimaryVideoPlayer.tsx` - add 3rd tab for "Detected Horses"
- **Updated**: `OverlayCanvas.tsx` - show horse name + ID in overlays

### Backend - API Gateway

- **Updated**: `/api/v1/streams/:id/horses` - GET stream horse registry
- **New**: `/api/v1/streams/:id/horses/:horseId` - GET/PUT specific horse

### Backend - ML Service (Python)

- **Updated**: `horse_tracker.py` - load stream horses from Redis on init
- **Updated**: `processor.py` - persist horses to DB after each chunk
- **New Logic**: Load known horses on chunk start for matching

### Database

- **Updated Schema**: Add `avatar_thumbnail` BYTEA column to horses table
- **New Migration**: Add stream_id index for fast per-stream queries

## Data Flow

1. **Chunk Start**: ML service loads known horses for stream from Redis/PostgreSQL
2. **Frame Processing**: Tracker matches detections against known horses using ReID
3. **New Horse Detected**: Create new horse entry with auto-ID, color, thumbnail
4. **Chunk Complete**: Save all horses (new + updated) to PostgreSQL + Redis
5. **Frontend Update**: WebSocket `horses:updated` event triggers UI refresh

## Key Decisions

**Decision 1: Per-Stream vs Global Horse Registry**

- **Choice**: Per-stream first (Phase 3), global later (Phase 4)
- **Rationale**: Simpler implementation, avoids cross-stream false positives

**Decision 2: Redis + PostgreSQL Hybrid Storage**

- **Choice**: Redis for active chunk state (5min TTL), PostgreSQL for permanent registry
- **Rationale**: Redis enables fast cross-chunk lookups, PostgreSQL survives reboots

## Testing Strategy

- Unit: Horse persistence to DB + Redis, loading known horses on init
- Integration: E2E chunk processing with pre-existing horses
- E2E: Record chunk → horse appears in tab; Record 2nd chunk → same horse ID

## Success Metrics

- Performance: Horse registry loads <500ms for 50 horses
- Functionality: >95% re-identification accuracy across chunks
- UX: User can rename horse and name appears in overlays within 1 second

## Risks

**Risk 1: False Re-identification** - Different horses matched as same

- Mitigation: Conservative similarity threshold (0.75), manual split feature in Phase 4

## Estimate

Total: 14-16 hours across 12 tasks
```

---

### EXAMPLE DOCUMENT 2: Tasks Template

```markdown
# Stream-Level Horse Registry - Task Checklist

## Phase 0: Foundation

### Task 0.1: Update Database Schema for Per-Stream Horses

**Objective**: Add avatar storage and optimize per-stream horse queries

**Files**:

- `backend/database/migrations/003_add_horse_avatars.sql` (NEW)
- `backend/database/src/types.ts` (UPDATE)
- `shared/src/types/horse.types.ts` (UPDATE)

**Steps**:

1. Create migration file `003_add_horse_avatars.sql`
2. Add `avatar_thumbnail BYTEA` column to horses table
3. Add `stream_id` index: `CREATE INDEX idx_horses_stream_id ON horses(stream_id)`
4. Update TypeScript types to include `avatar_thumbnail?: string` (base64)
5. Update `HorseSchema` in shared types to include optional avatar field

**Testing**:

- [ ] Unit: Run migration against test database, verify schema
- [ ] Integration: Insert horse with avatar, retrieve successfully
- [ ] Regression: Existing horse queries still work without avatar
- [ ] Manual: Run `psql` and check horses table structure

**Acceptance**:

- [ ] Migration applies cleanly on fresh database
- [ ] Migration applies cleanly on existing database with horses
- [ ] Avatar column accepts BYTEA data up to 100KB
- [ ] stream_id index improves query performance (EXPLAIN ANALYZE)
- [ ] Tests pass in Docker

**Reference**: Similar migration pattern in `backend/ml-service/src/services/horse_database.py:254-326`

---

### Task 0.2: Document Current ReID State

**Objective**: Audit existing ReID system and document integration requirements

**Files**:

- `docs/Phase 3 - Stream Horse Registry/REID_INTEGRATION.md` (NEW)

**Steps**:

1. Document current HorseTracker initialization flow
2. Identify integration points for loading/saving horses
3. Document Redis persistence logic
4. Create integration checklist for Phase 1

**Testing**:

- [ ] Manual: Review document with team
- [ ] Manual: Verify all integration points identified

**Acceptance**:

- [ ] Document covers all ReID state management
- [ ] Integration points clearly marked with line numbers

**Reference**: Review `horse_tracker.py:40-89` for initialization pattern

---

## Phase 1: Backend Implementation

### Task 1.1: Add Horse Registry Persistence Methods

**Objective**: Extend HorseRepository with stream-specific queries

**Files**:

- `backend/database/src/repositories/HorseRepository.ts` (UPDATE)
- `backend/database/src/__tests__/repositories/HorseRepository.test.ts` (UPDATE)

**Steps**:

1. Add `findByStreamId(streamId: string): Promise<Horse[]>` method
2. Add `updateAvatar(horseId: string, avatarData: Buffer): Promise<void>` method
3. Update `create` method to accept optional avatar_thumbnail
4. Add tests for new methods

**Testing**:

- [ ] Unit: Test findByStreamId returns correct horses for stream
- [ ] Unit: Test updateAvatar saves and retrieves JPEG correctly
- [ ] Integration: Test with real PostgreSQL container
- [ ] Regression: Existing HorseRepository methods still work

**Acceptance**:

- [ ] All new methods have >80% test coverage
- [ ] Avatar images compressed to <50KB
- [ ] Query performance <100ms for 50 horses per stream
- [ ] Tests pass in Docker

**Reference**: Existing pattern in `HorseRepository.ts:28-50` for create method

---

## Phase 2: Frontend Implementation

[Continue with similar task structure...]

---

## Phase 3: Integration & Polish

[Continue with similar task structure...]

---

## Handoff Notes Template

**Date**: [Timestamp]

**Completed**:

- [x] Task X.Y - Brief summary

**In Progress**:

- [~] Task A.B - Current status, what's left

**Next Priority**:

1. Task C.D - Rationale for priority

**Blockers**: [None | Description]

**Testing Notes**: [Results from manual testing]

**Context**: [Critical info for next session]
```

---

### EXAMPLE DOCUMENT 3: Phase Command Template

````markdown
# Phase 3: Stream Horse Registry - Task Execution

You are implementing **Phase 3** of BarnHand: persistent per-stream horse registry with UI management.

## QUICK START

**Read these FIRST** (in order):

1. `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-tasks.md` - Find current task
2. `docs/HANDOFF_NOTES.md` - Last session context
3. `git status` - Current changes

**Phase 3 Docs**:

- **Overview**: `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-overview.md`
- **Tasks**: `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-tasks.md`

## TASK EXECUTION

### 1. Find Current Task

Look in `stream-horse-registry-tasks.md` for:

- `[~]` = In progress (YOUR TASK)
- `[ ]` = Next task if none in progress

Read your task section: **Objective**, **Files**, **Steps**, **Testing**, **Acceptance**, **Reference**

### 2. Implement Task Steps

Follow steps 1-7 in your task. For each step:

- Read "Reference" code pattern first
- Implement the step
- Commit: `p3(task-X.Y): <step description>`

**Key Patterns**:

```typescript
// Backend API (Task 1.3)
router.get('/:id/horses', requireRole([...]), createAuthenticatedRoute(async (req, res) => {
  const horses = await streamHorseService.getStreamHorses(req.params.id, req.user.farmId);
  return res.json({ horses });
}));
```
````

```python
# ML Integration (Task 1.4) - CRITICAL
async def process_chunk(chunk_id: str, stream_id: str):
    # Load known horses BEFORE processing
    known_horses = await horse_db.load_stream_horse_registry(stream_id)
    tracker = HorseTracker(stream_id=stream_id, known_horses=known_horses)
    # ... process ...
    # Save horses AFTER processing
    await horse_db.save_stream_horse_registry(stream_id, tracker.get_all_tracks())
```

```typescript
// Frontend Tab (Task 2.1, 2.4)
const tabs = [
  { id: 'live', label: 'Live Stream' },
  { id: 'chunks', label: 'Recorded Chunks' },
  { id: 'horses', label: 'Detected Horses' }, // NEW
];
```

### 3. Test (Complete ALL before next task)

Check off boxes in task "Testing" section:

- [ ] Unit tests
- [ ] Integration tests
- [ ] Regression tests
- [ ] Manual tests

```bash
# Test commands
docker compose up -d --build [ml-service|api-gateway|frontend]
docker compose logs -f [service]
cd frontend && npm test
```

### 4. Mark Complete

Update task in `stream-horse-registry-tasks.md`:

- Change `[ ]` to `[x]` when all Testing + Acceptance boxes checked
- Update `docs/HANDOFF_NOTES.md` with progress

## CRITICAL TASKS

**Task 1.4** (ML Integration):

- `processor.py:200` - Load horses before processing
- `processor.py:450` - Save horses after processing
- Test: 2 chunks with same horse → verify same ID

**Task 2.4** (Tab Integration):

- `PrimaryVideoPlayer.tsx:50-80` - Add 3rd tab to tabs array

**Task 3.1** (WebSocket):

- Add `streamHorses` to Zustand store
- Subscribe to `horses:detected` events

## QUICK DEBUG

```bash
# Horse not persisting?
docker compose exec redis redis-cli KEYS "horse:*"
docker compose exec postgres psql -U barnhand -c "SELECT tracking_id, stream_id FROM horses"

# Name not showing?
curl localhost:8000/api/v1/streams/[id]/chunks/[chunkId]/detections | jq '.detections[0].horse_name'
```

---

**NOW**: Check `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-tasks.md` for your current task and execute steps 1-4.

```

---

## YOUR ACTUAL TASK

Now use these templates to generate the three documents for the user's EPIC.

**Format folder as**: `docs/Phase [N] - [Epic Title]/`

**Generate**:
1. `docs/Phase [N] - [Epic Title]/[epic-name]-overview.md` - Follow Example 1 structure
2. `docs/Phase [N] - [Epic Title]/[epic-name]-tasks.md` - Follow Example 2 structure
3. `.claude/commands/p[N].md` - Follow Example 3 structure (keep under 200 lines)

**Key for Phase Command**:
- Include 2-3 most common code patterns for this phase
- List 2-3 CRITICAL tasks with file:line references
- Include 3-5 debug commands specific to common issues

## OUTPUT FORMAT

After creating all three documents, print:

```

✅ EPIC Planning Complete

📁 Phase Folder: docs/Phase [N] - [Epic Title]/
📄 Overview: docs/Phase [N] - [Epic Title]/[epic-name]-overview.md
📋 Tasks: docs/Phase [N] - [Epic Title]/[epic-name]-tasks.md
⚡ Command: .claude/commands/p[N].md

Summary:

- Phases: X
- Tasks: Y total
- Estimate: Z hours
- Critical dependencies: [list]

Next Steps:

1. Use /p[N] command to start working through tasks
2. Each session: /p[N] → find current task → implement → test → complete

```

## REQUIREMENTS CHECKLIST

Before outputting, verify:
- ✅ Tasks are 1-2 hour chunks
- ✅ Each task references existing patterns
- ✅ Testing included for every task
- ✅ Phase command is concise (<200 lines)
- ✅ Folder structure: `docs/Phase [N] - [Epic Title]/`
- ✅ Phase command includes critical tasks + debug tips

---

**ARGUMENTS**: {USER_EPIC_DESCRIPTION}
```
