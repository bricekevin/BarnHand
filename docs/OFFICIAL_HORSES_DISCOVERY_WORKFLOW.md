# Official Horses: Discovery-to-Tracking Workflow Proposal

**Date**: 2025-10-26
**Status**: Proposal for Review

## Executive Summary

This document proposes a comprehensive workflow for transitioning from **discovery mode** (finding all horses) to **constrained tracking mode** (only tracking official horses). The system will use a two-phase approach:

1. **Discovery Phase**: Run detection freely, identify all horses seen in the barn
2. **Tracking Phase**: Once official horses are designated, constrain ReID to only match against official horses

This approach solves the problem of over-detection by using the initial discovery period as a "seed" pool from which admins can select official horses.

---

## Problem Statement

### Current Behavior
- System detects all horses in frame indiscriminately
- After official horses are marked (e.g., 5 horses), system may still detect additional horses
- No mechanism to constrain detection/tracking to ONLY the official horses once they're identified
- Results in "ghost" horses or duplicate detections beyond barn capacity

### Desired Behavior
- **Phase 1 (Discovery)**: Detect all horses freely for initial barn setup
- **Phase 2 (Tracking)**: After `expected_horse_count` horses are marked as official:
  - Only match detections against the official horse pool
  - Stop creating new horse IDs
  - Ignore detections that don't match official horses (likely false positives or artifacts)
  - Provide clear UI indication of which mode the system is in

---

## Proposed Solution: Two-Phase Detection System

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         BARN CONFIGURATION                        │
│  • expected_horse_count: 5                                        │
│  • official_horses: [] (initially empty)                         │
│  • detection_mode: "discovery" (initially)                       │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────────┐
            │    YOLO Detection Layer     │
            │  (Always runs on frames)    │
            └─────────────┬───────────────┘
                          │
                          ▼
            ┌─────────────────────────────┐
            │  Feature Extraction Layer   │
            │  (Extract 512-dim vectors)  │
            └─────────────┬───────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │      MODE DECISION POINT             │
        │                                      │
        │  if mode == "discovery":             │
        │    => Discovery ReID Logic            │
        │  else if mode == "tracking":         │
        │    => Constrained ReID Logic          │
        └─────────┬───────────────┬────────────┘
                  │               │
        ┌─────────▼─────┐   ┌────▼──────────────┐
        │  DISCOVERY     │   │   CONSTRAINED     │
        │  REID MODE     │   │   REID MODE       │
        └────────────────┘   └───────────────────┘
```

---

## Phase 1: Discovery Mode

### When Active
- **Initial State**: Barn has `expected_horse_count > 0` but fewer official horses marked
- **Condition**: `count(official_horses) < expected_horse_count`
- **Duration**: Until admin marks exactly `expected_horse_count` horses as official

### Detection Logic

```python
# In ML Service: processor.py
async def process_chunk(chunk_path, chunk_metadata):
    stream_id = chunk_metadata.get("stream_id")
    farm_id = await get_farm_id_for_stream(stream_id)

    # Load barn configuration
    barn_config = await load_barn_config(farm_id)
    expected_count = barn_config.get("expected_horse_count", 0)

    # Load horses from barn
    known_horses = await load_barn_horse_registry(stream_id, farm_id)
    official_horses = {h_id: h for h_id, h in known_horses.items() if h.get("is_official")}

    # Determine detection mode
    if expected_count == 0:
        mode = "unrestricted"  # No capacity limit
    elif len(official_horses) < expected_count:
        mode = "discovery"
    else:
        mode = "tracking"

    logger.info(f" Detection mode: {mode} (official: {len(official_horses)}/{expected_count})")

    # Process frames with mode-aware ReID
    for frame in video_frames:
        detections = yolo_detect(frame)
        tracked_horses = horse_tracker.update_tracks(
            detections,
            frame,
            timestamp,
            mode=mode,
            official_pool=official_horses if mode == "tracking" else None
        )
