# Official Mode Logic Fix

**Date**: 2025-10-29
**Commit**: `949bf6f`
**Type**: Breaking Change

## Problem

The system was showing **"discovery mode"** and **"allow new horses"** in the Frame Inspector even when official horses were defined in the barn. This created confusion because:

1. If you've defined official horses in the barn, those ARE all the horses
2. Any detection should be force-matched to the best official horse
3. Guest horses should NOT be created when official horses exist

### Example of the Problem

**Barn Configuration**:

- 3 official horses defined: "brown in-pen", "blackie", "brown behind fence"

**Old Behavior**:

```
Chunk processed with:
  Mode: DISCOVERY   Wrong!
  Allow New Horses: true   Wrong!
  Known Horses: 3

System created: "horse_016" as NEW GUEST   Should force-match to official horses!
```

**What Should Happen**:

```
Chunk processed with:
  Mode: OFFICIAL   Correct!
  Allow New Horses: false   Correct!
  Known Horses: 3 (official only)

System force-matches to: one of the 3 official horses   Correct!
```

## Root Cause

The mode detection logic was:

```python
# OLD LOGIC (WRONG)
if expected_horse_count > 0 and official_count >= expected_horse_count:
    # Official mode: All expected horses have been detected
    allow_new_horses = False
else:
    # Discovery mode: Still waiting for horses to be detected
    allow_new_horses = True
```

**Problem**: This waited until ALL official horses were detected in the stream before switching to official mode.

Example:

- Farm has 3 official horses
- Only 1 has been seen in this stream so far
- System: "1 < 3, so stay in discovery mode"
- Result: Creates new guest horses instead of force-matching

## Solution

Changed the logic to:

```python
# NEW LOGIC (CORRECT)
if official_count > 0:
    # Official mode: We have official horses, only match to them
    allow_new_horses = False
    known_horses = official_horses
else:
    # Discovery mode: No official horses defined
    allow_new_horses = True
```

**Key Change**: If you have ANY official horses defined => official mode (no guests)

## Changes Made

### 1. Mode Detection (`processor.py` lines 787-797)

**Before**:

```python
if expected_horse_count > 0 and official_count >= expected_horse_count:
    logger.info(f"🔵 Mode: OFFICIAL TRACKING ({official_count}/{expected_horse_count} official horses)")
    known_horses = official_horses
elif expected_horse_count > 0 and official_count > 0:
    logger.info(f" Mode: DISCOVERY ({official_count}/{expected_horse_count} official horses - still accepting new horses)")
else:
    logger.info(f" Mode: UNRESTRICTED (no capacity limit)")
```

**After**:

```python
if official_count > 0:
    logger.info(f"🔵 Mode: OFFICIAL TRACKING ({official_count} official horses defined)")
    if expected_horse_count > 0:
        logger.info(f"🔵 Expected capacity: {expected_horse_count} horses")
    logger.info(f"🔵 Filtering known horses to {official_count} official horses only")
    known_horses = official_horses
else:
    logger.info(f" Mode: DISCOVERY (no official horses defined - accepting new horses)")
```

### 2. New Horse Creation (`processor.py` lines 810-817)

**Before**:

```python
allow_new_horses = True
if expected_horse_count > 0 and official_count >= expected_horse_count:
    allow_new_horses = False
    logger.info(f"🔵 New horse creation DISABLED (capacity reached)")
else:
    logger.info(f" New horse creation ENABLED (discovery mode)")
```

**After**:

```python
if official_count > 0:
    allow_new_horses = False
    logger.info(f"🔵 New horse creation DISABLED (official tracking mode)")
else:
    allow_new_horses = True
    logger.info(f" New horse creation ENABLED (discovery mode)")
```

## Impact

### Before the Fix

| Official Horses | Detected | Mode      | Allow New | Behavior      |
| --------------- | -------- | --------- | --------- | ------------- |
| 0               | 0        | DISCOVERY | true      | Create guests |
| 3 (defined)     | 1        | DISCOVERY | true      | Create guests |
| 3 (defined)     | 3        | OFFICIAL  | false     | Force-match   |

### After the Fix

| Official Horses | Detected | Mode      | Allow New | Behavior      |
| --------------- | -------- | --------- | --------- | ------------- |
| 0               | 0        | DISCOVERY | true      | Create guests |
| 3 (defined)     | 1        | OFFICIAL  | false     | Force-match   |
| 3 (defined)     | 3        | OFFICIAL  | false     | Force-match   |

## Frame Inspector Display

### Before

```
ML Settings:
  Model: YOLO11
  Mode: discovery
  Allow New Horses: true

ReID Details:
  Known Horses: 3
```

### After

```
ML Settings:
  Model: YOLO11
  Mode: official
  Allow New Horses: false

ReID Details:
  Known Horses: 3 (official only)
```

## Migration Notes

**Existing Guest Horses**: Guest horses created before this fix will remain in the database. They won't be deleted, but new chunks will no longer create additional guests if official horses are defined.

**How to Clean Up**:

1. Review guest horses in the Detected Horses tab
2. Either:
   - Mark them as official (if they're real horses)
   - Delete them (if they're duplicates/errors)

**No Data Loss**: This change only affects NEW chunk processing. Historical chunks and their data remain unchanged.

## Testing

Wait for a new chunk to be processed and verify:

1.  **Mode shows "official"** in Frame Inspector
2.  **Allow New Horses shows "false"**
3.  **No new guest horses created**
4.  **Detections force-matched to official horses**

Example log output (new behavior):

```
🔵 Mode: OFFICIAL TRACKING (3 official horses defined)
🔵 Filtering known horses to 3 official horses only
🔵 New horse creation DISABLED (official tracking mode)
 Forced match to official horse brown_in_pen (similarity: 0.65)
```

## Rollback

If needed, revert commit `949bf6f` and rebuild:

```bash
git revert 949bf6f
docker compose up -d --build ml-service
```

---

**Result**: Frame Inspector now accurately reflects the system mode. If you have official horses defined, the system will ONLY match to them, not create new guests.
