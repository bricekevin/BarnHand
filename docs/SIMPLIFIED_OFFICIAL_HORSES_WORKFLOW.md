# Simplified Official Horses Workflow

**Date**: 2025-10-26
**Status**: Implementation Ready
**Approach**: Match-to-Official-Only (No Guest Horses)

## Core Principle

**Simple Rule**:

- YOLO detects horses in frame
- For each detection, find the closest matching official horse
- If match found => Track it
- If no match => Ignore it (don't create new horse)

**No guest horses. No discovery mode. Just match against official horses.**

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  BARN SETUP (One-Time)                      │
│  1. Admin sets expected_horse_count = 5                     │
│  2. Process first few chunks in "setup mode"                │
│  3. Admin marks 5 detected horses as official               │
│  4. System now only tracks these 5 horses                   │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              CHUNK PROCESSING (Ongoing)                     │
│                                                             │
│  For each 10-second chunk:                                  │
│                                                             │
│  Frame 1 (t=0.0s)                                           │
│    ├─ YOLO detects 3 horses                                 │
│    ├─ Extract features for each detection                   │
│    ├─ Store in chunk-level accumulator                      │
│    └─ Don't match yet (accumulating data)                   │
│                                                             │
│  Frame 2 (t=0.5s)                                           │
│    ├─ YOLO detects 3 horses (same horses, different poses)  │
│    ├─ Extract features                                      │
│    ├─ Add to accumulator                                    │
│    └─ Track across frames (IoU matching)                    │
│                                                             │
│  ... (continue for all frames in chunk)                     │
│                                                             │
│  Frame N (t=10.0s)                                          │
│    ├─ YOLO detects 3 horses                                 │
│    ├─ Extract features                                      │
│    └─ Add to accumulator                                    │
│                                                             │
│  END OF CHUNK PROCESSING:                                   │
│    ├─ For each tracked object in chunk:                     │
│    │   ├─ Aggregate features from all frames                │
│    │   ├─ Pick best quality features                        │
│    │   └─ Match against official horses                     │
│    │                                                         │
│    └─ Save only matched horses to database                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Initial Setup (Discovery)

### Goal

Build the official horse registry for the barn.

### Steps

1. **Admin configures barn**:

   ```
   Barn Settings:
   - Expected Horse Count: 5
   ```

2. **Process 3-5 chunks freely**:
   - Let YOLO detect all horses
   - Create horse IDs for all detections (horse_001, horse_002, etc.)
   - May detect 6-8 horses (some duplicates/false positives)

3. **Admin reviews detected horses**:

   ```
   Detected Horses (8 total):
   ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
   │ #1   │ #2   │ #3   │ #4   │ #5   │ #6   │ #7   │ #8   │
   │ 45det│ 38det│ 41det│ 12det│ 39det│ 8det │ 5det │ 3det │
   └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
   ```

4. **Admin marks 5 as official** (the ones with most detections, best quality):
   - Mark #1, #2, #3, #4, #5 as official
   - Delete #6, #7, #8 (likely duplicates or false positives)

5. **System now in "tracking mode"**:
   - Only tracks the 5 official horses
   - Ignores any detections that don't match

---

## Phase 2: Chunk-Level Feature Aggregation

### Problem

First frame detection might not be the best quality:

- Horse partially occluded
- Horse at bad angle
- Blurry motion
- Poor lighting

### Solution

Accumulate features across all frames in chunk, use the best ones for ReID matching.

### Implementation

```python
# In processor.py

class ChunkProcessor:
    def __init__(self):
        self.chunk_tracks = {}  # Track detections across frames in chunk

    async def process_chunk_with_aggregation(self, chunk_path, chunk_metadata):
        """Process chunk with per-track feature aggregation"""

        stream_id = chunk_metadata.get("stream_id")
        farm_id = await self.horse_db.get_farm_id_for_stream(stream_id)

        # Load ONLY official horses for this barn
        official_horses = await self.horse_db.load_official_horses(farm_id)

        if not official_horses:
            logger.warning(f" No official horses configured for farm {farm_id}")
            logger.warning(f" Process some chunks and mark horses as official to enable tracking")
            # Could either:
            # A) Process in discovery mode (create new horses)
            # B) Skip processing and return empty results
            # For now: process in discovery mode
            return await self.process_chunk_discovery(chunk_path, chunk_metadata)

        logger.info(f" Tracking {len(official_horses)} official horses for barn")

        # Initialize chunk-level tracking
        chunk_tracks = {}  # {track_id: TrackData}
        next_track_id = 1

        # Process frames
        cap = cv2.VideoCapture(chunk_path)
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            timestamp = frame_idx / fps

            # YOLO detection
            detections = await self.yolo_model.detect(frame)

            # Extract features for each detection
            for det in detections:
                bbox = det["bbox"]
                confidence = det["confidence"]

                # Extract horse crop and features
                crop = extract_crop(frame, bbox)
                features = await self.reid_model.extract_features(crop)

                # Keep the crop for thumbnail later
                crop_copy = crop.copy()

                # Calculate quality score for this detection
                quality_score = self._calculate_quality_score(
                    confidence=confidence,
                    bbox=bbox,
                    crop=crop
                )

                # Match to existing tracks in this chunk (IoU-based)
                matched_track_id = self._match_to_chunk_tracks(
                    bbox,
                    chunk_tracks,
                    iou_threshold=0.3
                )

                if matched_track_id:
                    # Add to existing track
                    chunk_tracks[matched_track_id]["frames"].append({
                        "frame_idx": frame_idx,
                        "timestamp": timestamp,
                        "bbox": bbox,
                        "confidence": confidence,
                        "features": features,
                        "quality_score": quality_score,
                        "crop": crop_copy  # For thumbnail
                    })
                else:
                    # Create new track for this chunk
                    chunk_tracks[next_track_id] = {
                        "track_id": next_track_id,
                        "frames": [{
                            "frame_idx": frame_idx,
                            "timestamp": timestamp,
                            "bbox": bbox,
                            "confidence": confidence,
                            "features": features,
                            "quality_score": quality_score,
                            "crop": crop_copy  # For thumbnail
                        }],
                        "official_horse_id": None,  # Will be determined after aggregation
                        "best_quality_frame": None
                    }
                    next_track_id += 1

            frame_idx += 1

        cap.release()

        # END OF CHUNK: Aggregate features and match to official horses
        matched_results = []

        for track_id, track_data in chunk_tracks.items():
            # Get best quality features and thumbnail from this track
            aggregated_features, thumbnail_crop = self._aggregate_track_features(track_data)

            # Match against ONLY official horses (closest match wins)
            best_match = self._match_to_official_horses(
                aggregated_features,
                official_horses,
                noise_threshold=0.3  # Low threshold to filter obvious non-horses
            )

            if best_match:
                # Found official horse match (closest match)
                official_id = best_match["official_id"]
                similarity = best_match["similarity"]

                logger.info(f" Track {track_id} matched to official {official_id} (sim: {similarity:.2f})")

                track_data["official_horse_id"] = official_id
                track_data["similarity"] = similarity
                track_data["thumbnail"] = thumbnail_crop  # Save best frame as thumbnail
                matched_results.append(track_data)
            else:
                # All similarities below 0.3 - likely YOLO error (shadow, tree, etc.)
                logger.debug(f" Track {track_id} rejected as noise (all similarities < 0.3)")
                # Don't save to database
                # Don't add to results

        # Save matched horses to database
        await self._save_chunk_results(matched_results, chunk_metadata)

        return {
            "chunk_id": chunk_metadata["chunk_id"],
            "matched_horses": len(matched_results),
            "ignored_tracks": len(chunk_tracks) - len(matched_results)
        }
```

### Feature Aggregation Strategy

```python
def _aggregate_track_features(self, track_data: Dict) -> Tuple[np.ndarray, np.ndarray]:
    """
    Get best quality frame from track for ReID matching and thumbnail.

    Returns:
        (features, thumbnail_image)
    """

    frames = track_data["frames"]

    # Find frame with highest quality score
    best_frame = max(frames, key=lambda f: f["quality_score"])
    track_data["best_quality_frame"] = best_frame["frame_idx"]

    logger.debug(f"Track {track_data['track_id']}: Using frame {best_frame['frame_idx']} "
                 f"(quality: {best_frame['quality_score']:.2f}) out of {len(frames)} frames")

    # Return features and the cropped image for thumbnail
    return best_frame["features"], best_frame["crop"]

def _calculate_quality_score(self, confidence: float, bbox: Dict, crop: np.ndarray) -> float:
    """
    Calculate quality score for a detection.

    Factors:
    - Detection confidence (YOLO score)
    - Bbox size (larger = better, usually)
    - Crop sharpness (Laplacian variance)
    - Aspect ratio (horses should be ~1.5:1 width:height)
    """

    # Detection confidence (0-1)
    conf_score = confidence

    # Bbox size (normalize by image size)
    bbox_area = bbox["width"] * bbox["height"]
    size_score = min(bbox_area / (1920 * 1080) * 100, 1.0)  # Cap at 1.0

    # Image sharpness (Laplacian variance)
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness_score = min(laplacian_var / 500.0, 1.0)  # Normalize (500 is good sharpness)

    # Aspect ratio (horses ~1.3-1.7 width/height)
    aspect = bbox["width"] / max(bbox["height"], 1)
    ideal_aspect = 1.5
    aspect_score = 1.0 - min(abs(aspect - ideal_aspect) / ideal_aspect, 1.0)

    # Weighted combination
    quality = (
        conf_score * 0.4 +
        size_score * 0.2 +
        sharpness_score * 0.3 +
        aspect_score * 0.1
    )

    return quality

def _match_to_official_horses(
    self,
    features: np.ndarray,
    official_horses: Dict,
    noise_threshold: float = 0.3
) -> Optional[Dict]:
    """
    Match aggregated features to official horses.

    Strategy: Find CLOSEST official horse (highest similarity).
    Only reject if ALL similarities are below noise_threshold (likely not a horse).

    Args:
        features: Feature vector from detection
        official_horses: Dict of official horses
        noise_threshold: Minimum similarity to consider valid (filters YOLO errors)

    Returns:
        Best match (closest official horse) or None if all below noise threshold
    """

    best_match = None
    best_similarity = 0.0

    for official_id, official_data in official_horses.items():
        official_features = official_data.get("feature_vector")
        if official_features is None:
            continue

        # Cosine similarity
        similarity = np.dot(features, official_features) / (
            np.linalg.norm(features) * np.linalg.norm(official_features)
        )

        if similarity > best_similarity:
            best_match = {
                "official_id": official_id,
                "tracking_id": official_data["tracking_id"],
                "similarity": similarity
            }
            best_similarity = similarity

    # Only reject if best match is below noise threshold
    # (likely YOLO detected a shadow/tree/artifact, not a horse)
    if best_match and best_similarity >= noise_threshold:
        return best_match
    else:
        logger.debug(f" Detection rejected as noise (best sim: {best_similarity:.2f} < {noise_threshold})")
        return None
```

---

## Multi-Stream Handling

### Barn-Scoped Official Horses

Official horses are shared across all streams in the barn:

```python
async def load_official_horses(self, farm_id: str) -> Dict[str, Dict]:
    """
    Load ONLY official horses for this barn/farm.

    Returns: {horse_id: {tracking_id, feature_vector, color, ...}}
    """

    # Query PostgreSQL
    query = """
        SELECT id, tracking_id, feature_vector, ui_color,
               name, metadata, last_seen
        FROM horses
        WHERE farm_id = $1
          AND is_official = TRUE
          AND status = 'active'
        ORDER BY made_official_at ASC
    """

    result = await self.pool.fetch(query, farm_id)

    official_horses = {}
    for row in result:
        horse_id = str(row["id"])
        official_horses[horse_id] = {
            "tracking_id": row["tracking_id"],
            "feature_vector": np.array(row["feature_vector"]),
            "color": row["ui_color"],
            "name": row["name"],
            "metadata": row["metadata"],
            "last_seen": row["last_seen"]
        }

    logger.info(f" Loaded {len(official_horses)} official horses for farm {farm_id}")

    return official_horses
```

### Cross-Stream Consistency

**Example**:

- Stream 1 detects Horse A => Matches to official horse_002
- Stream 3 detects Horse A (same physical horse) => Also matches to horse_002
- Both streams use same tracking ID, same color
- Horse appears in whichever stream it was most recently detected

---

## Time-Based Chunk Processing

### Challenge

Chunks may be processed out of order.

### Solution

Use chunk timestamp to determine which official horses were available at that time:

```python
async def load_official_horses_at_time(
    self,
    farm_id: str,
    chunk_timestamp: datetime
) -> Dict[str, Dict]:
    """
    Load official horses that were marked as official BEFORE the chunk timestamp.

    This ensures chunks processed out-of-order use correct official horse pool.
    """

    query = """
        SELECT id, tracking_id, feature_vector, ui_color, name, metadata
        FROM horses
        WHERE farm_id = $1
          AND is_official = TRUE
          AND status = 'active'
          AND made_official_at <= $2
        ORDER BY made_official_at ASC
    """

    result = await self.pool.fetch(query, farm_id, chunk_timestamp)

    # ... same as load_official_horses()
```

Use chunk's `start_time` or midpoint to query:

```python
chunk_timestamp = datetime.fromisoformat(chunk_metadata["start_time"])
official_horses = await self.horse_db.load_official_horses_at_time(
    farm_id,
    chunk_timestamp
)
```

---

## Saving Chunk Thumbnails

### Strategy

Save the best frame from each chunk as a thumbnail for that horse appearance.

### Implementation

```python
async def save_chunk_thumbnail(
    self,
    horse_id: str,
    chunk_id: str,
    thumbnail_crop: np.ndarray,
    quality_score: float,
    timestamp: datetime
):
    """
    Save best quality frame from this chunk as a thumbnail.

    Each chunk gets one thumbnail per detected horse.
    Stored in: /data/thumbnails/{horse_id}/{chunk_id}.jpg
    """

    # Create thumbnail directory
    thumbnail_dir = Path(f"/data/thumbnails/{horse_id}")
    thumbnail_dir.mkdir(parents=True, exist_ok=True)

    # Save as JPEG (compressed)
    thumbnail_path = thumbnail_dir / f"{chunk_id}.jpg"
    cv2.imwrite(str(thumbnail_path), thumbnail_crop, [cv2.IMWRITE_JPEG_QUALITY, 85])

    # Update database with thumbnail reference
    await self.pool.execute("""
        INSERT INTO horse_thumbnails (horse_id, chunk_id, thumbnail_path, quality_score, timestamp)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (horse_id, chunk_id) DO UPDATE
        SET thumbnail_path = EXCLUDED.thumbnail_path,
            quality_score = EXCLUDED.quality_score,
            timestamp = EXCLUDED.timestamp
    """, horse_id, chunk_id, str(thumbnail_path), quality_score, timestamp)

    logger.debug(f"Saved thumbnail for horse {horse_id} chunk {chunk_id} (quality: {quality_score:.2f})")

    # Also update horse's main avatar if this is better quality
    current_avatar_quality = await self.get_horse_avatar_quality(horse_id)
    if quality_score > current_avatar_quality:
        # Encode as base64 for avatar_thumbnail column
        _, buffer = cv2.imencode('.jpg', thumbnail_crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
        avatar_base64 = base64.b64encode(buffer).decode('utf-8')

        await self.pool.execute("""
            UPDATE horses
            SET avatar_thumbnail = $1,
                metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{avatar_quality}',
                    to_jsonb($2::float)
                )
            WHERE id = $3
        """, avatar_base64, quality_score, horse_id)

        logger.info(f"Updated horse {horse_id} avatar (new quality: {quality_score:.2f})")
```

Call this after successful match:

```python
if best_match:
    official_id = best_match["official_id"]
    thumbnail_crop = track_data["thumbnail"]
    quality_score = track_data["frames"][track_data["best_quality_frame"]]["quality_score"]

    # Save this chunk's best frame as a thumbnail
    await self.horse_db.save_chunk_thumbnail(
        official_id,
        chunk_metadata["chunk_id"],
        thumbnail_crop,
        quality_score,
        chunk_timestamp
    )
```

### Schema Addition

```sql
-- Add table for per-chunk thumbnails (optional - can also just save files)
CREATE TABLE IF NOT EXISTS horse_thumbnails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    horse_id UUID REFERENCES horses(id) ON DELETE CASCADE,
    chunk_id VARCHAR(100) NOT NULL,
    thumbnail_path TEXT NOT NULL,
    quality_score FLOAT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(horse_id, chunk_id)
);

CREATE INDEX idx_horse_thumbnails_horse ON horse_thumbnails(horse_id, timestamp DESC);
```

---

## Implementation Steps

### 1. Backend Changes

**File**: `backend/ml-service/src/services/horse_database.py`

```python
# Add new method
async def load_official_horses(self, farm_id: str) -> Dict[str, Dict]:
    """Load ONLY official horses for barn"""
    # Implementation above

async def load_official_horses_at_time(self, farm_id: str, timestamp: datetime) -> Dict:
    """Load official horses as of specific timestamp"""
    # Implementation above

async def update_official_horse_features(self, horse_id, features, quality, timestamp):
    """Update official horse feature vector"""
    # Implementation above
```

**File**: `backend/ml-service/src/services/processor.py`

```python
# Modify process_chunk to use aggregation
async def process_chunk(self, chunk_path, chunk_metadata):
    # Check if barn has official horses
    official_horses = await self.horse_db.load_official_horses(farm_id)

    if official_horses:
        # Use official-only tracking
        return await self.process_chunk_with_official_tracking(
            chunk_path, chunk_metadata, official_horses
        )
    else:
        # Use discovery mode (create new horses)
        return await self.process_chunk_discovery(
            chunk_path, chunk_metadata
        )
```

### 2. Database Queries

Already have the schema! Just need new queries:

```sql
-- Get official horses for barn
SELECT id, tracking_id, feature_vector, ui_color, name, metadata
FROM horses
WHERE farm_id = $1
  AND is_official = TRUE
  AND status = 'active';

-- Get official horses at specific time
SELECT id, tracking_id, feature_vector, ui_color, name, metadata
FROM horses
WHERE farm_id = $1
  AND is_official = TRUE
  AND status = 'active'
  AND made_official_at <= $2;
```

### 3. Frontend Changes

**Minimal**: Just add status indicator

```tsx
// In DetectedHorses component
const DetectedHorses = ({ stream }) => {
  const { horses, barn } = useHorseData(stream.id);

  const officialCount = horses.filter(h => h.is_official).length;
  const expectedCount = barn.expected_horse_count;

  return (
    <div>
      {expectedCount > 0 && (
        <div className="mb-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          {officialCount >= expectedCount ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="text-emerald-400" size={20} />
              <span>Tracking {officialCount} official horses</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertCircle className="text-amber-400" size={20} />
              <span>
                Setup: Mark {expectedCount - officialCount} more horses as
                official
              </span>
            </div>
          )}
        </div>
      )}

      {/* Horse cards */}
      {horses.map(horse => (
        <HorseCard key={horse.id} horse={horse} />
      ))}
    </div>
  );
};
```

---

## Testing Plan

### Test 1: Initial Setup

1. Create barn with `expected_horse_count = 5`
2. Process 3 chunks (no official horses yet)
3. Verify system detects 5-8 horses
4. Mark 5 as official
5. Delete any extras

### Test 2: Official-Only Tracking

1. With 5 official horses marked
2. Process 10 new chunks
3. Verify:
   - Only 5 horses tracked
   - No new horse IDs created
   - Detections without matches are ignored

### Test 3: Feature Aggregation

1. Process chunk with horse appearing in 200 frames
2. Check logs for quality scores per frame
3. Verify best quality frame is selected
4. Verify official horse features updated

### Test 4: Multi-Stream

1. Barn with 3 streams, 5 official horses
2. Process chunks from all streams
3. Verify same horse gets same ID across streams

### Test 5: Out-of-Order Processing

1. Mark horses as official at 10:30 AM
2. Process chunks from 10:25 AM (before marking)
3. Process chunks from 10:35 AM (after marking)
4. Verify 10:25 chunks used discovery, 10:35 used official-only

---

## Summary

### What Changes

1. **Chunk processing**: Accumulate features across all frames
2. **Feature selection**: Use best quality frame from chunk, not first frame
3. **Matching logic**:
   - Find CLOSEST official horse (highest similarity)
   - Only reject if ALL similarities < 0.3 (noise/YOLO error filter)
   - No hard 0.7 threshold - every valid detection gets assigned to closest official horse
4. **Thumbnail strategy**: Save best frame from each chunk (not top 10 history)
5. **No guest horses**: Simplifies logic significantly

### What Stays the Same

- Barn-scoped ReID (already implemented)
- Official horse marking UI (already implemented)
- Multi-stream support (already implemented)

### Benefits

- Stops over-detection automatically
- Improves ReID accuracy (best quality features per chunk)
- Simple logic (no mode transitions, no guest handling)
- Better matching (closest official horse, not hard threshold)
- Filters noise (similarity < 0.3 rejected as YOLO errors)
- Useful thumbnails (one per chunk showing best shot)
- Works with existing infrastructure

**Ready to implement!**