```

### ReID Behavior (Discovery Mode)

**Goal**: Build the complete horse registry for the barn

1. **YOLO detects horses** => Extract features for all detections
2. **Match against ALL known horses** (official + guests) in barn
3. **If no match (similarity < 0.7)**:
   - Create new horse ID (e.g., `horse_007`)
   - Assign new color from palette
   - Save to database with `is_official = FALSE`
4. **If match found**:
   - Update existing horse record
   - Reuse tracking ID and color

**Result**: System naturally discovers 6-8 horses (some may be duplicates/false positives)

### UI During Discovery Phase

#### Detected Horses Tab
```
┌──────────────────────────────────────────────────────────┐
│   Discovery Mode (3/5 Official Horses Marked)          │
│                                                          │
│  The system is discovering horses in this barn.          │
│  Mark 2 more horses as official to enter tracking mode.  │
└──────────────────────────────────────────────────────────┘

  Horse Cards (All detected horses shown):
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │ #1         │  │ #2         │  │ #3         │
  │ Official    │  │ Official    │  │ Official    │
  └─────────────┘  └─────────────┘  └─────────────┘

  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │ #4          │  │ #5          │  │ #6          │
  │ Guest       │  │ Guest       │  │ Guest       │
  │ [Mark Offic]│  │ [Mark Offic]│  │ [Mark Offic]│
  └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Phase 2: Tracking Mode (Constrained)

### When Active
- **Condition**: `count(official_horses) >= expected_horse_count`
- **Duration**: Remains active until admin changes barn configuration or unmarked official horses

### Detection Logic

```python
# In horse_tracker.py
def update_tracks(self, detections, frame, timestamp, mode="discovery", official_pool=None):
    """Update tracks with mode-aware ReID"""

    if mode == "tracking" and official_pool:
        # CONSTRAINED MODE: Only match against official horses
        return self._update_tracks_constrained(detections, frame, timestamp, official_pool)
    else:
        # DISCOVERY/UNRESTRICTED MODE: Match against all horses
        return self._update_tracks_discovery(detections, frame, timestamp)

def _update_tracks_constrained(self, detections, frame, timestamp, official_pool):
    """
    Constrained tracking: Only match detections to official horses.
    Ignore detections that don't match any official horse.
    """
    tracked_horses = []

    for detection in detections:
        bbox = detection["bbox"]
        confidence = detection["confidence"]

        # Extract features
        crop = extract_bbox_crop(frame, bbox)
        features = self.reid_model.extract_features(crop)

        # Match ONLY against official horses
        best_match = None
        best_similarity = 0.0

        for official_id, official_horse in official_pool.items():
            official_features = official_horse.get("feature_vector")
            if official_features is None:
                continue

            similarity = cosine_similarity(features, official_features)

            if similarity >= self.similarity_threshold and similarity > best_similarity:
                best_match = official_id
                best_similarity = similarity

        if best_match:
            # Matched to official horse - track it
            logger.debug(f" Matched to official horse {best_match} (sim: {best_similarity:.2f})")
            tracked_horses.append({
                "tracking_id": official_pool[best_match]["tracking_id"],
                "horse_id": best_match,
                "bbox": bbox,
                "confidence": confidence,
                "reid_match_confidence": best_similarity,
                "is_official": True
            })
        else:
            # No match to any official horse - ignore this detection
            logger.debug(f" Detection ignored (no match to official horses, best sim: {best_similarity:.2f})")
            # Do NOT create new horse ID
            # Do NOT save to database
            # This detection is discarded as likely false positive

    return tracked_horses
```

### Key Behavioral Changes

| Aspect | Discovery Mode | Tracking Mode (Constrained) |
|--------|----------------|----------------------------|
| **New detections** | Create new horse IDs | Ignored if no match |
| **ReID pool** | All horses in barn | Only official horses |
| **Similarity threshold** | 0.7 (standard) | 0.7 (standard) |
| **False positives** | May create duplicate horses | Automatically filtered |
| **UI indication** | "Discovery Mode" banner | "Tracking Mode" banner |
| **Guest horses** | Allowed | Not created (filtered) |

### UI During Tracking Phase

#### Detected Horses Tab
```
┌──────────────────────────────────────────────────────────┐
│   Tracking Mode (5/5 Official Horses)                   │
│                                                          │
│  System is tracking only the 5 official barn horses.     │
│  Other detections are automatically filtered.            │
│  [Settings] to adjust barn configuration                 │
└──────────────────────────────────────────────────────────┘

  Horse Cards (Only official horses shown):
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │ #1         │  │ #2         │  │ #3         │
  │ Official    │  │ Official    │  │ Official    │
  │ 142 det.    │  │ 98 det.     │  │ 156 det.    │
  └─────────────┘  └─────────────┘  └─────────────┘

  ┌─────────────┐  ┌─────────────┐
  │ #4         │  │ #5         │
  │ Official    │  │ Official    │
  │ 87 det.     │  │ 201 det.    │
  └─────────────┘  └─────────────┘

  Note: Guest horses #6, #7 are hidden in tracking mode
```

