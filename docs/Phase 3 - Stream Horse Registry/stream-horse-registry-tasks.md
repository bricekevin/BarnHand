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
- [x] Unit: Run migration against test database, verify schema
- [x] Integration: Insert horse with avatar, retrieve successfully
- [x] Regression: Existing horse queries still work without avatar
- [x] Manual: Run `psql` and check horses table structure

**Acceptance**:
- [x] Migration applies cleanly on fresh database
- [x] Migration applies cleanly on existing database with horses
- [x] Avatar column accepts BYTEA data up to 100KB
- [x] stream_id index improves query performance (EXPLAIN ANALYZE)
- [x] Tests pass in Docker

**Reference**: Similar migration pattern in `backend/ml-service/src/services/horse_database.py:254-326`

---

### Task 0.2: Document Current ReID State and Plan Integration Points
**Objective**: Audit existing ReID system and document integration requirements

**Files**:
- `docs/Phase 3 - Stream Horse Registry/REID_INTEGRATION.md` (NEW)
- `backend/ml-service/src/models/horse_tracker.py` (READ ONLY)
- `backend/ml-service/src/services/processor.py` (READ ONLY)

**Steps**:
1. Document current HorseTracker initialization flow (line 80-88 in horse_tracker.py)
2. Document where horses are created (line 466-498 in horse_tracker.py)
3. Document Redis persistence logic (horse_database.py:61-250)
4. Identify integration points:
   - Where to load stream horses on chunk start
   - Where to save horses on chunk complete
   - Where to capture thumbnails
5. Create integration checklist for Phase 1

**Testing**:
- [x] Manual: Review document with team
- [x] Manual: Verify all integration points identified
- [x] Manual: Confirm no breaking changes to existing chunk processing

**Acceptance**:
- [x] Document covers all ReID state management
- [x] Integration points clearly marked with line numbers
- [x] Risk areas identified (e.g., race conditions)
- [x] Document approved for Phase 1 implementation

**Reference**: Review `horse_tracker.py:40-89` for initialization pattern

---

## Phase 1: Backend Implementation

### Task 1.1: Add Horse Registry Persistence Methods to HorseRepository
**Objective**: Extend HorseRepository with stream-specific queries and avatar handling

**Files**:
- `backend/database/src/repositories/HorseRepository.ts` (UPDATE)
- `backend/database/src/__tests__/repositories/HorseRepository.test.ts` (UPDATE)

**Steps**:
1. Add `findByStreamId(streamId: string): Promise<Horse[]>` method
2. Add `updateAvatar(horseId: string, avatarData: Buffer): Promise<void>` method
3. Add `updateHorseDetails(horseId: string, updates: Partial<Horse>): Promise<Horse>` method
4. Update `create` method to accept optional avatar_thumbnail
5. Add tests for new methods (mock data + assertions)

**Testing**:
- [ ] Unit: Test findByStreamId returns correct horses for stream
- [ ] Unit: Test updateAvatar saves and retrieves JPEG correctly
- [ ] Unit: Test updateHorseDetails modifies name, metadata
- [ ] Integration: Test with real PostgreSQL container
- [ ] Regression: Existing HorseRepository methods still work

**Acceptance**:
- [ ] All new methods have >80% test coverage
- [ ] Avatar images compressed to <50KB
- [ ] Query performance <100ms for 50 horses per stream
- [ ] Tests pass in Docker

**Reference**: Existing pattern in `HorseRepository.ts:28-50` for create method

---

### Task 1.2: Create Stream Horse Registry Service in API Gateway
**Objective**: Build service layer to manage stream horses and avatars

**Files**:
- `backend/api-gateway/src/services/streamHorseService.ts` (NEW)
- `backend/api-gateway/src/services/__tests__/streamHorseService.test.ts` (NEW)

