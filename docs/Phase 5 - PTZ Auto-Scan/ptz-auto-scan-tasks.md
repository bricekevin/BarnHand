# PTZ Auto-Scan Mode - Task Checklist

## Phase 0: Foundation & Refactoring [COMPLETE]

### Task 0.1: Add Auto-Scan Config Types to Shared Package [x]

**Objective**: Define TypeScript types for auto-scan configuration and state

**Files**:
- `shared/src/types/stream.types.ts` (UPDATE)
- `shared/src/types/autoScan.types.ts` (NEW)

**Steps**:
1. Create `autoScan.types.ts` with interfaces:
   - `AutoScanConfig` - settings stored in stream config
   - `AutoScanState` - runtime state during scan
   - `AutoScanResult` - results of completed scan
   - `PresetScanResult` - per-preset detection result
2. Update `stream.types.ts` to extend config with `ptzCredentials`, `ptzPresets`, `autoScan`
3. Export new types from shared index
4. Run `npm run build` in shared package

**Testing**:
- [ ] Unit: TypeScript compiles without errors
- [ ] Integration: Types importable from other packages
- [ ] Regression: Existing stream types unchanged

**Acceptance**:
- [ ] All auto-scan types defined with JSDoc comments
- [ ] Types align with overview document schema
- [ ] Shared package builds successfully

**Reference**: `shared/src/types/correction.types.ts` for type definition pattern

---

### Task 0.2: Refactor PTZ Credentials from localStorage to Stream Config [x]

**Objective**: Move PTZ username/password storage from localStorage to database

**Files**:
- `frontend/src/components/PTZControls.tsx` (UPDATE)
- `backend/api-gateway/src/routes/streams.ts` (UPDATE)
- `frontend/src/components/StreamSettings.tsx` (UPDATE)

**Steps**:
1. In `PTZControls.tsx`:
   - Remove localStorage reads for `ptz-auth-{streamId}`
   - Add prop or context for stream config with PTZ credentials
   - Update snapshot URL construction to use config credentials
2. In `StreamSettings.tsx`:
   - Add PTZ Credentials section (username, password inputs)
   - Save to `config.ptzCredentials` on form submit
3. In `streams.ts`:
   - Update PUT `/streams/:id` to accept ptzCredentials in config
   - Update snapshot endpoint to read credentials from stream config (fallback to query params)
4. Test: Save credentials in settings, verify PTZ controls work

**Testing**:
- [ ] Unit: Config serialization includes ptzCredentials
- [ ] Integration: Save settings → PTZ controls use saved credentials
- [ ] Regression: Existing PTZ functionality unchanged
- [ ] Manual: Clear localStorage, verify PTZ still works via DB config

**Acceptance**:
- [ ] PTZ credentials persist across browser sessions
- [ ] Multiple users can use PTZ (shared credentials from DB)
- [ ] Fallback to query params if config empty (backward compat)

**Reference**: `PTZControls.tsx:42-55` for current localStorage pattern

---

### Task 0.3: Refactor PTZ Presets from localStorage to Stream Config [x]

**Objective**: Move preset storage from localStorage to database for server-side access

**Files**:
- `frontend/src/components/PTZControls.tsx` (UPDATE)
- `backend/api-gateway/src/routes/streams.ts` (UPDATE)

**Steps**:
1. In `PTZControls.tsx`:
   - Replace localStorage `ptz-presets-{streamId}` with API calls
   - On preset save: PATCH `/streams/:id` with updated `config.ptzPresets`
   - On load: Read presets from stream config prop
2. Add API endpoint or update existing:
   - `PATCH /api/v1/streams/:id/config` - partial config update
   - Or use existing PUT with merge logic
3. Update preset data structure to include name and timestamp
4. Migrate existing localStorage presets on first load (one-time)

**Testing**:
- [ ] Unit: Preset save/load via API
- [ ] Integration: Save preset → refresh page → preset still there
- [ ] Regression: Preset recall moves camera correctly
- [ ] Manual: Verify presets available for auto-scan

**Acceptance**:
- [ ] Presets persist in database
- [ ] Presets accessible from backend (needed for auto-scan)
- [ ] Migration handles existing localStorage presets

**Reference**: `PTZControls.tsx:120-150` for current preset logic

---

## Phase 1: Backend Implementation [COMPLETE]

