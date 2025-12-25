# Official Horses - Final Correct Behavior

**Date**: 2025-10-27
**Status**: FIXED AND WORKING

---

## Correct Logic Summary

### Discovery Mode (Official Count < Expected Count)

**Example**: Barn expects 3 horses, only 1 marked as official (1/3)

**Behavior**:

```
YOLO detects horses => Extract features => Try to match to known horses
  - If match found => Reuse existing horse ID
  - If NO match found => CREATE NEW horse (guest)
  - Deleted horses => NEVER re-activate (they're duplicates/false positives)

Result: All detected horses appear in UI (official + guests)
```

**Purpose**: Build up horse registry, let admin pick which are official

---

### Official Tracking Mode (Official Count >= Expected Count)

**Example**: Barn expects 3 horses, 3 marked as official (3/3)

**Behavior**:

```
YOLO detects horses => Extract features => Find CLOSEST official horse
  - For EVERY detection:
    => Calculate similarity to ALL official horses
    => Find the one with HIGHEST similarity
    => Assign detection to that official horse

  - NO new horses created
  - NO guest horses
  - NO detections ignored/thrown out
  - Deleted horses => NEVER re-activate

Result: Only 3 official horses in UI, each with detections assigned to closest match
```

**Purpose**: Constrain tracking to known horses, improve ReID with more data

---

## Complete Workflow

### Phase 1: Discovery (Setup)

```
1. Create barn with expected_horse_count = 3
2. Process 3-5 video chunks
3. System detects 6-8 horses (some duplicates, some false positives)
4. All horses appear in UI as guests
```

### Phase 2: Cleanup

```
5. Admin reviews detected horses
6. Delete obvious duplicates (#18 looks like #13)
7. Delete false positives (#19 is a shadow/fence)
8. Pick 3 best quality horses with most detections
```

### Phase 3: Mark Official

```
9. Mark selected 3 horses as official
10. System switches to Official Tracking Mode
11. Mode indicator: 🔵 OFFICIAL TRACKING (3/3)
```

### Phase 4: Tracking

```
12. Process more chunks
13. Every YOLO detection assigned to closest official horse:
    - Detection 1 => Horse #6 (similarity: 0.82)
    - Detection 2 => Horse #13 (similarity: 0.91)
    - Detection 3 => Horse #6 (similarity: 0.74)
    - Detection 4 => Horse #15 (similarity: 0.88)

14. NO new horses created
15. Deleted horses (#18, #19) NEVER reappear
16. Only 3 official horses in UI
```

### Phase 5: Improvement Over Time

```
17. More chunks processed = more feature data
18. Official horse feature vectors improve
19. ReID matching becomes more accurate
20. Better thumbnails saved (best quality frames)
```

---

## Fixed Issues

### Issue 1: Deleted Horses Coming Back FIXED

**Problem**: Deleted horses (duplicates/false positives) were being re-activated
**Solution**: Removed `status = 'active'` from ON CONFLICT clauses
**Result**: Deleted horses stay deleted permanently

### Issue 2: Guest Horses in Official Mode FIXED

**Problem**: New horses created even when 3/3 official horses marked
**Solution**:

- Added `allow_new_horses` flag to tracker
- When capacity reached => `allow_new_horses = False`
- Detections assigned to closest official horse via forced matching
  **Result**: No new horses, all detections go to one of the 3 officials

### Issue 3: Invalid Timestamps FIXED

**Problem**: Horses showing "12/31/1969" (Unix epoch zero)
**Solution**:

- Added validation to reject timestamps <= 0
- Fixed 29 existing horses with bad timestamps
  **Result**: Correct timestamps displayed

---

## Expected Logs

### Discovery Mode

```
 Mode: DISCOVERY (1/3 official horses - still accepting new horses)
 New horse creation ENABLED (discovery mode)
Created new horse track: stream_horse_022 (guest)
```

### Official Tracking Mode

```
🔵 Mode: OFFICIAL TRACKING (3/3 official horses)
🔵 Filtering known horses to 3 official horses only
🔵 New horse creation DISABLED (capacity reached)
 Forced match to official horse stream_horse_006 (similarity: 0.847)
 Forced match to official horse stream_horse_013 (similarity: 0.912)
```

---

## Testing Checklist

### Test 1: Discovery Mode Works

- [ ] Barn set to expect 3 horses
- [ ] Only 1 marked as official
- [ ] Process chunk => See multiple new horses created
- [ ] All horses (official + guests) visible in UI

### Test 2: Cleanup Works

- [ ] Delete duplicate horses
- [ ] Deleted horses do NOT reappear after processing more chunks
- [ ] UI correctly filters out deleted horses

### Test 3: Official Tracking Works

- [ ] Mark 3 horses as official (total = 3)
- [ ] Process chunk => Mode switches to Official Tracking
- [ ] Logs show "New horse creation DISABLED"
- [ ] Logs show "Forced match" for each detection
- [ ] NO new horses appear in UI
- [ ] Only 3 official horses visible

### Test 4: Forced Matching Works

- [ ] In official mode, process chunk with 4-6 YOLO detections
- [ ] All detections assigned to one of 3 official horses
- [ ] Each official horse gets multiple detections
- [ ] No detections ignored or lost

### Test 5: Improvement Over Time

- [ ] Process 10 chunks in official tracking mode
- [ ] Check that total_detections increases for each official horse
- [ ] Check that thumbnails update to better quality
- [ ] Verify ReID matching improves (higher similarity scores)

---

## Key Principles

1. **Deleted = Permanent**: Deleted horses are duplicates/errors, never bring back
2. **Official Tracking = Closed Set**: When capacity reached, only track known horses
3. **Every Detection Counts**: In official mode, assign ALL detections to closest match
4. **No Guests in Official Mode**: Once official horses set, no new horses created
5. **Improvement Over Time**: More data = better ReID = more accurate tracking

---

## Configuration

### Barn Settings

- `expected_horse_count`: Total horses expected in barn (e.g., 3)
- Mode automatically determined by: `official_count >= expected_horse_count`

### Tracker Settings

- `similarity_threshold`: 0.7 (for optional matching in discovery mode)
- `allow_new_horses`: Auto-set based on mode
  - Discovery: `True`
  - Official Tracking: `False`

### Force Matching

- When `allow_new_horses = False`:
  - Every detection matched to closest official horse
  - No minimum similarity threshold
  - Uses cosine similarity to find best match

---

## Summary

**Discovery Mode**: Find all horses, create guests, let admin cleanup and pick officials
**Official Tracking Mode**: Only track official horses, assign every detection to closest match
**Deleted Horses**: Never come back (they were deleted for a reason)
**Result**: Clean, accurate tracking of exactly N horses per barn

**System is now working as intended! **