**Steps**:
1. Create `StreamHorseService` class with HorseRepository dependency
2. Implement `getStreamHorses(streamId: string, farmId: string): Promise<Horse[]>`
3. Implement `updateHorse(horseId: string, updates: UpdateHorseDto): Promise<Horse>`
4. Implement `getHorseAvatar(horseId: string): Promise<Buffer | null>`
5. Add authorization checks (verify stream belongs to farm)
6. Write unit tests with mocked repository

**Testing**:
- [ ] Unit: Test service methods with mocked HorseRepository
- [ ] Unit: Test authorization checks reject wrong farm
- [ ] Integration: Test service with real DB connection
- [ ] Manual: Use service in Node REPL to verify functionality

**Acceptance**:
- [ ] Service methods handle errors gracefully
- [ ] Authorization prevents cross-farm access
- [ ] Avatar retrieval returns correct MIME type
- [ ] Tests pass in Docker

**Reference**: Similar service pattern in `backend/api-gateway/src/services/videoChunkService.ts`

---

### Task 1.3: Add Horse Registry API Endpoints
**Objective**: Expose REST endpoints for stream horse management

**Files**:
- `backend/api-gateway/src/routes/streams.ts` (UPDATE)
- `backend/api-gateway/src/routes/__tests__/streams.test.ts` (NEW if missing)

**Steps**:
1. Add `GET /api/v1/streams/:id/horses` - list horses for stream
2. Add `GET /api/v1/streams/:id/horses/:horseId` - get specific horse
3. Add `PUT /api/v1/streams/:id/horses/:horseId` - update horse (name, notes)
4. Add `GET /api/v1/streams/:id/horses/:horseId/avatar` - get avatar image
5. Add validation schemas for update requests
6. Add authentication + RBAC checks
7. Integrate with StreamHorseService from Task 1.2

**Testing**:
- [ ] Unit: Test route handlers with mocked service
- [ ] Integration: Test endpoints with Supertest
- [ ] Integration: Test authentication rejects unauthenticated requests
- [ ] Integration: Test RBAC allows FARM_USER read, FARM_ADMIN write
- [ ] Manual: Use curl/Postman to test endpoints

**Acceptance**:
- [ ] All endpoints return correct status codes
- [ ] Validation rejects invalid inputs (400 errors)
- [ ] Avatar endpoint returns image/jpeg content-type
- [ ] Endpoints respect farm-level authorization
- [ ] Tests pass in Docker

**Reference**: Existing endpoint pattern in `streams.ts:406-457` for chunks endpoint

---

### Task 1.4: Integrate ML Service with Stream Horse Registry
**Objective**: Load known horses on chunk start, save horses on chunk complete

**Files**:
- `backend/ml-service/src/services/processor.py` (UPDATE)
- `backend/ml-service/src/models/horse_tracker.py` (UPDATE)
- `backend/ml-service/src/services/horse_database.py` (UPDATE - thumbnail logic)

**Steps**:
1. Update `HorseTracker.__init__` to accept `stream_id` parameter
2. Add `load_stream_horses(stream_id: str)` method to load from Redis + PostgreSQL
3. Update `process_chunk()` in processor.py:
   - Load stream horses before processing (line ~200)
   - Initialize tracker with known horses
4. Add `save_horse_thumbnail()` method to capture best frame
5. After chunk complete, save all horses (new + updated) to PostgreSQL
6. Add thumbnail extraction: select frame with highest confidence + largest bbox

**Testing**:
- [ ] Unit: Test load_stream_horses loads correct horses
- [ ] Unit: Test thumbnail extraction picks best frame
- [ ] Integration: Test chunk processing with pre-existing horses
- [ ] Integration: Test new horse creation saves to DB
- [ ] Regression: Test chunk processing without known horses still works
- [ ] Manual: Process 2 chunks, verify horse persists with same ID

**Acceptance**:
- [ ] Known horses loaded in <200ms for 20 horses
- [ ] Thumbnail generation adds <100ms to chunk processing
- [ ] Re-identification accuracy >90% for same horse across chunks
- [ ] New horses get unique IDs within stream
- [ ] Tests pass in Docker

