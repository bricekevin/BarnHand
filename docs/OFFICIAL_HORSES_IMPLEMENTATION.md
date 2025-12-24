# Official Horses System - Implementation Guide

**Date**: 2025-10-20
**Status**:  Implemented, Ready for Testing

## Overview

This feature implements a barn capacity-based horse management system to prevent over-detection and enable designation of "official" barn horses vs. "guest" horses. The system uses the expected number of horses in a barn as a cap for Re-ID matching, while still allowing detection of unexpected guests.

## Problem Statement

### Original Issue
- On stream 4, after processing a couple chunks, system detected more horses than physically exist in the barn
- No way to define expected barn capacity
- No way to mark detected horses as "official" barn horses
- No distinction between regular barn horses and temporary/guest horses

### Solution
1. **Barn Capacity Management**: Define expected number of horses per barn
2. **Official Horse Designation**: Mark specific detected horses as "official"
3. **Re-ID Preference**: ML service prioritizes matching against official horses
4. **Guest Horse Handling**: System can still detect unexpected horses, but clearly identifies them as "guests"
5. **Visual Indicators**: UI shows official vs guest status with badges

## Database Changes

### Migration 006: `006_official_horses_system.sql`

#### Farms Table
```sql
ALTER TABLE farms ADD COLUMN expected_horse_count INTEGER DEFAULT 0
  CHECK (expected_horse_count >= 0);
```
- **Purpose**: Define the expected number of horses in each barn
- **Default**: 0 (no limit)
- **Constraint**: Must be non-negative

#### Horses Table
```sql
ALTER TABLE horses ADD COLUMN is_official BOOLEAN DEFAULT FALSE;
ALTER TABLE horses ADD COLUMN made_official_at TIMESTAMPTZ;
ALTER TABLE horses ADD COLUMN made_official_by UUID REFERENCES users(id);
```
- **is_official**: Boolean flag marking horse as official barn horse
- **made_official_at**: Timestamp when horse was designated as official
- **made_official_by**: User who designated the horse as official (audit trail)

#### New Indexes
```sql
CREATE INDEX idx_horses_official ON horses(farm_id, is_official) WHERE is_official = TRUE;
CREATE INDEX idx_horses_guest ON horses(farm_id, is_official, last_seen DESC) WHERE is_official = FALSE;
```

#### Updated find_similar_horses Function
The PostgreSQL function now:
1. Accepts `query_farm_id` parameter (mandatory for barn scoping)
2. **Prioritizes official horses** in results (ORDER BY is_official DESC)
3. Then sorts by similarity within each group

```sql
CREATE OR REPLACE FUNCTION find_similar_horses(
    query_vector VECTOR(512),
    query_farm_id UUID,
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    horse_id UUID,
    similarity FLOAT,
    name VARCHAR(255),
    last_seen TIMESTAMPTZ,
    is_official BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.id,
        1 - (h.feature_vector <=> query_vector) AS similarity,
        h.name,
        h.last_seen,
        h.is_official
    FROM horses h
    WHERE h.feature_vector IS NOT NULL
        AND h.farm_id = query_farm_id
        AND 1 - (h.feature_vector <=> query_vector) >= similarity_threshold
    ORDER BY
        h.is_official DESC,  -- Official horses first
        h.feature_vector <=> query_vector  -- Then by similarity
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
```

## Backend API Changes

### New Endpoint: Mark/Unmark Horse as Official

**Route**: `PATCH /api/v1/horses/:id/official`
**Auth**: FARM_ADMIN or SUPER_ADMIN
**Body**:
```json
{
  "is_official": true
}
```

**Features**:
1. **Capacity Enforcement**:
   - When marking a horse as official, checks if barn has reached capacity
   - Returns 400 error if `official_horse_count >= expected_horse_count`
   - Error includes helpful message with current/max counts