---

## Multi-Stream Barn Integration

### Barn-Scoped Official Horses

The official horses are scoped at the **barn/farm level**, not stream level. This means:

1. **Single Source of Truth**: Official horses list stored in `horses` table with `farm_id`
2. **Cross-Stream Tracking**: Horse detected in `stream_001` can be tracked in `stream_003`
3. **Consistent Coloring**: Same horse always has same color across all streams in barn

### Example Scenario

**Setup**:
- Barn: "Main Barn" (farm_id: `abc-123`)
- Streams: `stream_001`, `stream_003`, `stream_004` (all assigned to Main Barn)
- Expected horses: 5
- Official horses: `horse_001`, `horse_002`, `horse_003`, `horse_004`, `horse_005`

**Workflow**:

1. **Stream 1 processes chunk**:
   - Detects 3 horses
   - Matches to `horse_001`, `horse_002`, `horse_004`
   - Saves detections with correct tracking IDs

2. **Stream 3 processes chunk** (same time window):
   - Detects 2 horses
   - Matches to `horse_002` (moved from stream 1), `horse_005`
   - `horse_002` now shows in Stream 3's detected horses tab

3. **Stream 4 processes chunk**:
   - Detects 4 horses (more than expected!)
   - Attempts to match against official pool
   - Matches 3 horses: `horse_001`, `horse_003`, `horse_005`
   - 1 detection has no match (similarity < 0.7 to all official horses)
   - **Tracking mode**: Ignores the unmatched detection (does not create `horse_006`)

**Result**: System maintains exactly 5 horses across all streams, automatically filtering false positives.

---

## Time-Based Chunk Processing Strategy

### Challenge

Video chunks are processed asynchronously and may arrive out of order:
- Stream 1, Chunk 5 might finish processing before Stream 1, Chunk 4
- Mode transitions need to be **time-aware**, not just "chunk-aware"

### Solution: Timestamp-Based Mode Determination

```python
async def determine_detection_mode(stream_id: str, chunk_timestamp: float) -> str:
    """
    Determine detection mode based on barn state at the time of the chunk.

    This ensures chunks processed out-of-order use correct mode for their timeframe.
    """
    farm_id = await get_farm_id_for_stream(stream_id)
    barn_config = await load_barn_config(farm_id)
    expected_count = barn_config.get("expected_horse_count", 0)

    # Get official horses as of the chunk timestamp
    official_horses = await get_official_horses_at_time(farm_id, chunk_timestamp)

    if expected_count == 0:
        return "unrestricted"
    elif len(official_horses) < expected_count:
        return "discovery"
    else:
        return "tracking"
```

### Database Query for Time-Aware Official Horses

```sql
-- Get official horses as of a specific timestamp
SELECT id, tracking_id, feature_vector, ui_color, metadata
FROM horses
WHERE farm_id = $1
  AND is_official = TRUE
  AND made_official_at <= $2  -- Horse was official at chunk time
ORDER BY made_official_at ASC;
```

### Handling Mode Transitions

**Scenario**: Admin marks 5th official horse at 10:30 AM

| Chunk | Recorded At | Processed At | Mode Used |
|-------|-------------|--------------|-----------|
| Stream 1, Chunk 10 | 10:25 AM | 10:31 AM | Discovery (only 4 official at 10:25) |
| Stream 1, Chunk 11 | 10:35 AM | 10:32 AM | Tracking (5 official at 10:35) |
| Stream 1, Chunk 12 | 10:40 AM | 10:33 AM | Tracking |

**Key Insight**: Mode is determined by `made_official_at` timestamp, NOT processing order.

### Chunk Timestamp Metadata

Ensure chunk metadata includes:
```json
{
  "chunk_id": "chunk_12345",
  "stream_id": "stream_003",
  "start_time": "2025-10-26T10:35:00Z",  // Actual video time
  "end_time": "2025-10-26T10:35:10Z",
  "created_at": "2025-10-26T10:35:12Z",  // When chunk was created
  "processing_started_at": null  // Will be set by ML service
}
```

Use `start_time` (or midpoint between start_time and end_time) to determine barn state for mode calculation.

---

## Edge Cases & Handling

### 1. Unmarking an Official Horse (Dropping Below Capacity)

**Scenario**: Admin accidentally marks wrong horse as official, unmarked it after entering tracking mode