**Reference**: Existing chunk processing flow in `processor.py:150-300`

---

### Task 1.5: Add WebSocket Events for Horse Registry Updates
**Objective**: Emit real-time events when horses are detected/updated

**Files**:
- `backend/ml-service/src/main.py` (UPDATE - WebSocket emission)
- `backend/api-gateway/src/websocket/events.ts` (UPDATE - define new event types)
- `shared/src/types/websocket.types.ts` (UPDATE)

**Steps**:
1. Define `horses:detected` event type in shared types
2. Define `horses:updated` event type for manual edits
3. In ML service, emit `horses:detected` after chunk processing completes
4. In API gateway, emit `horses:updated` after PUT /horses/:horseId
5. Include stream_id, horse data, and thumbnail URL in event payload

**Testing**:
- [ ] Unit: Test event emission with mock Socket.io
- [ ] Integration: Test WebSocket client receives events
- [ ] E2E: Connect frontend, verify events trigger UI updates
- [ ] Manual: Use socket.io client to listen for events

**Acceptance**:
- [ ] Events emitted within 500ms of horse detection
- [ ] Event payload includes all necessary horse data
- [ ] Multiple clients receive events (room-based broadcasting)
- [ ] Tests pass in Docker

**Reference**: Existing WebSocket pattern in `backend/ml-service/src/main.py:250-300`

---

## Phase 2: Frontend Implementation

### Task 2.1: Create Detected Horses Tab Component
**Objective**: Build new tab UI to display stream horse registry

**Files**:
- `frontend/src/components/DetectedHorsesTab.tsx` (NEW)
- `frontend/src/components/__tests__/DetectedHorsesTab.test.tsx` (NEW)

**Steps**:
1. Create `DetectedHorsesTab` component with props: `streamId: string`
2. Fetch horses on mount: `GET /api/v1/streams/:streamId/horses`
3. Display loading state, empty state, and error state
4. Render horse grid (4 columns on desktop, 2 on mobile)
5. Show horse ID, name (or "Unnamed"), avatar, last seen, detection count
6. Add search/filter bar (filter by name, sort by detection count)
7. Add refresh button to manually reload horses

**Testing**:
- [ ] Unit: Test component renders with mock data
- [ ] Unit: Test empty state displays correctly
- [ ] Unit: Test search/filter functionality
- [ ] Integration: Test API fetch with MSW mock
- [ ] Manual: View in browser, test responsive layout

**Acceptance**:
- [ ] Component loads horses in <500ms
- [ ] Grid layout responsive on mobile/tablet/desktop
- [ ] Search filters horses in real-time
- [ ] Empty state displays helpful message
- [ ] Tests pass with npm test

**Reference**: Similar grid pattern in `StreamManagement.tsx:179-183`

---

### Task 2.2: Create Horse Card Component
**Objective**: Build individual horse card for registry grid

**Files**:
- `frontend/src/components/HorseCard.tsx` (NEW)
- `frontend/src/components/__tests__/HorseCard.test.tsx` (NEW)

**Steps**:
1. Create `HorseCard` component with props: `horse: Horse`, `onClick: () => void`
2. Display avatar image with fallback (horse silhouette icon if no thumbnail)
3. Show horse ID badge (e.g., "#3") in assigned tracking color
4. Show horse name or "Unnamed Horse #3" if no name
5. Show last seen timestamp (relative time: "2 minutes ago")
6. Show total detection count
7. Add hover effect and click handler
8. Apply glass morphism styling (matching design system)

**Testing**:
- [ ] Unit: Test card renders all horse data
- [ ] Unit: Test click handler fires
- [ ] Unit: Test fallback image displays when no avatar
- [ ] Visual: Test card styling matches design system
- [ ] Manual: Test in Storybook (if available) or browser

**Acceptance**:
- [ ] Card displays all required information clearly
- [ ] Avatar loads from API endpoint
- [ ] Tracking color matches assigned color
- [ ] Hover animation smooth (<200ms)
- [ ] Tests pass with npm test

