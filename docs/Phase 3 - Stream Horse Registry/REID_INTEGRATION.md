# ReID Integration Plan for Phase 3: Stream Horse Registry

## Document Purpose
This document audits the existing horse re-identification (ReID) system and identifies integration points for implementing the persistent per-stream horse registry in Phase 3.

---

## Current ReID System Architecture

### 1. HorseTracker Initialization
**File**: `backend/ml-service/src/models/horse_tracker.py:57-88`

#### Current Flow:
```python
def __init__(self, similarity_threshold: float = 0.7, max_lost_frames: int = 30):
    self.reid_model = HorseReIDModel()
    self.similarity_threshold = similarity_threshold
    self.max_lost_frames = max_lost_frames

    # Active tracks
    self.tracks: Dict[str, HorseTrack] = {}
    self.next_track_id = 1
    self.color_index = 0

    # Track management
    self.lost_tracks: Dict[str, HorseTrack] = {}
    self.track_history: List[HorseTrack] = []
```

**Key Observations**:
- Tracker starts fresh for each processing session
- `next_track_id` always starts at 1
- No persistence of known horses from previous chunks
- Tracks dictionary is in-memory only

**Integration Requirement**:
- Must initialize tracker with known horses from stream registry (PostgreSQL + Redis)
- Must preserve track IDs across chunks for continuity

---

### 2. Horse Track Creation
**File**: `backend/ml-service/src/models/horse_tracker.py:466-498`

#### Current Flow:
```python
def _create_new_track(self, detection: Dict[str, Any], features: np.ndarray, timestamp: float):
    track_id = f"horse_{self.next_track_id:03d}"
    self.next_track_id += 1

    track = HorseTrack(
        id=track_id,
        tracking_id=self.next_track_id - 1,
        color=self._get_next_color(),
        feature_vector=features.copy(),
        last_bbox=detection["bbox"].copy(),
        last_seen=timestamp,
        confidence=detection.get("confidence", 0.5),
        first_appearance_features=features.copy()
    )

    # Initialize appearance history
    track.appearance_history.append({
        "timestamp": timestamp,
        "bbox": detection["bbox"].copy(),
        "features": features.copy(),
        "confidence": detection.get("confidence", 0.5)
    })

    # Add to tracking system
    self.tracks[track_id] = track
    self.reid_model.add_horse_to_index(track_id, features)
```

**Key Observations**:
- New horses created on-the-fly during detection
- Auto-incremented track IDs (horse_001, horse_002, etc.)
- Feature vector stored in appearance history
- Color assigned from 10-color palette

**Integration Requirement**:
- Before creating new track, check if features match known horses from registry
- If match found, reactivate existing horse with persisted ID
- If no match, create new horse and add to registry
- Capture thumbnail from best frame (highest confidence + largest bbox)

---

### 3. Redis Persistence System
**File**: `backend/ml-service/src/services/horse_database.py:61-250`

#### Current Implementation:

**Save Horse State** (lines 61-99):
```python
async def save_horse_state_to_redis(self, stream_id: str, horse_id: str, horse_state: Dict):
    redis_key = f"horse:{stream_id}:{horse_id}:state"

    state_data = {
        "horse_id": horse_id,
        "stream_id": stream_id,
        "last_updated": time.time(),
        "bbox": horse_state.get("bbox", {}),
        "confidence": horse_state.get("confidence", 0.0),
        "total_detections": horse_state.get("total_detections", 0),
        "features": horse_state.get("features", []),
        "behavioral_state": horse_state.get("behavioral_state", {}),
        "tracking_confidence": horse_state.get("tracking_confidence", 1.0)
    }

    self.redis_client.setex(redis_key, 300, json.dumps(state_data))  # 300s TTL
```

**Load Stream Horses** (lines 133-160):
```python
async def load_stream_horse_registry(self, stream_id: str) -> Dict[str, Dict]:
    pattern = f"horse:{stream_id}:*:state"
    keys = self.redis_client.keys(pattern)

    horses = {}
    for key in keys:
        state_json = self.redis_client.get(key)
        if state_json:
            state_data = json.loads(state_json)
            horse_id = state_data.get("horse_id")
            if horse_id:
                horses[horse_id] = state_data

    return horses
```

**Key Observations**:
- Redis used for cross-chunk continuity (5-minute TTL)
- State includes features, bbox, confidence, detections count
- Key pattern: `horse:{stream_id}:{horse_id}:state`
- Function `load_stream_horse_registry` already exists! ✅

**Integration Requirement**:
- Call `load_stream_horse_registry` at chunk start
- Pass loaded horses to HorseTracker initialization
- Extend TTL or add PostgreSQL fallback for longer-term persistence

---

