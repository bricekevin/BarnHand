# Detection Correction & Re-Processing - Phase 4 Overview

## Goal

Enable users to manually correct horse detection assignments in processed chunks by reassigning detections to existing horses, creating new guest horses, or marking detections as incorrect. When corrections are saved, automatically trigger re-processing to update all affected data, regenerate video frames with corrected annotations, rebuild the chunk video, and update ReID feature vectors for improved future detection accuracy.

## Scope

**Includes**:
- Edit UI in FrameInspector/DetectionDataPanel for per-detection corrections
- Batch edit mode supporting multiple corrections before submission
- Backend API endpoints for submitting detection corrections
- ML service re-processing pipeline triggered by corrections
- Frame regeneration with corrected horse name overlays
- Video chunk rebuilding with updated frames
- ReID feature vector updates for improved future tracking
- Database updates for detections, chunks, and horse registries
- Progress tracking and real-time UI updates during re-processing
- Automatic page reload when re-processing completes

**Excludes**:
- Bulk correction across multiple chunks (Phase 5)
- AI-assisted correction suggestions (Phase 5)
- Correction history/audit trail (Phase 5)
- Undo/redo functionality (Phase 5)

## Architecture Changes

### Frontend

**New Components**:
- `DetectionCorrectionModal.tsx` - Modal UI for correcting individual horse detections
- `CorrectionBatchPanel.tsx` - Shows pending corrections before submission
- `ReprocessingProgress.tsx` - Real-time progress indicator during re-processing

**Updated Components**:
- `FrameInspector.tsx` - Add edit/pencil button next to each tracked horse
- `DetectionDataPanel.tsx` - Add batch correction summary and "Process Corrections" button
- `PrimaryVideoPlayer.tsx` - Handle re-processing events and auto-reload

**State Management (Zustand)**:
- Add `chunkCorrections` store for pending corrections
- Add `reprocessingStatus` store for tracking re-processing progress

### Backend - API Gateway

**New Endpoints**:
- `POST /api/v1/streams/:id/chunks/:chunkId/corrections` - Submit detection corrections
- `GET /api/v1/streams/:id/chunks/:chunkId/corrections/status` - Get re-processing status
- `DELETE /api/v1/streams/:id/chunks/:chunkId/corrections/:correctionId` - Cancel pending correction

**Updated Services**:
- `videoChunkService.ts` - Add correction submission and status tracking
- New `correctionService.ts` - Manage correction lifecycle

### Backend - ML Service (Python)

**New Endpoints**:
- `POST /api/v1/reprocess/chunk/:chunkId` - Trigger chunk re-processing
- `GET /api/v1/reprocess/chunk/:chunkId/status` - Get re-processing progress

**New Service**:
- `reprocessor.py` - Orchestrate re-processing workflow:
  1. Load chunk frames from disk
  2. Apply detection corrections to tracking data
  3. Update ReID feature vectors for affected horses
  4. Regenerate frame overlays with corrected names
  5. Rebuild video chunk from corrected frames
  6. Update database (detections, chunks, horses)
  7. Emit WebSocket progress events

**Updated Services**:
- `horse_database.py` - Add methods for updating horse feature vectors
- `processor.py` - Extract frame overlay rendering logic for reuse

### Database

**New Table**: `detection_corrections`
```sql
CREATE TABLE detection_corrections (
    id UUID PRIMARY KEY,
    chunk_id UUID REFERENCES video_chunks(id),
    detection_index INTEGER NOT NULL,
    frame_index INTEGER NOT NULL,
    correction_type VARCHAR(50) NOT NULL, -- 'reassign', 'new_guest', 'mark_incorrect'
    original_horse_id VARCHAR(255),
    corrected_horse_id VARCHAR(255),
    corrected_horse_name VARCHAR(255),
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    applied_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending' -- 'pending', 'applied', 'failed'
);
```

**Updated Schema**:
- Add `last_corrected` TIMESTAMP to `video_chunks` table
- Add `correction_count` INTEGER to `video_chunks` table

## Data Flow

### Correction Submission Flow
1. **User Action**: User clicks edit button next to horse in FrameInspector
2. **Modal Opens**: DetectionCorrectionModal shows correction options:
   - Reassign to existing horse (dropdown of all horses in stream)
   - Create new guest horse (auto-generates name like "Guest Horse 5")
   - Mark as incorrect detection (will be removed)
3. **Pending State**: Correction added to Zustand store, shown in batch panel
4. **Batch Submission**: User clicks "Process Corrections" button
5. **API Call**: POST to `/api/v1/streams/:id/chunks/:chunkId/corrections` with array of corrections
6. **Database Save**: Corrections saved to `detection_corrections` table with status='pending'
7. **ML Trigger**: API Gateway calls ML service `/api/v1/reprocess/chunk/:chunkId`

### Re-Processing Flow
1. **Validation**: ML service validates chunk exists and corrections are valid
2. **Load Chunk Data**: Load original frames, detections, tracking data from disk/DB
3. **Apply Corrections**:
   - Reassign detections: Update horse_id in detection records
   - New guests: Create new horse entries in DB, assign new tracking color
   - Mark incorrect: Remove from detections array, update chunk stats
4. **Update ReID**:
   - Recalculate feature vectors for affected horses
   - Update `horses.feature_vector` in PostgreSQL
   - Update Redis cache for cross-chunk continuity