**Reference**: Similar card pattern in `StreamCard.tsx:20-100`

---

### Task 2.3: Create Horse Edit Modal Component
**Objective**: Build modal for editing horse details

**Files**:
- `frontend/src/components/HorseEditModal.tsx` (NEW)
- `frontend/src/components/__tests__/HorseEditModal.test.tsx` (NEW)

**Steps**:
1. Create modal component with props: `horse: Horse`, `onClose: () => void`, `onSave: (updates) => void`
2. Display horse avatar (large, centered)
3. Add form fields: name (text input), notes (textarea)
4. Add "Save" and "Cancel" buttons
5. Implement form validation (name max 100 chars, notes max 500 chars)
6. Call `PUT /api/v1/streams/:streamId/horses/:horseId` on save
7. Show loading spinner during save
8. Show success/error toast after save
9. Close modal on successful save

**Testing**:
- [ ] Unit: Test modal renders horse data
- [ ] Unit: Test form validation rejects invalid inputs
- [ ] Unit: Test save calls API with correct payload
- [ ] Integration: Test API call with MSW mock
- [ ] Manual: Test modal UX in browser

**Acceptance**:
- [ ] Modal opens with smooth animation
- [ ] Form fields pre-populated with current data
- [ ] Validation prevents invalid saves
- [ ] Save updates horse in backend
- [ ] Modal closes on save or cancel
- [ ] Tests pass with npm test

**Reference**: Modal pattern reference in any existing modal component

---

### Task 2.4: Integrate Detected Horses Tab into PrimaryVideoPlayer
**Objective**: Add 3rd tab to stream viewer for horse registry

**Files**:
- `frontend/src/components/PrimaryVideoPlayer.tsx` (UPDATE)
- `frontend/src/components/__tests__/PrimaryVideoPlayer.test.tsx` (UPDATE)

**Steps**:
1. Add "Detected Horses" tab to existing tab bar (after "Recorded Chunks")
2. Import and render `DetectedHorsesTab` component when tab active
3. Pass `streamId` prop to DetectedHorsesTab
4. Update tab state management to include new tab
5. Add tab icon (horse icon or user icon)
6. Maintain existing tab switching behavior

**Testing**:
- [ ] Unit: Test tab renders and switches correctly
- [ ] Integration: Test DetectedHorsesTab receives correct streamId
- [ ] Manual: Test tab switching in browser
- [ ] Manual: Verify layout doesn't break with 3 tabs

**Acceptance**:
- [ ] Tab displays in correct position (3rd tab)
- [ ] Tab switches smoothly with existing tabs
- [ ] DetectedHorsesTab receives correct stream context
- [ ] No layout issues on mobile/tablet/desktop
- [ ] Tests pass with npm test

**Reference**: Existing tab pattern in `PrimaryVideoPlayer.tsx:50-150`

---

### Task 2.5: Add Horse Name Display to Video Overlays
**Objective**: Show horse ID + name in detection overlays during chunk playback

**Files**:
- `frontend/src/components/OverlayCanvas.tsx` (UPDATE)
- `frontend/src/components/DetectionDataPanel.tsx` (UPDATE - if showing horse list)

**Steps**:
1. Update detection data type to include optional `horse_name: string`
2. In OverlayCanvas, render horse name below bounding box label
3. Format label as "Horse #3 - Thunder" or "Horse #3" if unnamed
4. Use assigned tracking color for text background
5. Update DetectionDataPanel to show horse names in sidebar list
6. Add tooltip with full horse details on hover (name, detection count, last seen)

**Testing**:
- [ ] Unit: Test overlay renders horse name correctly
- [ ] Unit: Test label formatting with/without name
- [ ] Visual: Test overlay text readable over video
- [ ] Manual: Play chunk with named horse, verify name displays
- [ ] Manual: Play chunk with unnamed horse, verify ID displays

**Acceptance**:
- [ ] Horse name displays clearly in overlay
- [ ] Text color contrasts with background
- [ ] Name updates immediately after editing
- [ ] No performance impact on overlay rendering
- [ ] Tests pass with npm test

