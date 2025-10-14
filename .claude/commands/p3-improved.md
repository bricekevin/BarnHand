# Phase 3: Stream Horse Registry - Task Execution

You are implementing **Phase 3** of BarnHand: persistent per-stream horse registry with UI management.

## QUICK START

**Read these FIRST** (in order):
1. `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-tasks.md` - Find current task
2. `docs/HANDOFF_NOTES.md` - Last session context (create if missing using template below)
3. `git status` - Current changes

**Phase 3 Docs**:
- **Overview**: `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-overview.md`
- **Tasks**: `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-tasks.md`
- **Integration Plan**: `docs/Phase 3 - Stream Horse Registry/REID_INTEGRATION.md`

---

## WORKFLOW (CRITICAL: Follow in Order)

### 1. Find Current Task
Look in `stream-horse-registry-tasks.md` for:
- `[~]` = In progress (YOUR TASK - resume this)
- `[ ]` = Next task if none in progress

Read your task section: **Objective**, **Files**, **Steps**, **Testing**, **Acceptance**, **Reference**

### 2. Create TodoWrite Checklist
**BEFORE starting**, create a TodoWrite checklist from the task steps:
```
TodoWrite: [
  "Read reference files",
  "Implement step 1",
  "Implement step 2",
  ...
  "Run tests",
  "Update task checkboxes"
]
```

### 3. Implement Task Steps
Follow steps 1-N in your task. **For each step**:
- Read "Reference" code pattern first
- Implement the step
- Mark todo as complete
- Commit: `p3(task-X.Y): <step description>`

**Key Patterns**:

```typescript
// Backend API (Task 1.3)
router.get('/:id/horses', requireRole([...]), createAuthenticatedRoute(async (req, res) => {
  const horses = await streamHorseService.getStreamHorses(req.params.id, req.user.farmId);
  return res.json({ horses });
}));
```

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

### 4. Test (Complete ALL before next task)
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

# Database tests
docker compose exec postgres psql -U admin -d barnhand -c "\d horses"
```

### 5. Mark Complete & Update Handoff Notes
**REQUIRED after each task completion**:

a. Update task checkboxes in `stream-horse-registry-tasks.md`:
   - Change `[ ]` to `[x]` for all Testing + Acceptance items

b. Update `docs/HANDOFF_NOTES.md`:
   - Move task from "In Progress" to "Completed"
   - Document what was accomplished
   - Note any blockers or issues
   - Set "Next Priority" to next task

c. Commit handoff notes:
   ```bash
   git add docs/HANDOFF_NOTES.md docs/Phase\ 3\ -\ Stream\ Horse\ Registry/
   git commit -m "docs: update Phase 3 handoff notes after task X.Y"
   ```

---

## CRITICAL TASKS (Read Before Starting)

**Task 1.4** (ML Integration):
- Load horses at `processor.py:220` (BEFORE frame loop)
- Save horses at `processor.py:445` (AFTER frame loop)
- Test: 2 chunks with same horse → verify same tracking_id

**Task 2.4** (Tab Integration):
- Add tab at `PrimaryVideoPlayer.tsx:50-80`
- Pass streamId prop to DetectedHorsesTab

**Task 3.1** (WebSocket):
- Add `streamHorses: Record<streamId, Horse[]>` to Zustand store
- Subscribe to `horses:detected` and `horses:updated` events

---

## QUICK DEBUG

```bash
# Database connection
docker compose exec postgres psql -U admin -d barnhand

# Horse not persisting?
docker compose exec redis redis-cli KEYS "horse:*"
docker compose exec postgres psql -U admin -d barnhand -c "SELECT tracking_id, stream_id FROM horses"

# Name not showing?
curl localhost:8000/api/v1/streams/[id]/chunks/[chunkId]/detections | jq '.detections[0].horse_name'

# Migration issues?
cd backend/database && npm run migrate status
```

---

## HANDOFF_NOTES.md Template

If `docs/HANDOFF_NOTES.md` doesn't exist, create it with:

```markdown
# Phase 3: Stream Horse Registry - Session Handoff

**Last Updated**: [timestamp]

## ✅ Completed Tasks
[Empty on first run]

## 🔄 In Progress
[Current task number and brief status]

## 📋 Next Priority
[Next task to work on]

## 🚫 Blockers
[Any issues blocking progress]

## 💭 Context for Next Session
[Important notes, decisions, gotchas]

## ❓ Questions for Kevin
[Any clarifications needed]
```

---

## Common Issues & Solutions

**Issue**: Migration file path wrong
- Task says `backend/database/migrations/003_...`
- Actual path: `backend/database/src/migrations/sql/00X_...`
- Use `find . -name "*.sql" | grep migrations` to locate

**Issue**: Database user wrong
- Tasks say `-U barnhand`
- Actual user: `-U admin` (password: `password`)
- Check `docker-compose.yml` for POSTGRES_USER

**Issue**: TypeScript errors blocking commit
- Pre-existing errors in api-gateway
- Use `git commit --no-verify` to bypass hooks
- Document in commit message why --no-verify was needed

**Issue**: pgvector not found
- Run: `docker compose exec postgres psql -U admin -d barnhand -c "CREATE EXTENSION IF NOT EXISTS vector;"`
- Verify: `SELECT * FROM pg_extension WHERE extname = 'vector';`

---

**NOW**: Check `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-tasks.md` for your current task and execute steps 1-5.
