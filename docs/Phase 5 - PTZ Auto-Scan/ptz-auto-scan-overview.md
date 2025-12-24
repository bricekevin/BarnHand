# PTZ Auto-Scan Mode - Phase 5 Overview

## Goal

Implement an intelligent auto-patrol mode for PTZ cameras that automatically cycles through saved preset locations, using snapshot-based YOLO detection to identify locations with horses, then triggers full ML processing (recording + pose estimation + tracking) only at those locations. This enables efficient monitoring of large barns with minimal user intervention.

## Scope

**Includes**:
- Two-phase scan: Quick snapshot scan → Targeted recording scan
- YOLO-only detection endpoint for fast horse presence checking
- Auto-scan progress dialog with real-time status
- Per-location horse detection results display
- Configurable settings (delays, duration, frame interval) in Stream Settings
- Credential refactoring (camera auth stored with stream, not localStorage)
- Integration with existing recording pipeline (same output as manual "Record X Seconds")

**Excludes**:
- Scheduled/timed auto-scans (future feature)
- Cross-stream auto-scan coordination
- Automatic preset learning from horse activity patterns
- MJPEG continuous stream processing

## Architecture Overview

### Two-Phase Scan Strategy

Due to HLS restreaming delay (~5-10 seconds), auto-scan operates in two phases:

**Phase A: Snapshot Detection Scan (Fast)**
1. Move to preset 1 → Take snapshot → YOLO detect → Record if horses found
2. Move to preset 2 → Take snapshot → YOLO detect → Record which have horses
3. ... Continue through all saved presets
4. Build list of "locations with horses"

**Phase B: Recording Scan (Targeted)**
1. For each location with horses detected:
2. Move to preset → Wait for HLS delay → Record chunk → Process with full ML pipeline
3. Continue to next location with horses
4. Complete scan

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTO-SCAN FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    Phase A: Snapshot Scan                                 │
│  │ User clicks  │                                                            │
│  │ "Auto Scan"  │───► Move PTZ ───► Get Snapshot ───► YOLO Only ──┐        │
│  └──────────────┘         │              │              │          │        │
│                           ▼              ▼              ▼          │        │
│                      Preset 1      auto.jpg       horses? ───────► │        │
│                      Preset 2      auto.jpg       horses? ───────► │        │
│                      Preset N      auto.jpg       horses? ───────► │        │
│                                                                     │        │
│                      ┌──────────────────────────────────────────────┘        │
│                      │                                                        │
│                      ▼  Phase B: Recording Scan (only locations w/ horses)  │
│               ┌──────────────┐                                               │
│               │ Locations    │                                               │
│               │ with horses  │───► Move PTZ ───► Wait Delay ───► Record     │
│               │ [1, 3, 5]    │         │             │             │         │
│               └──────────────┘         │             │             ▼         │
│                                        │             │      Full ML Pipeline │
│                                        │             │      (YOLO+Pose+ReID) │
│                                        │             │             │         │
│                                        │             │             ▼         │
│                                        │             │      video_chunks     │
│                                        │             │      (same as manual) │
│                                        ▼             ▼             │         │
│                                   Next preset   HLS catches up     │         │
│                                                                     │         │
│  ┌──────────────┐                                                   │        │
│  │ Progress     │◄────── WebSocket: scan:position, scan:detection ──┘        │
│  │ Dialog       │                                                            │
│  └──────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture Changes

### Frontend

- **New Component**: `AutoScanDialog.tsx` - Progress dialog showing scan status
- **Updated**: `PTZControls.tsx` - Add "Auto Scan" button, refactor auth to use stream config
- **Updated**: `StreamSettings.tsx` - Add auto-scan configuration section
- **Updated**: `PrimaryVideoPlayer.tsx` - Integrate auto-scan button, stay on live tab during auto mode
- **New Store**: Add auto-scan state to Zustand store (or extend existing)

### Backend - API Gateway

- **New Endpoint**: `POST /api/v1/streams/:id/ptz/auto-scan/start` - Start auto-scan
- **New Endpoint**: `GET /api/v1/streams/:id/ptz/auto-scan/status` - Get current scan state
- **New Endpoint**: `POST /api/v1/streams/:id/ptz/auto-scan/stop` - Stop auto-scan
- **New Service**: `autoScanService.ts` - Orchestrates scan phases
- **Updated**: `streams.ts` routes - Add auto-scan endpoints
- **Updated**: Stream config schema - Add auto-scan settings

### Backend - ML Service (Python)

- **New Endpoint**: `POST /detect-snapshot` - YOLO-only detection on single image
- **Updated**: `processor.py` - Expose YOLO detection as standalone function
- **New File**: `snapshot_detector.py` - Fast horse detection for snapshots

### Database

- **Updated Schema**: Add auto-scan settings to `streams.config` JSONB
- **New Table (optional)**: `auto_scan_results` for scan history/analytics

## Key Technical Decisions

### Decision 1: Two-Phase Scan vs Single-Pass
- **Choice**: Two-phase (snapshot scan first, then recording scan)
- **Rationale**: HLS delay makes it inefficient to wait at each location. Snapshot detection is instant, recording can be batched.

### Decision 2: Snapshot Detection Backend
- **Choice**: New ML endpoint `/detect-snapshot` that only runs YOLO
- **Rationale**: Full pipeline (pose, ReID) is overkill for presence detection. YOLO-only is 5-10x faster.