**Current State**:
- 5 official horses marked => Tracking mode active
- Admin unmarked `horse_003` => Now 4 official horses

**Behavior**:
- System immediately reverts to **Discovery mode**
- Future chunks will allow creating new horse IDs again
- Historical chunks (already processed in tracking mode) remain unchanged

**Implementation**:
```python
# On unmark official horse
if new_official_count < expected_horse_count:
    logger.info(f" Barn dropped below capacity ({new_official_count}/{expected_horse_count})")
    logger.info(f" Reverting to discovery mode for future chunks")
```

### 2. Adjusting Expected Horse Count

**Scenario**: Admin realizes barn actually has 6 horses, not 5

**Action**: Edit barn settings, change `expected_horse_count` from 5 to 6

**Behavior**:
- System automatically reverts to **Discovery mode** (now 5/6 official)
- Admin can mark 6th horse from detected horses
- Once 6th horse marked => Re-enter tracking mode

### 3. Guest Horse During Tracking Mode (Actual Visitor)

**Scenario**: Barn has 5 official horses, but a guest horse visits for veterinary exam

**Challenge**: Tracking mode will filter out the guest horse (no match to official pool)

**Solution Options**:

**Option A: Temporary Discovery Mode Override**
- Add UI button: "Enable Guest Detection" (FARM_ADMIN only)
- Temporarily allows creating new horses even in tracking mode
- Admin manually switches back to tracking mode after guest leaves

**Option B: Guest Horse Whitelist**
- Admin can create "temporary guest" horses in UI
- These are added to ReID pool but marked as `is_official = FALSE`, `is_temp_guest = TRUE`
- Admin can remove guest horses when they leave
- Guest horses have limited lifespan (auto-expire after 24 hours of no detection)

**Recommendation**: Implement Option B (Guest Horse Whitelist) for flexibility without compromising automatic filtering.

### 4. Complete Barn Restart (Delete All Horses)

**Scenario**: Admin wants to completely restart barn horse detection

**Action**: Bulk delete all horses for barn, or "Reset Barn" button in settings

**Behavior**:
- All horses deleted (or marked as `status = 'deleted'`)
- System reverts to Discovery mode
- Fresh start for horse detection

### 5. False Positive in Official Horse Pool

**Scenario**: During discovery, system detected 7 horses. Admin marked 5 as official, but one of them was actually a duplicate (false positive)

**Challenge**: Now in tracking mode, that false official horse can still be matched

**Solution**:
- Admin unmarked the false positive official horse
- System reverts to discovery mode (4/5 official)
- Admin deletes the false positive horse entirely
- Admin marks correct 5th horse as official
- System re-enters tracking mode with correct horse pool

---

## Implementation Checklist

### Database Changes

- [x]  Already implemented: `horses.is_official` column
- [x]  Already implemented: `horses.made_official_at` column
- [x]  Already implemented: `horses.made_official_by` column
- [x]  Already implemented: `farms.expected_horse_count` column
- [ ]  Add index: `idx_horses_official_time` on `(farm_id, made_official_at)` for time queries
- [ ]  Add column: `horses.is_temp_guest` BOOLEAN DEFAULT FALSE (for Option B guest handling)

### Backend API Changes

- [x]  Already implemented: `PATCH /horses/:id/official` endpoint
- [x]  Already implemented: Capacity enforcement in mark official
- [ ]  Add endpoint: `GET /farms/:id/detection-mode` - Return current mode (discovery/tracking/unrestricted)
- [ ]  Add endpoint: `GET /farms/:id/official-horses-at-time?timestamp=<iso>` - Get official horses at specific time
- [ ]  Add to barn config API response: `detection_mode`, `official_horse_count`

### ML Service Changes

- [ ]  **processor.py**: Load barn config and determine detection mode per chunk
- [ ]  **processor.py**: Pass `mode` and `official_pool` to `horse_tracker.update_tracks()`
- [ ]  **horse_tracker.py**: Implement `_update_tracks_constrained()` method
- [ ]  **horse_tracker.py**: Modify `_update_tracks_discovery()` to be explicitly named
- [ ]  **horse_database.py**: Add method `get_official_horses_at_time(farm_id, timestamp)`
- [ ]  **horse_database.py**: Add method `get_barn_detection_mode(farm_id, timestamp)`

### Frontend Changes