**Reference**: Existing overlay rendering in `OverlayCanvas.tsx:100-200`

---

## Phase 3: Integration & Polish

### Task 3.1: Implement Real-Time Horse Registry Updates via WebSocket
**Objective**: Subscribe to horse events and update UI in real-time

**Files**:
- `frontend/src/stores/useAppStore.ts` (UPDATE)
- `frontend/src/services/websocketService.ts` (UPDATE)

**Steps**:
1. Add horse registry state to Zustand store: `streamHorses: Record<streamId, Horse[]>`
2. Add actions: `setStreamHorses`, `updateHorse`, `addHorse`
3. In websocketService, subscribe to `horses:detected` and `horses:updated` events
4. On event received, update store with new/updated horse data
5. DetectedHorsesTab subscribes to store and re-renders on updates
6. Add debouncing to prevent excessive re-renders

**Testing**:
- [ ] Unit: Test store actions update state correctly
- [ ] Unit: Test WebSocket handler calls store actions
- [ ] Integration: Test WebSocket events trigger UI updates
- [ ] E2E: Record chunk, verify new horse appears in tab without refresh
- [ ] Manual: Edit horse name, verify all clients see update

**Acceptance**:
- [ ] New horses appear in UI within 1 second of detection
- [ ] Edited horses update in UI within 500ms
- [ ] Multiple browser tabs stay synchronized
- [ ] No memory leaks from WebSocket subscriptions
- [ ] Tests pass with npm test

**Reference**: Existing WebSocket subscription in `websocketService.ts`

---

### Task 3.2: Update Chunk Detection Endpoint to Include Horse Names
**Objective**: Return horse names in chunk detection JSON for overlay rendering

**Files**:
- `backend/api-gateway/src/routes/streams.ts` (UPDATE - detections endpoint)
- `backend/api-gateway/src/services/videoChunkService.ts` (UPDATE)

**Steps**:
1. In `GET /api/v1/streams/:id/chunks/:chunkId/detections` handler
2. After loading detections JSON, enrich with horse names
3. For each detection, lookup horse by tracking_id from horses table
4. Add `horse_name` field to detection object (null if unnamed)
5. Cache horse lookups to avoid N+1 queries
6. Update response type to include horse_name

**Testing**:
- [ ] Unit: Test detection enrichment adds correct names
- [ ] Integration: Test endpoint returns detections with names
- [ ] Integration: Test performance with 50 detections
- [ ] Manual: Play chunk, verify overlay shows names

**Acceptance**:
- [ ] Horse names correctly mapped to detections
- [ ] Endpoint response time <500ms for typical chunk
- [ ] Unnamed horses show null for horse_name
- [ ] Tests pass in Docker

**Reference**: Existing detection endpoint in `streams.ts:502-539`

---

### Task 3.3: Add Horse Count and Summary to Stream Cards
**Objective**: Show detected horse count on stream cards in grid view

**Files**:
- `frontend/src/components/StreamCard.tsx` (UPDATE)

**Steps**:
1. Fetch horse count for stream: `GET /api/v1/streams/:id/horses?summary=true`
2. Display horse count badge (e.g., "3 horses detected")
3. Show most recently detected horse thumbnail as preview
4. Add hover tooltip with top 3 horse names
5. Update StreamCard to accept optional `horseCount` prop

**Testing**:
- [ ] Unit: Test StreamCard renders horse count
- [ ] Unit: Test summary API call
- [ ] Visual: Test badge styling matches design
- [ ] Manual: View stream grid, verify counts display

**Acceptance**:
- [ ] Horse count displays on all stream cards
- [ ] Count updates after new horse detected
- [ ] Badge styled consistently with design system
- [ ] No performance impact on grid rendering
- [ ] Tests pass with npm test

**Reference**: Existing StreamCard component in `StreamCard.tsx:20-100`

---

## Phase 4: Testing & Polish