### Task 1.1: Create YOLO-Only Snapshot Detection Endpoint [x]

**Objective**: Add ML service endpoint for fast horse detection on single image

**Files**:
- `backend/ml-service/src/main.py` (UPDATE)
- `backend/ml-service/src/services/snapshot_detector.py` (NEW)

**Steps**:
1. Create `snapshot_detector.py`:
   - Function `detect_horses_in_image(image_bytes: bytes) -> List[Detection]`
   - Load YOLO model (reuse existing or create singleton)
   - Run inference on single image
   - Return bounding boxes + confidence scores (no pose, no ReID)
2. Add FastAPI endpoint in `main.py`:
   ```python
   @app.post("/detect-snapshot")
   async def detect_snapshot(image: UploadFile):
       # Returns: { horses_detected: bool, count: int, detections: [...] }
   ```
3. Optimize for speed: lower resolution (640x640), batch size 1
4. Add confidence threshold parameter (default 0.3 for higher recall)

**Testing**:
- [ ] Unit: Detection function with test horse image
- [ ] Integration: POST image to endpoint, verify response
- [ ] Performance: Detection completes in <500ms
- [ ] Manual: Test with real camera snapshot

**Acceptance**:
- [ ] Endpoint returns within 500ms for 1080p image
- [ ] Correctly detects horses in test images
- [ ] Returns structured JSON with detection count

**Reference**: `processor.py:180-220` for YOLO model loading pattern

---

### Task 1.2: Create Auto-Scan Service in API Gateway [x]

**Objective**: Build orchestration service for auto-scan phases

**Files**:
- `backend/api-gateway/src/services/autoScanService.ts` (NEW)

**Steps**:
1. Create `AutoScanService` class with methods:
   - `startScan(streamId, config)` - Initialize scan state, begin phase A
   - `stopScan(streamId)` - Cancel running scan
   - `getScanStatus(streamId)` - Return current state
   - `private runDetectionPhase()` - Cycle through presets with snapshots
   - `private runRecordingPhase()` - Record at locations with horses
2. State management:
   - Store active scan state in class Map (or Redis for persistence)
   - Track: phase, currentPreset, results[], startTime
3. PTZ control integration:
   - Import PTZ command helper (extract from routes if needed)
   - Send preset recall commands
   - Wait for movement completion
4. Emit WebSocket events at each step

**Testing**:
- [ ] Unit: State machine transitions correctly
- [ ] Unit: PTZ commands generated correctly
- [ ] Integration: Mock scan runs through all phases
- [ ] Manual: Test with real camera

**Acceptance**:
- [ ] Service manages scan lifecycle correctly
- [ ] WebSocket events emitted at each step
- [ ] Scan can be stopped mid-execution

**Reference**: `videoChunkService.ts` for service class pattern

---

### Task 1.3: Add Auto-Scan API Endpoints [x]

**Objective**: Expose auto-scan operations via REST API

**Files**:
- `backend/api-gateway/src/routes/streams.ts` (UPDATE)

**Steps**:
1. Add endpoint `POST /api/v1/streams/:id/ptz/auto-scan/start`:
   - Validate stream exists and has PTZ capability
   - Validate presets exist (at least 1)
   - Call `autoScanService.startScan()`
   - Return 202 Accepted with scan ID
2. Add endpoint `GET /api/v1/streams/:id/ptz/auto-scan/status`:
   - Return current scan state or null if not running
3. Add endpoint `POST /api/v1/streams/:id/ptz/auto-scan/stop`:
   - Call `autoScanService.stopScan()`
   - Return 200 OK
4. Add validation middleware for PTZ-capable streams

**Testing**:
- [ ] Unit: Endpoint validation rejects invalid requests
- [ ] Integration: Start → Status → Stop cycle works
- [ ] Regression: Existing stream routes unaffected
- [ ] Manual: Test with Postman/curl

**Acceptance**:
- [ ] All endpoints follow existing auth patterns
- [ ] Proper error responses for edge cases
- [ ] Status endpoint returns useful progress info

**Reference**: `streams.ts:389-472` for record-chunk endpoint pattern

---

### Task 1.4: Integrate Snapshot Detection with Auto-Scan [x]

**Objective**: Connect auto-scan service to ML detection endpoint