2. **Audit Trail**:
   - Sets `made_official_at` to current timestamp
   - Sets `made_official_by` to authenticated user ID

3. **Response**:
```json
{
  "message": "Horse marked as official",
  "horse": { /* updated horse object */ }
}
```

**Error Response** (capacity reached):
```json
{
  "error": "Barn capacity reached",
  "message": "This barn is configured for 5 horses and already has 5 official horses. Increase the expected horse count in barn settings or unmark another horse first.",
  "current_count": 5,
  "max_count": 5
}
```

### Updated Repository Methods

#### HorseRepository
- `countOfficialHorses(farmId: string): Promise<number>`
  - Counts official horses for capacity checks
- `update()` - Now accepts `is_official`, `made_official_at`, `made_official_by` fields
- `mapRowToHorse()` - Maps new official fields from database

#### FarmRepository
- `create()` - Now accepts `expected_horse_count` parameter
- `update()` - Now allows updating `expected_horse_count`
- `mapRowToFarm()` - Maps `expected_horse_count` from database

## Frontend Changes

### 1. Barn Management Modal (`BarnModal.tsx`)

**New Field**: "Expected Number of Horses"
- Type: Number input (0-999)
- Location: Between Barn Name and Timezone
- Help text: "Sets the capacity for Re-ID matching. Used to prevent over-detection by limiting unique horses to this number."

### 2. Horse Actions Modal (`HorseActionsModal.tsx`)

**New Feature**: Official Horse Toggle
- Location: First item in actions section (before Settings button)
- Style: Toggle switch with status badge
- States:
  - **Official**: Green toggle with checkmark badge
  - **Guest**: Gray toggle, option to mark as official

**Features**:
- Real-time toggle (PATCH request to API)
- Shows current status with badge and description
- Error handling for capacity limits
- Loading state during update

**UI**:
```
┌─────────────────────────────────────────┐
│  Official Horse              [Toggle]   │
│   Official                              │
│                                          │
│  This horse is confirmed as one of the   │
│  barn's official horses                  │
└─────────────────────────────────────────┘
```

### 3. Horse Card (`HorseCard.tsx`)

**New Visual Indicators**: Badges next to tracking number

**Official Horse**:
- Green checkmark badge ()
- `bg-emerald-500/20 text-emerald-400 border-emerald-500/50`
- Tooltip: "Official barn horse"

**Guest Horse**:
- Amber "Guest" badge
- `bg-amber-500/20 text-amber-400 border-amber-500/50`
- Tooltip: "Guest horse (not an official barn horse)"

**Layout**:
```
┌─────────────────────────────────────┐
│ #3    OR   #7 Guest     42 det.   │ <- Badges
│                                     │
│ [Horse Avatar]                      │
│                                     │
└─────────────────────────────────────┘
```

## ML Service Changes

### Re-ID Prioritization

The `find_similar_horses()` function now returns results ordered by:
1. **Official horses first** (is_official = TRUE)
2. **Then by similarity** (highest similarity within each group)

**Example Scenario**:
- Barn has 5 horses: 3 official, 2 guests
- New detection arrives with feature vector
- Similarity search returns:
  1. Official Horse #1 (similarity: 0.85)
  2. Official Horse #2 (similarity: 0.78)
  3. Official Horse #3 (similarity: 0.72)
  4. Guest Horse #4 (similarity: 0.88) <- Higher similarity, but lower priority!
  5. Guest Horse #5 (similarity: 0.71)

This ensures official horses are matched first, reducing false positives from guests.

## Workflow

### Setting Up a Barn

1. **Admin creates/edits barn** via Settings => Stream & Barn Management
2. **Set expected horse count** (e.g., 5 horses)
3. Barn is now configured for capacity-based Re-ID

### Designating Official Horses

**Method 1**: Via Actions Modal
1. User views detected horses in stream
2. Clicks on a horse card => Opens Actions Modal
3. Toggles "Official Horse" switch to ON
4. System validates against barn capacity
5. Horse is marked as official (visible via checkmark badge)