### 4. Chunk Processing Flow
**File**: `backend/ml-service/src/services/processor.py`

#### Current Flow:

**Chunk Processing Start** (lines 213-260):
```python
async def process_chunk_with_video_output(self, chunk_path, chunk_metadata, ...):
    chunk_id = chunk_metadata.get("chunk_id")
    stream_id = chunk_metadata.get("stream_id")

    # Open video file
    cap = cv2.VideoCapture(chunk_path)

    # Process frames
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Detection -> Pose -> Tracking
        detections = await self.detection_model.detect(frame)
        poses = await self.pose_model.estimate_pose(frame, detections)
        tracked_horses = self.horse_tracker.update_tracks(detections, frame, timestamp)
```

**Horse Persistence** (lines 135-139):
```python
# Save horse to database if new or updated
if track_info["is_new"] or track_info["total_detections"] % 10 == 0:
    await self._save_horse_to_database(track_info, frame_timestamp)
```

**Horse Save Method** (lines 703-719):
```python
async def _save_horse_to_database(self, track_info: Dict, timestamp: float):
    horse_data = {
        "id": track_info.get("id"),
        "tracking_id": track_info.get("tracking_id"),
        "color": track_info.get("color"),
        "bbox": track_info.get("bbox"),
        "confidence": track_info.get("confidence", 0.5),
        "last_seen": timestamp,
        "total_detections": track_info.get("total_detections", 0)
    }

    await self.horse_db.save_horse(horse_data)
```

**Key Observations**:
- Horses saved to database during chunk processing (every 10 detections)
- No horse loading before chunk starts (only saves, no loads)
- stream_id available in chunk_metadata

**Integration Requirement**:
- **BEFORE chunk processing loop**: Load stream horses from registry
- **DURING chunk processing**: Capture best thumbnail frames
- **AFTER chunk complete**: Save all horses (new + updated) to PostgreSQL + Redis

---

## Phase 1 Integration Points

### Integration Point 1: Load Known Horses on Chunk Start
**Location**: `processor.py:220` (before frame loop starts)

**Required Changes**:
```python
async def process_chunk_with_video_output(self, chunk_path, chunk_metadata, ...):
    chunk_id = chunk_metadata.get("chunk_id")
    stream_id = chunk_metadata.get("stream_id")

    # ✨ NEW: Load known horses for this stream
    known_horses = await self.horse_db.load_stream_horse_registry(stream_id)
    logger.info(f"Loaded {len(known_horses)} known horses for stream {stream_id}")

    # ✨ NEW: Initialize tracker with known horses
    self.horse_tracker.initialize_with_known_horses(known_horses)

    # Continue with chunk processing...
```

**Estimated Impact**: +50-100ms chunk startup time

---

### Integration Point 2: Update HorseTracker Initialization
**Location**: `horse_tracker.py:57` (add new parameter)

**Required Changes**:
```python
def __init__(self, similarity_threshold: float = 0.7, max_lost_frames: int = 30,
             stream_id: str = None, known_horses: Dict = None):
    self.reid_model = HorseReIDModel()
    self.similarity_threshold = similarity_threshold
    self.max_lost_frames = max_lost_frames
    self.stream_id = stream_id  # ✨ NEW

    # Active tracks
    self.tracks: Dict[str, HorseTrack] = {}

    # ✨ NEW: Load known horses if provided
    if known_horses:
        self._load_known_horses(known_horses)
        self.next_track_id = max(int(h["tracking_id"]) for h in known_horses.values()) + 1
    else:
        self.next_track_id = 1
```

**Estimated Impact**: +10-20ms tracker initialization

---

### Integration Point 3: Save Horses After Chunk Complete
**Location**: `processor.py:445` (after frame loop ends)

**Required Changes**:
```python
# Cleanup video capture
cap.release()

# ✨ NEW: Save all horses to PostgreSQL + Redis
all_tracks = self.horse_tracker.get_all_tracks()
for track_id, track in all_tracks.items():
    horse_data = {
        "id": track.id,
        "stream_id": stream_id,
        "tracking_id": track.tracking_id,
        "color": track.color,
        "feature_vector": track.feature_vector.tolist(),
        "avatar_thumbnail": track.thumbnail_data,  # ✨ NEW
        "first_detected": track.first_seen,
        "last_seen": track.last_seen,
        "total_detections": track.detection_count,
        "confidence_score": track.confidence
    }
    await self.horse_db.save_horse_to_postgres(horse_data)
    await self.horse_db.save_horse_state_to_redis(stream_id, track.id, horse_data)

logger.info(f"Saved {len(all_tracks)} horses for stream {stream_id}")
```

**Estimated Impact**: +50-100ms per chunk (batch save recommended)

---

### Integration Point 4: Capture Thumbnail During Processing
**Location**: `horse_tracker.py:140` (during track update)