### Decision 3: Camera Auth Storage
- **Choice**: Refactor to use `streams.config.ptzCredentials` instead of localStorage
- **Rationale**: Enables server-side PTZ control, survives browser refresh, supports multi-user access.

### Decision 4: Auto-Scan State Management
- **Choice**: Redis for active scan state, WebSocket for progress updates
- **Rationale**: Survives API restarts, enables real-time UI updates, follows existing patterns.

### Decision 5: Recording Integration
- **Choice**: Use existing `recordChunk` flow (same as manual "Record X Seconds")
- **Rationale**: Ensures consistency - auto-scan chunks appear in Recorded Chunks tab identically.

## Configuration Schema

```typescript
// streams.config JSONB structure
interface StreamConfig {
  // Existing
  username?: string;
  password?: string;
  useAuth?: boolean;

  // New: PTZ Credentials (refactored from localStorage)
  ptzCredentials?: {
    username: string;
    password: string;
  };

  // New: Saved Presets (refactored from localStorage)
  ptzPresets?: {
    [presetNumber: string]: {
      name: string;
      savedAt: string;  // ISO timestamp
    };
  };

  // New: Auto-Scan Settings
  autoScan?: {
    recordingDuration: number;     // 5-30 seconds (default: 10)
    frameInterval: number;         // 1-30 (default: 5)
    movementDelay: number;         // seconds to wait after PTZ move before recording (default: 8)
    presetSequence: number[];      // which presets to scan [1,2,3,4] (default: all saved)
  };
}
```

## WebSocket Events

```typescript
// New events for auto-scan progress
'autoScan:started'      // { streamId, totalPresets, phase: 'detection' }
'autoScan:position'     // { streamId, preset, phase, horsesDetected: boolean }
'autoScan:phaseChange'  // { streamId, phase: 'recording', locationsWithHorses: [1,3,5] }
'autoScan:recording'    // { streamId, preset, chunkId }
'autoScan:complete'     // { streamId, results: { scanned: 8, withHorses: 3, chunksRecorded: 3 } }
'autoScan:stopped'      // { streamId, reason: 'user' | 'error' }
'autoScan:error'        // { streamId, error: string }
```

## UI Flow

### Auto-Scan Button (Live Stream Tab)
- Green "Auto Scan" button next to PTZ Controls
- Disabled if no presets saved
- Click opens confirmation with settings preview

### Progress Dialog
```
┌─────────────────────────────────────────────────────┐
│  Auto-Scan Progress                            [X]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Phase: Detection Scan (3/8 presets)               │
│  ████████░░░░░░░░░░░░░░░░░░░░░░ 38%               │
│                                                     │
│  Current: Preset 3 - "South Paddock"               │
│  Status: Checking for horses...                    │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Location Results:                            │   │
│  │                                              │   │
│  │  ✓ Preset 1 "North Barn"     🐴 2 horses    │   │
│  │  ✗ Preset 2 "Feed Area"      No horses      │   │
│  │  ⏳ Preset 3 "South Paddock"  Checking...    │   │
│  │  ○ Preset 4 "Arena"          Pending        │   │
│  │  ...                                         │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [ Stop Scan ]                                      │
└─────────────────────────────────────────────────────┘
```

### Settings Page (Stream Settings)
```
┌─────────────────────────────────────────────────────┐
│  Auto-Scan Settings                                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Recording Duration:  [====●=====] 10 seconds      │
│  Frame Interval:      [==●=======] 5 frames        │
│  Movement Delay:      [=====●====] 8 seconds       │
│                                                     │
│  ℹ️ Movement delay accounts for HLS stream lag.     │
│     Increase if recordings show previous location.  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Testing Strategy

- **Unit**: YOLO-only detection endpoint, auto-scan state machine, config persistence
- **Integration**: Full scan cycle with mock PTZ commands, WebSocket event flow
- **E2E**: Manual test with real camera (start scan → verify all phases → check chunks)
- **Performance**: Snapshot detection <500ms, full scan of 8 presets <5 minutes

## Success Metrics

- Auto-scan correctly identifies locations with horses (>90% accuracy on snapshots)
- Recorded chunks during auto-scan appear identically to manual recordings
- Progress dialog accurately reflects scan state in real-time
- Settings persist and apply correctly across sessions
- No recordings triggered at empty locations (false positive rate <10%)

## Risks & Mitigations

**Risk 1: HLS Delay Variability**
- Different network conditions affect delay
- *Mitigation*: Configurable movement delay in settings, default conservative (8s)

**Risk 2: Snapshot Quality Issues**
- Camera auto-exposure may not settle before snapshot
- *Mitigation*: Optional small delay after PTZ move before snapshot (1-2s built-in)

**Risk 3: False Negatives in Snapshot Detection**
- Horse partially visible or occluded
- *Mitigation*: Lower confidence threshold for snapshot detection (0.3 vs 0.5), can record "maybe" locations

## Estimate

- **Total**: 16-20 hours across 14 tasks
- **Phase 0 (Foundation)**: 2-3 hours - Schema, types, credential refactor
- **Phase 1 (Backend)**: 6-8 hours - ML endpoint, API endpoints, scan service
- **Phase 2 (Frontend)**: 5-6 hours - Dialog, settings, button integration
- **Phase 3 (Integration)**: 3-4 hours - Testing, polish, edge cases