**Files**:
- `backend/api-gateway/src/services/autoScanService.ts` (UPDATE)

**Steps**:
1. Add method `private async detectHorsesAtPreset(streamId, presetNum)`:
   - Move PTZ to preset
   - Wait 1.5s for camera to settle
   - Fetch snapshot via existing proxy endpoint
   - POST snapshot to ML service `/detect-snapshot`
   - Return detection result
2. Update `runDetectionPhase()` to call detection method
3. Store results per preset: `{ preset: 1, horsesDetected: true, count: 2 }`
4. Build list of presets to record in phase B

**Testing**:
- [ ] Unit: Detection method constructs correct API calls
- [ ] Integration: Full detection phase with mock ML response
- [ ] Manual: Run against real camera, verify detection accuracy

**Acceptance**:
- [ ] Detection phase completes for all presets
- [ ] Results accurately reflect horse presence
- [ ] WebSocket updates sent for each preset

**Reference**: `streams.ts:1311-1384` for snapshot proxy pattern

---

### Task 1.5: Integrate Recording with Auto-Scan [x]

**Objective**: Trigger chunk recording at locations with horses

**Files**:
- `backend/api-gateway/src/services/autoScanService.ts` (UPDATE)

**Steps**:
1. Add method `private async recordAtPreset(streamId, presetNum, config)`:
   - Move PTZ to preset
   - Wait `config.movementDelay` seconds for HLS to catch up
   - Call existing `videoChunkService.recordChunk()` with duration/frameInterval
   - Return chunk ID
2. Update `runRecordingPhase()`:
   - Iterate only over presets with horses detected
   - Record at each location
   - Wait for chunk completion before moving to next
3. Link chunks to auto-scan session (metadata field or comment)
4. Emit completion event with summary

**Testing**:
- [ ] Unit: Recording method uses correct parameters
- [ ] Integration: Full recording phase creates chunks
- [ ] Regression: Chunks identical to manual recordings
- [ ] Manual: Verify chunks appear in Recorded Chunks tab

**Acceptance**:
- [ ] Chunks recorded only at locations with horses
- [ ] Chunks use configured duration/frameInterval
- [ ] Movement delay prevents recording wrong location

**Reference**: `videoChunkService.ts:recordChunk()` for recording integration

---

### Task 1.6: Add WebSocket Events for Auto-Scan Progress [x]

**Objective**: Real-time progress updates to frontend

**Files**:
- `backend/api-gateway/src/services/autoScanService.ts` (UPDATE)
- `backend/api-gateway/src/services/websocketService.ts` (UPDATE if exists)

**Steps**:
1. Import Socket.io instance in autoScanService
2. Emit events at key points:
   - `autoScan:started` - when scan begins
   - `autoScan:position` - when moving to new preset
   - `autoScan:detection` - when detection complete at preset
   - `autoScan:phaseChange` - when switching from detection to recording
   - `autoScan:recording` - when recording starts at preset
   - `autoScan:complete` - when scan finishes
   - `autoScan:stopped` - when user stops scan
   - `autoScan:error` - on any error
3. Include relevant data in each event (see overview doc)
4. Emit to room: `stream:${streamId}`

**Testing**:
- [ ] Unit: Events contain correct payload structure
- [ ] Integration: WebSocket client receives all events
- [ ] Manual: Verify events in browser devtools

**Acceptance**:
- [ ] All event types implemented
- [ ] Events scoped to correct stream room
- [ ] Payloads match TypeScript types

**Reference**: Existing WebSocket patterns in codebase

---

## Phase 2: Frontend Implementation [IN PROGRESS]

### Task 2.1: Create Auto-Scan Progress Dialog Component [x]

**Objective**: Modal dialog showing real-time scan progress

**Files**:
- `frontend/src/components/AutoScanDialog.tsx` (NEW)

**Steps**:
1. Create dialog component with:
   - Header: "Auto-Scan Progress" with close button
   - Phase indicator: "Detection Scan" or "Recording Scan"
   - Progress bar with percentage
   - Current preset name and status
   - Results list showing each preset status (icons: check, x, spinner, circle)
   - Stop button
2. Accept props: `isOpen`, `streamId`, `onClose`, `onStop`
3. Subscribe to WebSocket events on mount
4. Update local state based on events
5. Style following design system (glass morphism, forest theme)