**Required Changes**:
```python
def _update_track(self, track: HorseTrack, detection: Dict, features: np.ndarray,
                  frame: np.ndarray, timestamp: float):
    # ... existing update logic ...

    # ✨ NEW: Capture thumbnail if this is the best frame so far
    bbox_area = detection["bbox"][2] * detection["bbox"][3]
    confidence = detection.get("confidence", 0.5)
    quality_score = bbox_area * confidence

    if quality_score > track.best_thumbnail_quality:
        track.best_thumbnail_quality = quality_score
        track.thumbnail_data = self._extract_thumbnail(frame, detection["bbox"])
```

**Estimated Impact**: +5-10ms per detection (negligible)

---

## Risk Areas

### Risk 1: Race Conditions with Redis
**Description**: Multiple chunks processing simultaneously for same stream could cause race conditions when saving/loading horses.

**Mitigation**:
- Use Redis transactions (MULTI/EXEC) for atomic updates
- Implement optimistic locking with version numbers
- Add retry logic for failed saves

**Severity**: Medium

---

### Risk 2: Feature Vector Mismatch Across Chunks
**Description**: Horse appearance changes (lighting, angle) could cause false negatives in re-identification.

**Mitigation**:
- Use conservative similarity threshold (0.75 instead of 0.7)
- Store multiple feature vectors per horse (first appearance + recent averages)
- Implement manual "merge horses" feature in UI

**Severity**: Medium

---

### Risk 3: Memory Overhead with Large Horse Registries
**Description**: Streams with 100+ unique horses could slow down matching and increase memory usage.

**Mitigation**:
- Limit active Redis cache to 50 most recent horses per stream
- Use FAISS index for fast similarity search (already implemented)
- Lazy-load horses from PostgreSQL only when needed

**Severity**: Low

---

### Risk 4: Thumbnail Storage Overhead
**Description**: Storing thumbnails for every horse could increase database size significantly.

**Mitigation**:
- Compress thumbnails to 200x200 JPEG at 80% quality (<50KB per horse)
- Enforce 100KB hard limit via database constraint (already implemented ✅)
- Implement thumbnail cleanup for inactive horses (>90 days)

**Severity**: Low

---

## Implementation Checklist for Phase 1

### Backend - ML Service
- [ ] Add `stream_id` parameter to `HorseTracker.__init__`
- [ ] Implement `HorseTracker.initialize_with_known_horses(known_horses: Dict)`
- [ ] Add `HorseTrack.thumbnail_data` and `best_thumbnail_quality` fields
- [ ] Implement `_extract_thumbnail(frame, bbox)` method
- [ ] Update `processor.py` to load horses before chunk processing
- [ ] Update `processor.py` to save horses after chunk processing
- [ ] Implement `horse_database.save_horse_to_postgres(horse_data)`

### Backend - Database Service
- [ ] Migration 004 already applied ✅
- [ ] Verify `avatar_thumbnail` column accepts BYTEA
- [ ] Verify `stream_id` index exists for fast queries

### Testing
- [ ] Unit test: Load 20 known horses, verify tracker initializes correctly
- [ ] Integration test: Process 2 chunks with same horse, verify same tracking_id
- [ ] Integration test: Verify thumbnail captured and saved correctly
- [ ] Performance test: Load 50 horses, verify <100ms overhead

---

## Performance Estimates

| Operation | Current | With Phase 3 | Overhead |
|-----------|---------|--------------|----------|
| Chunk startup | 100ms | 150-200ms | +50-100ms |
| Tracker init | 50ms | 70ms | +20ms |
| Horse matching | 5ms | 5ms | 0ms (FAISS) |
| Thumbnail capture | N/A | 5-10ms | +5-10ms |
| Chunk complete | 200ms | 250-300ms | +50-100ms |
| **Total per chunk** | **~10s** | **~10.2s** | **+2%** |

**Conclusion**: Phase 3 integration adds minimal overhead (<2%) to chunk processing.

---

## Next Steps

1. **Phase 1 Task 1.1**: Implement database persistence methods
2. **Phase 1 Task 1.4**: Integrate ML service with stream horse registry (this document's integration points)
3. **Phase 2**: Build frontend UI for horse management
4. **Phase 3**: Add real-time WebSocket updates

---

## References

- HorseTracker source: `backend/ml-service/src/models/horse_tracker.py`
- Processor source: `backend/ml-service/src/services/processor.py`
- Horse database: `backend/ml-service/src/services/horse_database.py`
- Migration 004: `backend/database/src/migrations/sql/004_add_horse_avatars.sql`
- Phase 3 Overview: `docs/Phase 3 - Stream Horse Registry/stream-horse-registry-overview.md`
