# Horse State Tracking System Specification

## Overview
This system analyzes RTMPose 17-point keypoint data to determine horse body states, head positions, and actions. It uses a two-tier approach: single-frame analysis with smoothing for immediate states, and multi-frame analysis for temporal actions.

## Input Data Structure
```python
{
    'horse_id': int,
    'frame_idx': int,
    'keypoints': [
        {'name': 'Nose', 'x': float, 'y': float, 'confidence': float},
        {'name': 'L_Eye', 'x': float, 'y': float, 'confidence': float},
        {'name': 'R_Eye', 'x': float, 'y': float, 'confidence': float},
        # ... 17 total points
    ],
    'bbox': {'x': int, 'y': int, 'width': int, 'height': int}
}
```

## Tier 1: Single-Frame States (with Smoothing)

### Body Position States
Detected from single frame geometry, smoothed over 0.5 seconds (15 frames @ 30fps).

**STANDING_STILL**
- Detection Logic:
  - All 4 hooves visible and at similar Y position (±10% of bbox height)
  - Hip and shoulder points at normal height (40-60% from bottom of bbox)
  - Minimal change in hoof positions across smoothing window (<5 pixels movement)
- Confidence: Based on keypoint visibility and consistency

**MOVING**
- Detection Logic:
  - Similar to standing but with hoof movement >5 pixels across frames
  - Body center of mass shifting horizontally
  - At least 2 hooves show movement pattern
- Confidence: Proportional to movement consistency

**LYING_DOWN**
- Detection Logic:
  - Bbox width/height ratio > 1.3 (horse is wider than tall)
  - Hip and shoulder Y positions > 70% toward bottom of bbox
  - At least 2 hooves not visible or very close to body center
- Confidence: Based on pose compression ratio

**KNEELING**
- Detection Logic:
  - Front hooves near shoulder level (folded under)
  - Rear hooves still extended
  - Shoulder significantly lower than hip (>20% bbox height difference)
- Confidence: Requires clear front/back height differential

**JUMPING**
- Detection Logic:
  - All hooves above ground level (bottom 20% of bbox empty)
  - Body center elevated compared to running average
  - Compressed leg angles (knees bent >120°)
- Confidence: High if all hooves elevated

### Head Position States
Detected from nose, eye, and neck keypoints, smoothed over 0.3 seconds (10 frames).

**HEAD_UP**
- Nose Y < Neck Y by >15% of bbox height
- Eyes above shoulder line

**HEAD_DOWN**
- Nose Y > Shoulder Y
- Nose in bottom 50% of bbox

**HEAD_LEFT/RIGHT**
- Nose X deviation from neck >20% bbox width
- Both eyes visible = front view, one eye visible = side view

**HEAD_LEFT_BACK/RIGHT_BACK**
- Nose X behind shoulder X position
- Neck angle to body >110°

### Smoothing Logic
1. Collect N frames (default 15 for body, 10 for head)
2. Require minimum 60% frames with valid pose data
3. Take mode (most common state) if confidence >0.6
4. If no dominant state, keep previous state (hysteresis)
5. Update display every 30 frames (1 second)

## Tier 2: Multi-Frame Actions (Temporal Analysis)

### Configuration
- Analysis Window: Variable 30-150 frames (1-5 seconds)
- Sliding Window: Update every 15 frames (0.5 seconds)
- Minimum Frames Required: 60% of window must have valid poses

### Temporal Actions

**WALKING**
- Pattern Detection:
  - Diagonal leg pairs move together (LF+RH, RF+LH)
  - Regular rhythm: peak detection in hoof Y positions
  - Forward progression: body center X changes consistently
  - Speed: 1-2 body lengths per 5 seconds
- Confidence: Based on gait pattern regularity (FFT analysis)

**RUNNING/TROTTING**
- Pattern Detection:
  - Similar to walking but faster cadence
  - Suspension phases where all hooves off ground
  - Speed: >2 body lengths per 5 seconds
  - Higher vertical movement in body center
- Confidence: Suspension phase detection + speed

**PAWING_GROUND**
- Pattern Detection:
  - Single front hoof shows repetitive vertical movement
  - Other 3 hooves relatively stationary
  - Frequency: 1-3 cycles per second
  - Minimum 3 complete cycles to confirm