**Testing**:
- [ ] Unit: Component renders all states correctly
- [ ] Integration: WebSocket events update UI
- [ ] Manual: Visual review of dialog styling

**Acceptance**:
- [ ] Dialog shows accurate progress
- [ ] Results list updates in real-time
- [ ] Stop button cancels scan
- [ ] Dialog follows design system

**Reference**: `docs/styles.md` for design system, `DetectionCorrectionModal.tsx` for modal pattern

---

### Task 2.2: Add Auto-Scan Settings to Stream Settings Page

**Objective**: Configuration UI for auto-scan parameters

**Files**:
- `frontend/src/components/StreamSettings.tsx` (UPDATE)

**Steps**:
1. Add collapsible "Auto-Scan Settings" section
2. Add sliders/inputs for:
   - Recording Duration (5-30s, default 10)
   - Frame Interval (1-30, default 5)
   - Movement Delay (3-15s, default 8)
3. Add help text explaining each setting
4. Save to `config.autoScan` on form submit
5. Load existing values on mount

**Testing**:
- [ ] Unit: Form validation for ranges
- [ ] Integration: Settings persist to database
- [ ] Regression: Other settings unaffected
- [ ] Manual: Verify settings used by auto-scan

**Acceptance**:
- [ ] All settings editable with appropriate controls
- [ ] Values persist across sessions
- [ ] Help text explains HLS delay relevance

**Reference**: `StreamSettings.tsx` existing form patterns

---

### Task 2.3: Add Auto-Scan Button to Live Stream Tab [x]

**Objective**: Trigger auto-scan from live stream view

**Files**:
- `frontend/src/components/PrimaryVideoPlayer.tsx` (UPDATE)

**Steps**:
1. Add "Auto Scan" button near PTZ Controls button
2. Style as green button (success color from design system)
3. Disable if no presets saved (check stream config)
4. On click:
   - Show confirmation toast or small dialog
   - Call `POST /api/v1/streams/:id/ptz/auto-scan/start`
   - Open AutoScanDialog
5. Add state for `isAutoScanning`
6. Don't switch to Recorded Chunks tab when auto-scan recording completes

**Testing**:
- [ ] Unit: Button renders correctly
- [ ] Integration: Click triggers API call
- [ ] Regression: Manual recording still switches tabs
- [ ] Manual: Full auto-scan flow from button

**Acceptance**:
- [ ] Button visible and styled correctly
- [ ] Disabled state when no presets
- [ ] Auto-scan starts on click
- [ ] Stays on live tab during auto-scan

**Reference**: `PrimaryVideoPlayer.tsx:200-250` for button area

---

### Task 2.4: Integrate WebSocket Listeners for Auto-Scan [x]

**Objective**: Connect frontend to real-time scan updates

**Files**:
- `frontend/src/components/AutoScanDialog.tsx` (UPDATE)
- `frontend/src/store/streamStore.ts` (UPDATE if using Zustand)

**Steps**:
1. In AutoScanDialog:
   - Use existing socket connection (or create if needed)
   - Listen for all `autoScan:*` events
   - Update dialog state based on events
   - Handle `autoScan:complete` to show summary
   - Handle `autoScan:error` to show error state
2. Optionally add auto-scan state to Zustand store:
   - `activeAutoScan: { streamId, phase, progress, results } | null`
3. Clean up listeners on unmount

**Testing**:
- [ ] Unit: Event handlers update state correctly
- [ ] Integration: Real events trigger UI updates
- [ ] Manual: Watch dialog during full scan

**Acceptance**:
- [ ] All WebSocket events handled
- [ ] UI updates in real-time
- [ ] No memory leaks from listeners

**Reference**: Existing WebSocket patterns in frontend

---

### Task 2.5: Update PTZControls to Show Auto-Scan Option

**Objective**: Add auto-scan quick-start from PTZ controls popup

**Files**:
- `frontend/src/components/PTZControls.tsx` (UPDATE)

**Steps**:
1. Add "Start Auto Scan" button in PTZ controls (if presets exist)
2. Show count of saved presets: "Scan 5 presets"
3. On click: trigger same flow as main Auto Scan button
4. Consider: Quick settings override (duration/interval) in popup
5. Disable during active scan

**Testing**:
- [ ] Unit: Button state based on presets
- [ ] Integration: Triggers auto-scan correctly
- [ ] Manual: Full flow from PTZ popup

