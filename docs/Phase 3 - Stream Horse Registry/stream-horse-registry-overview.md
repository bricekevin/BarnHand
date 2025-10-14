# Stream-Level Horse Registry - Phase 3 Overview

## Goal
Upgrade the current chunk-level horse ReID system to maintain persistent horse identities per stream. Add a "Detected Horses" tab in the stream page UI to display, manage, and annotate horses detected across all chunks in that stream. This enables long-term horse tracking, manual identification, and continuous learning across video processing sessions.

## Scope
**Includes**:
- Persistent per-stream horse registry in PostgreSQL (survives server reboots)
- Redis-backed horse state for cross-chunk continuity (current chunk → known horses)
- New "Detected Horses" tab in Stream UI (alongside Live Stream and Recorded Chunks tabs)
- Horse avatar thumbnails and assigned tracking colors
- Manual horse naming/details editing interface
- Integration with ML processing to match against known horses first
- Display horse ID + name on video overlays during chunk playback

**Excludes**:
- Cross-stream horse matching (Phase 4 - Global Horse Database)
- Advanced horse profile features (age, breed, health tracking - Phase 4)
- Automatic horse naming with computer vision
- Multi-stream horse synchronization

## Architecture Changes

### Frontend
- **New Tab Component**: `DetectedHorsesTab.tsx` - displays horse registry grid
- **New Horse Card Component**: `HorseCard.tsx` - shows avatar, ID, name, detection count
- **New Horse Edit Modal**: `HorseEditModal.tsx` - edit name, notes, metadata
- **Updated**: `PrimaryVideoPlayer.tsx` - add 3rd tab for "Detected Horses"
- **Updated**: `OverlayCanvas.tsx` - show horse name + ID in detection overlays
- **State Management**: Add horse registry to Zustand store

### Backend - API Gateway
- **Updated**: `/api/v1/streams/:id/horses` - GET stream horse registry
- **New**: `/api/v1/streams/:id/horses/:horseId` - GET/PUT specific horse
- **New**: `/api/v1/streams/:id/horses/:horseId/thumbnail` - GET horse avatar image
- **Updated**: Chunk detection endpoint returns horse names from registry

### Backend - ML Service (Python)
- **Updated**: `horse_tracker.py` - load stream horses from Redis on init
- **Updated**: `processor.py` - persist horses to DB after each chunk
- **Updated**: `horse_database.py` - already has cross-chunk Redis methods (lines 61-250)
- **New Logic**: On chunk start, load known horses and their features for matching
- **New Logic**: After chunk end, save all active horses to DB + Redis

### Database
- **Updated Schema**: `horses` table already supports stream_id (line 286 in horse_database.py)
- **New Migration**: Add `avatar_thumbnail` BYTEA column to horses table
- **New Migration**: Add stream_id index for fast per-stream queries
- **Existing**: Redis horse state keys (`horse:{stream_id}:{horse_id}:state`) - already implemented

## Data Flow

### Chunk Processing Flow (Updated)
1. **Chunk Start**: ML service loads known horses for stream from Redis/PostgreSQL
2. **Frame Processing**: Tracker matches detections against known horses using ReID features
3. **New Horse Detected**: Create new horse entry with auto-ID, color, thumbnail
4. **Chunk Complete**: Save all horses (new + updated) to PostgreSQL + Redis
5. **Frontend Update**: WebSocket `horses:updated` event triggers UI refresh

### User Interaction Flow
1. User selects stream → clicks "Detected Horses" tab
2. Frontend fetches `/api/v1/streams/:streamId/horses`
3. Display grid of horse cards (avatar, ID, name, last seen, detection count)
4. User clicks horse → opens edit modal
5. User adds name + notes → PUT `/api/v1/streams/:streamId/horses/:horseId`
6. All future chunk overlays show horse name

## Key Decisions

**Decision 1: Per-Stream vs Global Horse Registry**
- **Choice**: Per-stream first (Phase 3), global later (Phase 4)
- **Rationale**: Simpler implementation, avoids cross-stream false positives, matches user mental model (horses belong to specific camera views)
- **Trade-off**: Can't automatically link same horse across streams yet

**Decision 2: Redis + PostgreSQL Hybrid Storage**
- **Choice**: Redis for active chunk state (5min TTL), PostgreSQL for permanent registry
- **Rationale**: Redis enables fast cross-chunk lookups, PostgreSQL survives reboots
- **Implementation**: Already exists in `horse_database.py` (lines 61-250)