**Method 2**: First Detection Period
1. Let system detect horses naturally over first few chunks
2. System may detect more than expected (e.g., 7 horses instead of 5)
3. Admin reviews horses and marks the 5 correct ones as official
4. Deletes the 2 duplicate/false detections
5. Future detections will prioritize matching against these 5 official horses

### Guest Horse Handling

**Scenario**: Unexpected horse arrives at barn
1. System detects new horse in frame
2. Attempts to match against official horses (similarity < 0.7)
3. No match found => Creates new horse record with `is_official = FALSE`
4. Horse card displays "Guest" badge
5. Admin can:
   - Mark as official (if it's actually a new barn horse)
   - Leave as guest (temporary visitor)
   - Delete if false detection

## Testing Instructions

### 1. Run Migration

```bash
# Apply new migration
docker compose exec -T postgres psql -U admin -d barnhand -f /docker-entrypoint-initdb.d/006_official_horses_system.sql

# Verify columns exist
docker compose exec -T postgres psql -U admin -d barnhand -c "
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'farms' AND column_name = 'expected_horse_count';
"

docker compose exec -T postgres psql -U admin -d barnhand -c "
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'horses' AND column_name IN ('is_official', 'made_official_at', 'made_official_by');
"
```

### 2. Restart Services

```bash
# Rebuild and restart affected services
docker compose up -d --build api-gateway frontend

# Check logs
docker compose logs -f api-gateway | grep official
docker compose logs -f ml-service | grep official
```

### 3. Frontend Testing

#### A. Set Barn Capacity
1. Navigate to Settings => Stream & Barn Management
2. Click "Edit Barn" on your test barn
3. Set "Expected Number of Horses" to 5
4. Click "Update Barn"
5. **Verify**: Modal closes, barn info updates

#### B. Process Video Chunks
1. Navigate to a stream (e.g., stream_004)
2. Let ML service process 2-3 chunks
3. View "Detected Horses" tab
4. **Verify**: Horses appear with no official status initially

#### C. Mark Horses as Official
1. Click on a horse card
2. Actions modal opens
3. Toggle "Official Horse" to ON
4. **Verify**:
   - Toggle turns green
   - "Official" badge appears
   - Close modal
   - Horse card now shows green checkmark ()

5. Repeat for 4 more horses (total 5 official)
6. Try to mark a 6th horse as official
7. **Verify**:
   - Error message appears: "Barn capacity reached"
   - Shows current/max counts
   - Toggle stays OFF

#### D. Guest Horse Behavior
1. If system detected >5 horses, remaining ones show "Guest" badge
2. Click guest horse card => No checkmark, shows "Guest" indicator
3. **Verify**: Visual distinction is clear

### 4. API Testing

```bash
# Get auth token
TOKEN=$(curl -s http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  | jq -r '.token')

# Get horses for a stream
STREAM_ID="stream_004"
curl -s "http://localhost:8000/api/v1/streams/${STREAM_ID}/horses" \
  -H "Authorization: Bearer $TOKEN" | jq '.horses[] | {id, tracking_id, is_official}'

# Mark horse as official
HORSE_ID="<uuid-from-above>"
curl -X PATCH "http://localhost:8000/api/v1/horses/${HORSE_ID}/official" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_official": true}' | jq '.'

# Verify capacity enforcement (mark 6th horse when limit is 5)
curl -X PATCH "http://localhost:8000/api/v1/horses/<another-horse-id>/official" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_official": true}' | jq '.'
# Expected: 400 error with "Barn capacity reached" message
```

### 5. Database Verification

```bash
# Check official horse counts per farm
docker compose exec -T postgres psql -U admin -d barnhand -c "
SELECT
  f.name as barn_name,
  f.expected_horse_count,
  COUNT(h.id) FILTER (WHERE h.is_official = TRUE) as official_count,
  COUNT(h.id) FILTER (WHERE h.is_official = FALSE) as guest_count
FROM farms f
LEFT JOIN horses h ON h.farm_id = f.id
GROUP BY f.id, f.name, f.expected_horse_count;
"

# View farm_horse_allocation view (created by migration)
docker compose exec -T postgres psql -U admin -d barnhand -c "SELECT * FROM farm_horse_allocation;"
```

## Edge Cases Handled

### 1. Capacity Enforcement
-  Cannot mark more horses as official than barn capacity
-  Helpful error message guides user to increase capacity or unmark another horse
-  Unmarking official horses frees up capacity

### 2. Guest Horse Detection
-  System can still detect horses beyond capacity
-  These are automatically marked as `is_official = FALSE`
-  Clear visual distinction in UI

### 3. Re-ID Priority
-  Official horses always checked first during Re-ID
-  Reduces false positives from duplicate detections
-  Guest horses still available for matching if no official match found

### 4. Barn with No Capacity Set
-  `expected_horse_count = 0` means no limit
-  All horses can be marked as official
-  System behaves as before (backward compatible)

### 5. Audit Trail
-  `made_official_by` tracks which user designated the horse
-  `made_official_at` tracks when designation happened
-  Supports future compliance/reporting needs

## Future Enhancements

### Short Term
1. **Bulk Operations**: Mark multiple horses as official at once
2. **Auto-Suggest**: After detecting N horses matching capacity, prompt to mark them as official
3. **Conflict Resolution**: UI workflow for merging duplicate horses

### Long Term
1. **Machine Learning**: Train model to auto-detect likely duplicates
2. **Analytics**: Report on guest horse frequency/patterns
3. **Notifications**: Alert when unexpected guest horses appear
4. **Photo Gallery**: Require photo confirmation before marking as official

## Files Modified

### Database
- `backend/database/src/migrations/sql/006_official_horses_system.sql` - Migration script
- `backend/database/src/types.ts` - Added `expected_horse_count` to Farm, `is_official`/etc to Horse
- `backend/database/src/repositories/FarmRepository.ts` - Handle new farm fields
- `backend/database/src/repositories/HorseRepository.ts` - Handle new horse fields, add `countOfficialHorses()`

### Backend API
- `backend/api-gateway/src/routes/horses.ts` - New `PATCH /horses/:id/official` endpoint

### Frontend
- `frontend/src/components/BarnModal.tsx` - Add expected horse count field
- `frontend/src/components/HorseActionsModal.tsx` - Add official horse toggle
- `frontend/src/components/HorseCard.tsx` - Add official/guest badges
- `shared/src/types/horse.types.ts` - Update Horse schema with new fields

## Known Limitations

1. **No Bulk Operations**: Must mark horses as official one-by-one
2. **No Merge Function**: Must manually delete duplicates
3. **No Photo Requirement**: Could mark horses as official without good photo evidence
4. **Manual Process**: No automated suggestion of which horses to mark as official

## Rollback Plan

If issues arise:

```sql
-- Rollback migration
ALTER TABLE horses DROP COLUMN IF EXISTS is_official CASCADE;
ALTER TABLE horses DROP COLUMN IF EXISTS made_official_at CASCADE;
ALTER TABLE horses DROP COLUMN IF EXISTS made_official_by CASCADE;
ALTER TABLE farms DROP COLUMN IF EXISTS expected_horse_count CASCADE;

DROP VIEW IF EXISTS farm_horse_allocation CASCADE;
DROP INDEX IF EXISTS idx_horses_official;
DROP INDEX IF EXISTS idx_horses_guest;
```

Then:
```bash
git revert <commit-hash>
docker compose up -d --build
```

---

**Status**:  Implementation Complete, Ready for Testing
**Next Steps**: Test the workflow on stream_004, validate capacity enforcement, verify Re-ID prioritization