- [ ]  **DetectedHorses Tab**: Show mode banner (Discovery/Tracking)
- [ ]  **Mode Banner**: Display official horse count progress (e.g., "3/5 official")
- [ ]  **Tracking Mode**: Hide guest horses from display (filter `is_official = FALSE`)
- [ ]  **BarnModal**: Add explanation of detection modes
- [ ]  **Settings**: Add "Enable Guest Detection" toggle for Option A (optional)
- [ ]  **Settings**: Add "Temporary Guest Horses" management for Option B (optional)

---

## Testing Strategy

### Test 1: Discovery to Tracking Transition

**Steps**:
1. Create new barn with `expected_horse_count = 3`
2. Process 5-10 chunks, let system detect 5-6 horses naturally
3. Verify all horses visible in UI, all show "Guest" badge
4. Mark 3 horses as official (one by one)
5. Verify mode changes from Discovery to Tracking after 3rd marked
6. Process 5 more chunks in tracking mode
7. Verify no new horse IDs created
8. Verify only 3 official horses shown in UI

**Expected Result**: System successfully transitions from discovery to tracking, filters future detections

### Test 2: Out-of-Order Chunk Processing

**Steps**:
1. Barn in discovery mode (2/5 official horses)
2. Queue 10 chunks for processing
3. Mark 3 more horses as official while chunks processing
4. Observe which chunks processed before mode transition, which after
5. Verify chunks with `start_time` before transition used discovery mode
6. Verify chunks with `start_time` after transition used tracking mode

**Expected Result**: Mode determined by chunk timestamp, not processing order

### Test 3: Multi-Stream Consistency

**Steps**:
1. Barn with 3 streams, 5 official horses
2. Process chunks from all 3 streams simultaneously
3. Verify same horse tracked across multiple streams with same ID/color
4. Verify detections in one stream don't create duplicate horses in another

**Expected Result**: Barn-scoped official horses work correctly across all streams

### Test 4: Unmark Official Horse (Mode Reversion)

**Steps**:
1. Barn in tracking mode (5/5 official)
2. Unmark 1 official horse (now 4/5)
3. Verify system reverts to discovery mode
4. Process new chunks, verify new horses can be detected again
5. Re-mark horse as official (5/5)
6. Verify system re-enters tracking mode

**Expected Result**: Mode transitions are reversible and dynamic

---

## Migration Path

### Phase 1: Backend Logic (Week 1)
1. Implement mode determination in ML service
2. Implement constrained ReID in horse_tracker
3. Add time-aware official horse queries
4. Test with existing barn data

### Phase 2: Frontend UI (Week 2)
1. Add mode banners
2. Filter guest horses in tracking mode
3. Add mode explanations to barn settings
4. User acceptance testing

### Phase 3: Edge Cases & Polish (Week 3)
1. Implement guest horse whitelist (Option B)
2. Add bulk operations (mark multiple as official)
3. Performance optimization
4. Documentation updates

---

## Open Questions for Discussion

1. **Similarity Threshold in Tracking Mode**: Should we use a different threshold?
   - Option A: Keep 0.7 (same as discovery)
   - Option B: Lower to 0.6 (more lenient matching for official horses)
   - Option C: Make it configurable per barn

2. **Guest Horse Handling Preference**:
   - Option A: Temporary Discovery Mode Override (simple, manual)
   - Option B: Guest Horse Whitelist (complex, automatic expiry)
   - Your preference?

3. **Unmatched Detection Logging**: Should we log/save unmatched detections in tracking mode for debugging?
   - Could help identify if official horses not being matched correctly
   - Or could just add noise to logs

4. **UI: Hide or Gray-Out Guest Horses**: In tracking mode, should guest horses be:
   - Completely hidden (cleaner UI)
   - Grayed out with "Ignored in Tracking Mode" badge (more transparent)

5. **Automatic Mode Suggestion**: Should we notify admin when system has detected enough horses?
   - e.g., "System detected 5 horses. Mark them as official to enable tracking mode?"

---

## Conclusion

This proposal provides a comprehensive solution to the over-detection problem by:

1.  Using discovery phase to seed the official horse pool
2.  Automatically transitioning to constrained tracking once capacity is met
3.  Filtering false positives in tracking mode by only matching against official horses
4.  Supporting multi-stream barns with barn-scoped official horses
5.  Handling out-of-order chunk processing with time-aware mode detection
6.  Providing clear UI feedback about current detection mode

The system is flexible (can revert to discovery if needed), transparent (clear UI indication of mode), and robust (handles edge cases like guest horses and mode transitions).

**Next Steps**: Review proposal, answer open questions, prioritize implementation phases.