- Confidence: Repetition count and rhythm consistency

**JUMPING_ACTION**
- Pattern Detection:
  - Sequence: crouch → launch → airborne → landing
  - All hooves leave ground simultaneously
  - Body center shows parabolic trajectory
  - Duration: typically 0.5-1.5 seconds total
- Confidence: Complete phase sequence detection

**LOOKING_BACK_AT_ABDOMEN**
- Pattern Detection:
  - Head turns back (>110° from forward)
  - Holds position for >1 second
  - May repeat: forward → back → forward pattern
  - Often accompanied by shifting weight
- Confidence: Duration and angle consistency

## Output Format

### Per-Frame Output (Updated every 30 frames/1 second)
```python
{
    'timestamp': float,
    'horse_id': int,
    'body_state': {
        'state': 'STANDING_STILL',  # Enum value
        'confidence': 0.85,
        'raw_scores': {'standing': 0.85, 'moving': 0.1, 'lying': 0.05}
    },
    'head_position': {
        'state': 'HEAD_DOWN',
        'confidence': 0.92,
        'angle': -30  # degrees from horizontal
    }
}
```

### Temporal Action Output
```python
{
    'timestamp': float,
    'horse_id': int,
    'action_1s': {
        'action': 'WALKING',
        'confidence': 0.75,
        'frames_analyzed': 30,
        'valid_frames': 28
    },
    'action_5s': {
        'action': 'PAWING_GROUND',
        'confidence': 0.88,
        'repetitions': 8,
        'frames_analyzed': 150,
        'valid_frames': 142
    }
}
```

## Confidence Calculation

### Single-Frame Confidence
```
confidence = (keypoint_visibility * 0.4 + 
              geometric_match * 0.4 + 
              smoothing_consistency * 0.2)
```

### Multi-Frame Confidence
```
confidence = (pattern_match_score * 0.5 + 
              temporal_consistency * 0.3 + 
              keypoint_quality * 0.2)
```

## Implementation Test Script Structure
```python
class HorseStateTracker:
    def __init__(self):
        self.single_frame_buffer = deque(maxlen=15)
        self.multi_frame_buffer = deque(maxlen=150)
        self.current_states = {}
        
    def process_frame(self, frame_data):
        # 1. Add to buffers
        # 2. Check if enough frames for analysis
        # 3. Run single-frame detection
        # 4. Run temporal detection if window complete
        # 5. Apply smoothing/hysteresis
        # 6. Return combined state
        
    def detect_body_state(self, keypoints, bbox):
        # Geometric analysis for body position
        
    def detect_head_position(self, keypoints):
        # Angle and position analysis
        
    def detect_temporal_action(self, frame_window):
        # Pattern matching across frames
        
    def calculate_confidence(self, detections, method='single'):
        # Weighted confidence scoring
```

## Testing Priorities
1. Phase 1: Body states (standing/lying) + head up/down
2. Phase 2: Movement detection (walking vs standing still)
3. Phase 3: Complex actions (pawing, looking back)

## Tunable Parameters
```python
CONFIG = {
    'smoothing_frames_body': 15,
    'smoothing_frames_head': 10,
    'temporal_window_short': 30,   # 1 second
    'temporal_window_long': 150,   # 5 seconds
    'min_confidence_threshold': 0.6,
    'hysteresis_factor': 0.8,      # Bias toward previous state
    'movement_threshold_pixels': 5,
    'head_angle_threshold': 110,   # degrees
    'pawing_frequency': (1, 3),    # Hz range
}
```

## Visual Output Requirements
The processed video should display:
- Top overlay: Current body state + confidence bar
- Head indicator: Arrow showing head direction
- Action label: Current dominant action (1s and 5s)
- Timeline: Bottom bar showing state transitions
- Alert box: Highlight concerning state combinations

## Success Metrics
- Single-frame state accuracy: >90%
- State transition smoothness: <2 false transitions per minute
- Walking vs standing discrimination: >95%
- Pawing detection: >80% with <10% false positives
- Real-time processing: >15 fps on GPU