### Task 4.1: Write E2E Tests for Stream Horse Registry Flow
**Objective**: Comprehensive E2E tests covering user workflows

**Files**:
- `testing/e2e/stream-horse-registry.spec.ts` (NEW)

**Steps**:
1. **Test 1: Horse Detection and Persistence**
   - Record chunk with 1 horse
   - Verify horse appears in Detected Horses tab
   - Restart server (docker-compose restart)
   - Verify horse still in tab after restart
2. **Test 2: Cross-Chunk Horse Continuity**
   - Record chunk 1 with Horse A
   - Record chunk 2 with same Horse A
   - Verify Horse A has same ID in both chunks
   - Verify detection count incremented
3. **Test 3: Manual Horse Naming**
   - Detect unnamed horse
   - Open edit modal, add name "Thunder"
   - Save and close modal
   - Play chunk, verify overlay shows "Horse #1 - Thunder"
4. **Test 4: Multi-Horse Detection**
   - Record chunk with 2 horses
   - Verify both horses get unique IDs and colors
   - Verify both appear in tab with different avatars

**Testing**:
- [ ] E2E: All 4 tests pass with Playwright
- [ ] E2E: Tests run in CI/CD pipeline
- [ ] Manual: Run tests locally with `npm run test:e2e`

**Acceptance**:
- [ ] All E2E tests pass consistently (3/3 runs)
- [ ] Tests complete in <5 minutes
- [ ] Tests clean up test data after run
- [ ] Tests documented in README

**Reference**: Existing E2E test pattern in `testing/e2e/` directory

---

### Task 4.2: Performance Testing and Optimization
**Objective**: Ensure system performs well with realistic data volumes

**Files**:
- `docs/Phase 3 - Stream Horse Registry/PERFORMANCE_BENCHMARKS.md` (NEW)

**Steps**:
1. **Benchmark 1: Horse Registry Load Time**
   - Create stream with 50 horses
   - Measure time to load Detected Horses tab
   - Target: <500ms
2. **Benchmark 2: Chunk Processing with Known Horses**
   - Process chunk with 20 known horses in registry
   - Measure ReID matching time per frame
   - Target: <50ms additional overhead
3. **Benchmark 3: Thumbnail Storage**
   - Store 100 horse avatars
   - Measure database size increase
   - Target: <5MB total
4. **Benchmark 4: WebSocket Event Latency**
   - Emit horse detection event
   - Measure time until UI update
   - Target: <1 second end-to-end
5. Document results and optimization recommendations

**Testing**:
- [ ] Manual: Run all benchmarks and record results
- [ ] Manual: Verify targets met or document gaps
- [ ] Manual: Test on production-like hardware

**Acceptance**:
- [ ] All performance targets met or documented
- [ ] Optimization recommendations provided for gaps
- [ ] Benchmarks documented for future regression testing

**Reference**: Performance testing approach in `docs/ML_PERFORMANCE_OPTIMIZATIONS.md`

---

### Task 4.3: Documentation and Handoff
**Objective**: Document feature for users and developers

**Files**:
- `docs/Phase 3 - Stream Horse Registry/USER_GUIDE.md` (NEW)
- `docs/Phase 3 - Stream Horse Registry/DEVELOPER_GUIDE.md` (NEW)
- `README.md` (UPDATE - add Phase 3 to features list)

**Steps**:
1. **User Guide**:
   - How to access Detected Horses tab
   - How to name horses
   - How to view horse detection history
   - Troubleshooting common issues
2. **Developer Guide**:
   - Architecture overview with diagrams
   - Database schema changes
   - API endpoint documentation
   - WebSocket event specifications
   - How to add new horse attributes
3. **README Update**:
   - Add "Per-Stream Horse Registry" to features list
   - Update screenshots to show new tab
   - Update architecture diagram

**Testing**:
- [ ] Manual: Review docs with team
- [ ] Manual: Have external user test with User Guide
- [ ] Manual: Have new developer follow Developer Guide

