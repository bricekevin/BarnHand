# Phase 2: Implementation Guide

## Key Integration Points

### 1. ReID Model Upgrade
Replace `backend/ml-service/src/models/horse_reid.py`:
- Current: Basic CNN feature extraction
- Upgrade: MegaDescriptor wildlife-specific model from `test_wildlifereid_pipeline.py`
- Benefits: >95% horse re-identification accuracy

### 2. State Detection Integration  
Connect existing models to processor:
- `hierarchical_state_detection.py` → Primary/secondary states
- `advanced_state_detection.py` → Temporal actions
- Integration point: `backend/ml-service/src/services/processor.py`

### 3. Cross-Chunk Continuity
Add Redis persistence for horse tracking:
```python
# Schema: horse:{stream_id}:{horse_id}:state
{
    "features": [512-dim array],
    "last_seen_chunk": 42,
    "current_action": "walking",
    "pose_history": [...]
}
```

## Database Schema

Add behavioral tables to existing migration system:

```sql
-- 002_behavioral_tables.sql
CREATE TABLE horse_pose_frames (
    id SERIAL PRIMARY KEY,
    horse_id INT REFERENCES horses(id),
    timestamp TIMESTAMPTZ,
    orientation_angle FLOAT,
    joint_angles JSONB,
    confidence FLOAT
);

CREATE TABLE horse_actions (
    id SERIAL PRIMARY KEY, 
    horse_id INT REFERENCES horses(id),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    action VARCHAR(50),
    confidence FLOAT
);
```

## Configuration

Key environment variables for behavioral analysis:

```bash
# ReID Configuration  
REID_MODEL=megadescriptor
REID_SIMILARITY_THRESHOLD=0.6
REID_MAX_HORSES=10

# Performance Tuning
POSE_CONFIDENCE_MIN=0.3
ACTION_MIN_DURATION=2.0
BATCH_SIZE_REID=8
```

## Testing Strategy

**Test with existing video**: `media/rolling-on-ground.mp4`

**Expected behavior sequence**:
1. Standing → lying_down → rolling → standing  
2. Cross-chunk horse persistence (same horse ID)
3. Behavioral timeline visualization
4. >25 FPS processing performance

**Validation tools**:
- Manual chunk processing with testing panel
- Layer-by-layer result comparison
- Performance metrics dashboard