**Decision 3: Thumbnail Storage in Database**
- **Choice**: Store small JPEG thumbnails as BYTEA in PostgreSQL
- **Rationale**: Simple, self-contained, no external file system dependencies
- **Limit**: 50KB max thumbnail size (compress to 200x200 JPEG at 80% quality)

**Decision 4: Horse ID Assignment**
- **Choice**: Auto-incrementing per-stream IDs (Horse #1, #2, etc.)
- **Rationale**: Easy to reference visually, familiar to users
- **Format**: Display as "Horse #3 - Thunder" or "Horse #3" if unnamed

## Testing Strategy

### Unit Tests
- **ML Service**: Test horse persistence to DB + Redis
- **ML Service**: Test loading known horses on chunk init
- **API Gateway**: Test horse CRUD endpoints with auth
- **Frontend**: Test DetectedHorsesTab component rendering

### Integration Tests
- **E2E Scenario 1**: Record chunk → horse detected → appears in Detected Horses tab
- **E2E Scenario 2**: Record 2nd chunk → same horse re-identified → detection count increments
- **E2E Scenario 3**: User renames horse → name appears on next chunk playback
- **E2E Scenario 4**: Server restart → horses still in DB → next chunk uses known horses

### Manual Testing
- Record 3 chunks with same horse, verify consistent ID across chunks
- Rename horse, verify overlay shows name on chunk replay
- Record chunk with 2 horses, verify both get unique IDs and colors
- Delete horse from registry (future), verify removed from system

## Success Metrics

### Functionality
- ✅ Horses persist across chunks within a stream (>95% re-identification accuracy)
- ✅ Horse registry survives server reboots (PostgreSQL persistence)
- ✅ Thumbnails display correctly for all detected horses
- ✅ User can rename horse and name appears in overlays within 1 second
- ✅ No duplicate horses created for same individual within stream

### Performance
- Horse registry loads in <500ms for streams with <50 horses
- Thumbnail generation adds <100ms to chunk processing time
- Redis horse state lookup adds <10ms to frame processing
- Frontend horse tab renders <300ms for 20 horses

### User Experience
- Clear visual connection between Detected Horses tab and video overlays (matching colors)
- Intuitive horse naming workflow (click → edit → save)
- Responsive UI updates when new horses detected

## Risks

**Risk 1: False Re-identification**
- **Description**: Different horses matched as same individual due to similar appearance
- **Mitigation**: Use conservative similarity threshold (0.75 instead of 0.7), add manual "Split Horse" feature in Phase 4

**Risk 2: Thumbnail Quality**
- **Description**: Poor lighting/angle results in bad horse avatars
- **Mitigation**: Select best frame from first 30 detections (highest confidence + largest bbox), allow manual thumbnail upload in Phase 4

**Risk 3: Performance with Many Horses**
- **Description**: Streams with 100+ unique horses may slow down matching
- **Mitigation**: Use FAISS indexing (already implemented in ReID model), limit active Redis cache to 50 most recent horses

**Risk 4: Cross-Chunk Gaps**
- **Description**: Horse not seen for 10+ minutes may not be re-identified
- **Mitigation**: Increase Redis TTL to 300s (current), store all horses in PostgreSQL for long-term matching

## Estimate
**Total**: 14-16 hours across 12 tasks

### Breakdown by Phase:
- **Phase 0 (Foundation)**: 2 hours - Schema updates, documentation
- **Phase 1 (Backend)**: 5-6 hours - ML integration, API endpoints
- **Phase 2 (Frontend)**: 4-5 hours - New tab, horse cards, edit modal
- **Phase 3 (Integration)**: 2-3 hours - WebSocket events, overlay updates
- **Phase 4 (Testing)**: 1-2 hours - E2E tests, manual validation

### Task Distribution:
- 1-2 hours per task on average
- 5-10 files modified per task
- Independent tasks can be parallelized (backend + frontend development)

## Dependencies
- Existing Redis infrastructure (✅ already configured)
- Existing PostgreSQL with pgvector (✅ already configured)
- Existing ReID feature extraction (✅ MegaDescriptor model working)
- Existing chunk recording system (✅ implemented in video-streamer)

## Future Extensions (Phase 4)
- Global horse database (cross-stream matching)
- Horse profile pages (detailed stats, behavior timeline)
- Bulk horse import/export
- Horse grouping and hierarchies
- Automatic health monitoring alerts