**Acceptance**:
- [ ] User Guide clear and comprehensive
- [ ] Developer Guide enables new contributor to modify system
- [ ] README accurately reflects Phase 3 features
- [ ] All documentation reviewed and approved

**Reference**: Existing documentation style in `docs/Phase 1 - Initial Platform/`

---

## Handoff Notes Template

Use this template when handing off between sessions:

```markdown
**Date**: [Timestamp]

**Completed**:
- [x] Task X.Y - [brief summary]

**In Progress**:
- [~] Task A.B - [current status and blockers]

**Next Priority**:
1. Task C.D - [rationale for why this is next]

**Blockers**:
- [None | Describe blocker and mitigation plan]

**Testing Notes**:
- [Results of manual testing, bugs found]

**Context for Next Session**:
- [Critical information about decisions made, tradeoffs, gotchas]
- [Links to relevant code sections]
- [Performance observations]

**Questions for Kevin**:
- [Any decisions needed or clarifications required]
```

---

## Quick Reference: Integration Points

### ML Service Integration (Task 1.4)
- **Load horses**: `processor.py:200` - before chunk processing starts
- **Save horses**: `processor.py:450` - after chunk processing completes
- **Capture thumbnail**: `processor.py:320` - during detection loop, pick best frame
- **Initialize tracker**: `horse_tracker.py:80` - pass stream_id and known horses

### Frontend Integration (Task 2.4)
- **Tab location**: `PrimaryVideoPlayer.tsx:50-80` - add after Recorded Chunks tab
- **Overlay update**: `OverlayCanvas.tsx:120` - append horse name to label
- **WebSocket sub**: `websocketService.ts:50` - add horses:detected event handler

### API Integration (Task 1.3)
- **Base route**: `/api/v1/streams/:id/horses` - new endpoint group
- **Auth pattern**: Use `requireRole([FARM_ADMIN, FARM_USER])` from existing routes
- **Farm check**: Use `requireFarmAccess` middleware like in streams routes

---

## Success Checklist (All Phases)

**Functionality**:
- [ ] Record chunk → horse detected → appears in Detected Horses tab
- [ ] Record 2nd chunk → same horse re-identified → detection count +1
- [ ] User renames horse → name appears in overlay on chunk playback
- [ ] Server restart → horses persist → next chunk uses known horses
- [ ] Multi-horse chunk → each horse gets unique ID and color

**Performance**:
- [ ] Horse registry loads in <500ms for 50 horses
- [ ] Chunk processing overhead <100ms for ReID matching
- [ ] Thumbnail storage <50KB per horse
- [ ] WebSocket events arrive in <1 second

**Quality**:
- [ ] All unit tests pass (>80% coverage for new code)
- [ ] All integration tests pass
- [ ] All E2E tests pass (4/4 scenarios)
- [ ] No console errors in browser
- [ ] No Python exceptions in ML service logs
- [ ] Code reviewed and approved
- [ ] Documentation complete and reviewed

**Deployment**:
- [ ] Database migration tested on staging
- [ ] Feature flag enabled for Phase 3
- [ ] Monitoring alerts configured for horse registry endpoints
- [ ] Rollback plan documented

---

## Estimated Timeline

**Parallel Track 1 (Backend)**:
- Day 1: Tasks 0.1, 0.2, 1.1 (4 hours)
- Day 2: Tasks 1.2, 1.3 (4 hours)
- Day 3: Tasks 1.4, 1.5 (5 hours)

**Parallel Track 2 (Frontend)**:
- Day 1: Tasks 2.1, 2.2 (4 hours)
- Day 2: Tasks 2.3, 2.4 (4 hours)
- Day 3: Task 2.5 (2 hours)

**Integration Week**:
- Day 4: Tasks 3.1, 3.2, 3.3 (5 hours)
- Day 5: Tasks 4.1, 4.2 (3 hours)
- Day 6: Task 4.3 + final testing (2 hours)

**Total: 14-16 hours** across 6 working sessions