**Acceptance**:
- [ ] Button visible when presets saved
- [ ] Shows preset count
- [ ] Works identically to main button

**Reference**: `PTZControls.tsx` existing button patterns

---

## Phase 3: Integration & Polish

### Task 3.1: End-to-End Testing with Real Camera

**Objective**: Verify full auto-scan flow works correctly

**Files**:
- (No file changes - testing task)

**Steps**:
1. Set up test environment:
   - Camera with PTZ capability
   - At least 3 saved presets
   - Known horse locations
2. Run full auto-scan:
   - Start from UI
   - Verify detection phase visits all presets
   - Verify recording phase only records at horse locations
   - Verify chunks appear in Recorded Chunks tab
3. Test edge cases:
   - Stop mid-scan
   - No horses detected at any location
   - All locations have horses
   - Camera connection loss
4. Document any issues found

**Testing**:
- [ ] E2E: Full scan completes successfully
- [ ] E2E: Stop button works mid-scan
- [ ] E2E: Empty scan handles gracefully
- [ ] E2E: Error recovery works

**Acceptance**:
- [ ] All scenarios tested and passing
- [ ] No critical bugs remaining
- [ ] Performance acceptable (<5 min for 8 presets)

---

### Task 3.2: Add Error Handling and Recovery

**Objective**: Graceful handling of failures during auto-scan

**Files**:
- `backend/api-gateway/src/services/autoScanService.ts` (UPDATE)
- `frontend/src/components/AutoScanDialog.tsx` (UPDATE)

**Steps**:
1. Backend error handling:
   - Catch PTZ command failures (network, camera offline)
   - Catch snapshot fetch failures
   - Catch ML service failures
   - Emit `autoScan:error` with useful message
   - Option to skip failed preset and continue vs abort
2. Frontend error display:
   - Show error state in dialog
   - Display specific error message
   - Offer retry or close options
3. Add timeout handling:
   - Overall scan timeout (configurable)
   - Per-preset timeout

**Testing**:
- [ ] Unit: Error cases handled correctly
- [ ] Integration: Errors propagate to UI
- [ ] Manual: Simulate failures (disconnect camera, etc)

**Acceptance**:
- [ ] Errors don't crash application
- [ ] User sees meaningful error messages
- [ ] Scan can recover from transient failures

**Reference**: Error handling patterns in existing services

---

### Task 3.3: Performance Optimization

**Objective**: Ensure auto-scan completes in reasonable time

**Files**:
- `backend/ml-service/src/services/snapshot_detector.py` (UPDATE)
- `backend/api-gateway/src/services/autoScanService.ts` (UPDATE)

**Steps**:
1. Profile detection phase:
   - Measure time per snapshot detection
   - Optimize image preprocessing if needed
   - Consider caching YOLO model
2. Profile recording phase:
   - Measure PTZ movement time
   - Measure HLS delay accurately
   - Fine-tune movement delay default
3. Optimize where possible:
   - Parallel operations where safe
   - Minimize API round-trips
   - Efficient WebSocket updates
4. Add timing info to scan results

**Testing**:
- [ ] Performance: Detection <500ms per snapshot
- [ ] Performance: Full 8-preset scan <5 minutes
- [ ] Manual: Timing feels responsive to user

**Acceptance**:
- [ ] Performance targets met
- [ ] No unnecessary delays
- [ ] Timing info available for tuning

---

### Task 3.4: Documentation and Handoff

**Objective**: Document auto-scan feature for users and developers

**Files**:
- `docs/Phase 5 - PTZ Auto-Scan/IMPLEMENTATION_NOTES.md` (NEW)
- `docs/HANDOFF_NOTES.md` (UPDATE)

**Steps**:
1. Create implementation notes:
   - Architecture decisions made
   - Known limitations
   - Configuration recommendations
   - Troubleshooting guide
2. Update handoff notes:
   - Feature complete status
   - Any remaining TODOs
   - Future enhancement ideas
3. Add inline code comments for complex logic
4. Update README if needed

**Testing**:
- [ ] Manual: Documentation is accurate and complete

**Acceptance**:
- [ ] Implementation notes cover all key aspects
- [ ] Handoff notes updated
- [ ] Code comments added where needed

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