5. **Regenerate Frames**:
   - For each frame with corrected detections:
     - Redraw bounding boxes with correct colors
     - Update text overlays with correct horse names
     - Save frame to disk (overwrite original)
6. **Rebuild Video**:
   - Use FFmpeg to create new HLS chunks from corrected frames
   - Update `video_chunks.output_url` if path changes
7. **Update Database**:
   - Update `detection_corrections.status` to 'applied'
   - Update `detection_corrections.applied_at` timestamp
   - Update `video_chunks.last_corrected` and `correction_count`
   - Update detection records with new horse assignments
8. **Emit Events**:
   - WebSocket `reprocessing:progress` (10%, 30%, 50%, 70%, 90%, 100%)
   - WebSocket `chunk:updated` when complete
   - WebSocket `horses:updated` for affected horses
9. **Frontend Reload**: UI auto-reloads chunk data when status=100%

## Key Decisions

**Decision 1: In-Place Re-Processing vs. Versioning**
- **Choice**: In-place re-processing (overwrite original frames/video)
- **Rationale**: Simpler implementation, avoids storage bloat. Users expect corrections to "fix" the chunk, not create a new version.
- **Trade-off**: No built-in undo. Mitigated by requiring explicit user confirmation before processing.

**Decision 2: Synchronous vs. Asynchronous Re-Processing**
- **Choice**: Asynchronous with progress tracking
- **Rationale**: Re-processing can take 10-30 seconds for 10-second chunk. Don't block UI.
- **Implementation**: API returns 202 Accepted immediately, client polls status endpoint or listens to WebSocket events.

**Decision 3: Batch Corrections vs. Per-Detection**
- **Choice**: Batch corrections with single re-processing pass
- **Rationale**: More efficient to apply multiple corrections at once. Avoids multiple expensive re-processing operations.
- **UX**: User can queue up corrections, preview them, then click "Process" once.

**Decision 4: ReID Update Strategy**
- **Choice**: Full feature vector recalculation from corrected detections
- **Rationale**: Corrections indicate ML made mistakes. Recalculating from ground truth (user corrections) improves future accuracy.
- **Implementation**: Re-extract features from corrected bounding boxes, update weighted average in DB.

## Testing Strategy

### Unit Tests
- `correctionService.ts`: Validate correction payload, handle invalid horse IDs
- `reprocessor.py`: Apply corrections logic, feature vector updates
- `videoChunkService.ts`: Status tracking, correction count updates

### Integration Tests
- **Correction Workflow**: Submit correction => verify DB records => verify ML triggered
- **Re-Processing**: Mock FFmpeg, verify frames regenerated, video rebuilt
- **ReID Update**: Verify feature vectors updated in PostgreSQL + Redis

### E2E Tests (Playwright)
- **Happy Path**:
  1. Load chunk with 2 horses
  2. Click edit on Horse 1
  3. Reassign to existing Horse 2
  4. Submit correction
  5. Verify progress indicator appears
  6. Wait for completion (mock fast re-processing)
  7. Verify chunk reloads with corrected data
- **Error Handling**: Submit invalid horse ID => verify error message
- **Batch Corrections**: Queue 3 corrections => submit => verify all applied

### Manual Testing
- Re-process chunk with 5 corrections, verify all frames updated
- Check ReID accuracy improves after corrections (same horse detected correctly in next chunk)
- Verify video playback shows corrected names in overlays

## Success Metrics

- **Functionality**: 100% of corrections applied successfully (no data loss)
- **Performance**: Re-processing completes in <2x chunk duration (e.g., 10s chunk => <20s re-processing)
- **UX**: Progress indicator updates within 500ms of status changes
- **Accuracy**: ReID accuracy improves by >10% for corrected horses in subsequent chunks

## Risks

**Risk 1: Frame/Video Corruption During Re-Processing**
- **Likelihood**: Medium
- **Impact**: High (chunk unusable)
- **Mitigation**: Create backup of original frames before re-processing. Rollback on error.

**Risk 2: Re-Processing Queue Bottleneck**
- **Likelihood**: Low (single-user system initially)
- **Impact**: Medium (slow re-processing)
- **Mitigation**: Implement re-processing queue in Redis with max 3 concurrent jobs.

**Risk 3: Inconsistent ReID After Corrections**
- **Likelihood**: Medium
- **Impact**: Medium (wrong horses detected after corrections)
- **Mitigation**: Weight user corrections heavily (0.7) vs. ML detections (0.3) when updating feature vectors.

**Risk 4: UI Refresh Race Condition**
- **Likelihood**: Medium
- **Impact**: Low (user sees stale data briefly)
- **Mitigation**: Lock chunk UI during re-processing. Only unlock after receiving `chunk:updated` event.

## Estimate

**Total**: 18-22 hours across 15 tasks (3 phases)

**Phase 0: Foundation** (4-5 hours)
- Database schema, types, API contracts

**Phase 1: Backend Implementation** (8-10 hours)
- API endpoints, correction service, ML re-processing pipeline

**Phase 2: Frontend Implementation** (4-5 hours)
- Edit UI, modal, batch panel, progress indicator

**Phase 3: Integration & Testing** (2-3 hours)
- E2E tests, WebSocket events, auto-reload logic
