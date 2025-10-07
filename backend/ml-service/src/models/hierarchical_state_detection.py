#!/usr/bin/env python3
"""
Hierarchical Horse State Detection System
Implements multi-layered behavioral analysis using pose keypoints for:
- Primary body states (Standing, Walking, Lying, Rolling, Transitioning)
- Secondary modifiers (Head position, Leg activity patterns)  
- Behavioral event detection (Colic, distress patterns, etc.)
"""

import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from enum import Enum
import time
from collections import deque
import math

class PrimaryBodyState(Enum):
    """Primary body states - foundation layer"""
    STANDING = "standing"
    WALKING = "walking"  
    LYING_DOWN = "lying_down"
    ROLLING = "rolling"
    TRANSITIONING = "transitioning"
    UNKNOWN = "unknown"

class HeadPosition(Enum):
    """Secondary state: Head position relative to body"""
    UP_ALERT = "up_alert"           # Above shoulder line
    NORMAL = "normal"               # Level with back
    DOWN_GRAZING = "down_grazing"   # Below chest level
    LOOKING_BACK = "looking_back"   # Nose behind shoulder point
    UNKNOWN = "unknown"

class LegActivity(Enum):
    """Secondary state: Leg movement patterns"""
    STATIC = "static"               # No movement
    WALKING_PATTERN = "walking"     # Alternating diagonal pairs
    PAWING = "pawing"               # Single leg repetitive motion
    KICKING = "kicking"             # Fast backward motion
    RESTLESS = "restless"           # Multiple legs moving irregularly
    UNKNOWN = "unknown"

@dataclass
class StateDetectionResult:
    """Complete state detection result"""
    primary_state: PrimaryBodyState
    head_position: HeadPosition
    leg_activity: LegActivity
    confidence: float
    keypoint_quality: float
    state_duration: float
    transition_probability: float
    
    # Geometric measurements
    height_ratio: float = 0.0
    body_angle: float = 0.0
    head_angle: float = 0.0
    leg_spread: float = 0.0
    
    # Motion data
    movement_velocity: float = 0.0
    pose_stability: float = 0.0
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'primary_state': self.primary_state.value,
            'head_position': self.head_position.value,
            'leg_activity': self.leg_activity.value,
            'confidence': self.confidence,
            'keypoint_quality': self.keypoint_quality,
            'state_duration': self.state_duration,
            'transition_probability': self.transition_probability,
            'measurements': {
                'height_ratio': self.height_ratio,
                'body_angle': self.body_angle,
                'head_angle': self.head_angle,
                'leg_spread': self.leg_spread,
                'movement_velocity': self.movement_velocity,
                'pose_stability': self.pose_stability
            }
        }

@dataclass 
class BehavioralEvent:
    """Detected behavioral event/pattern"""
    event_type: str
    severity: str  # low, medium, high, critical
    confidence: float
    duration: float
    description: str
    state_sequence: List[str]
    
    def to_dict(self) -> Dict:
        return {
            'event_type': self.event_type,
            'severity': self.severity,
            'confidence': self.confidence,
            'duration': self.duration,
            'description': self.description,
            'state_sequence': self.state_sequence
        }

class HierarchicalStateDetector:
    """
    Advanced hierarchical state detection system for horses
    Uses pose keypoints to detect multi-layered behavioral states
    """
    
    def __init__(self, history_length: int = 30):
        """
        Initialize hierarchical state detector
        
        Args:
            history_length: Number of frames to keep for temporal analysis
        """
        self.history_length = history_length
        self.state_history: deque = deque(maxlen=history_length)
        self.pose_history: deque = deque(maxlen=history_length)
        self.timestamp_history: deque = deque(maxlen=history_length)
        
        # Current state tracking
        self.current_primary_state = PrimaryBodyState.UNKNOWN
        self.current_state_start_time = time.time()
        self.state_confidence_accumulator = []
        
        # Keypoint name mapping for different pose models
        self.keypoint_names = {
            # Standard RTMPose AP10K keypoints for quadrupeds
            'nose': 'Nose',
            'left_eye': 'L_Eye', 
            'right_eye': 'R_Eye',
            'neck': 'Neck',
            'left_shoulder': 'L_Shoulder',
            'right_shoulder': 'R_Shoulder', 
            'left_elbow': 'L_Elbow',
            'right_elbow': 'R_Elbow',
            'left_front_paw': 'L_F_Paw',
            'right_front_paw': 'R_F_Paw',
            'root_of_tail': 'Root_of_tail',
            'left_hip': 'L_Hip',
            'right_hip': 'R_Hip',
            'left_knee': 'L_Knee', 
            'right_knee': 'R_Knee',
            'left_back_paw': 'L_B_Paw',
            'right_back_paw': 'R_B_Paw'
        }
        
        # State transition rules (which states can transition to which)
        self.valid_transitions = {
            PrimaryBodyState.STANDING: [PrimaryBodyState.WALKING, PrimaryBodyState.TRANSITIONING, PrimaryBodyState.LYING_DOWN],
            PrimaryBodyState.WALKING: [PrimaryBodyState.STANDING, PrimaryBodyState.TRANSITIONING],
            PrimaryBodyState.LYING_DOWN: [PrimaryBodyState.ROLLING, PrimaryBodyState.TRANSITIONING, PrimaryBodyState.STANDING],
            PrimaryBodyState.ROLLING: [PrimaryBodyState.LYING_DOWN, PrimaryBodyState.TRANSITIONING],
            PrimaryBodyState.TRANSITIONING: [PrimaryBodyState.STANDING, PrimaryBodyState.LYING_DOWN, PrimaryBodyState.WALKING],
            PrimaryBodyState.UNKNOWN: list(PrimaryBodyState)
        }
        
    def extract_keypoints_dict(self, pose_data: Dict) -> Dict[str, Dict]:
        """Extract keypoints as dictionary for easier access"""
        keypoints_dict = {}
        
        if not pose_data or not pose_data.get('keypoints'):
            return keypoints_dict
            
        keypoints = pose_data['keypoints']
        
        # Handle different keypoint formats
        if isinstance(keypoints, list) and len(keypoints) > 0:
            if isinstance(keypoints[0], dict):
                # Format: [{'name': 'Nose', 'x': 100, 'y': 200, 'confidence': 0.9}, ...]
                for kp in keypoints:
                    if 'name' in kp and 'x' in kp and 'y' in kp:
                        keypoints_dict[kp['name']] = {
                            'x': kp['x'],
                            'y': kp['y'],
                            'confidence': kp.get('confidence', 0.0)
                        }
            elif isinstance(keypoints[0], (list, tuple)) and len(keypoints[0]) >= 2:
                # Format: [(x, y, confidence), ...] with predefined order
                standard_names = list(self.keypoint_names.values())
                for i, kp in enumerate(keypoints):
                    if i < len(standard_names):
                        conf = kp[2] if len(kp) > 2 else 0.0
                        keypoints_dict[standard_names[i]] = {
                            'x': kp[0],
                            'y': kp[1], 
                            'confidence': conf
                        }
        
        return keypoints_dict
    
    def calculate_keypoint_quality(self, keypoints_dict: Dict[str, Dict]) -> float:
        """Calculate overall quality of keypoint detection"""
        if not keypoints_dict:
            return 0.0
            
        confidences = [kp['confidence'] for kp in keypoints_dict.values() 
                      if kp.get('confidence', 0) > 0]
        
        if not confidences:
            return 0.0
            
        # Quality is average confidence with bonus for number of detected keypoints
        avg_confidence = np.mean(confidences)
        detection_ratio = len(confidences) / len(self.keypoint_names)
        
        return avg_confidence * 0.7 + detection_ratio * 0.3
    
    def detect_primary_body_state(self, keypoints_dict: Dict[str, Dict]) -> Tuple[PrimaryBodyState, float]:
        """
        Detect primary body state from keypoints
        Phase 1: Standing vs Lying (height ratio based)
        Phase 2: Walking vs Standing (motion based)  
        Phase 3: Rolling detection (rotation during lying)
        """
        if not keypoints_dict:
            return PrimaryBodyState.UNKNOWN, 0.0
        
        # Get key reference points
        nose = keypoints_dict.get('Nose', {})
        neck = keypoints_dict.get('Neck', {})
        left_shoulder = keypoints_dict.get('L_Shoulder', {})
        right_shoulder = keypoints_dict.get('R_Shoulder', {})
        left_hip = keypoints_dict.get('L_Hip', {})
        right_hip = keypoints_dict.get('R_Hip', {})
        left_front_paw = keypoints_dict.get('L_F_Paw', {})
        right_front_paw = keypoints_dict.get('R_F_Paw', {})
        left_back_paw = keypoints_dict.get('L_B_Paw', {})
        right_back_paw = keypoints_dict.get('R_B_Paw', {})
        
        # Calculate body dimensions for height ratio
        shoulder_height = None
        paw_level = None
        
        if left_shoulder.get('confidence', 0) > 0.3 and right_shoulder.get('confidence', 0) > 0.3:
            shoulder_height = (left_shoulder['y'] + right_shoulder['y']) / 2
        elif left_shoulder.get('confidence', 0) > 0.3:
            shoulder_height = left_shoulder['y']
        elif right_shoulder.get('confidence', 0) > 0.3:
            shoulder_height = right_shoulder['y']
        
        # Get average paw level (ground reference)
        paw_points = [p for p in [left_front_paw, right_front_paw, left_back_paw, right_back_paw]
                     if p.get('confidence', 0) > 0.3]
        if paw_points:
            paw_level = np.mean([p['y'] for p in paw_points])
        
        # Phase 1: Standing vs Lying Detection (most reliable)
        if shoulder_height is not None and paw_level is not None:
            body_height = abs(paw_level - shoulder_height)
            bbox_height = self._estimate_bbox_height(keypoints_dict)
            
            if bbox_height > 0:
                height_ratio = body_height / bbox_height
                
                # Standing: tall profile, shoulders well above paws
                if height_ratio > 0.4:  # Horse is upright
                    
                    # Phase 2: Standing vs Walking (motion analysis)
                    if len(self.pose_history) >= 3:
                        movement_detected = self._detect_movement_pattern(keypoints_dict)
                        if movement_detected:
                            return PrimaryBodyState.WALKING, 0.85
                    
                    return PrimaryBodyState.STANDING, 0.90
                
                # Lying: low profile, wide bbox
                elif height_ratio < 0.25:  
                    
                    # Phase 3: Lying vs Rolling (rotation analysis)
                    if len(self.pose_history) >= 5:
                        rotation_detected = self._detect_rotation_pattern(keypoints_dict)
                        if rotation_detected:
                            return PrimaryBodyState.ROLLING, 0.80
                    
                    return PrimaryBodyState.LYING_DOWN, 0.85
                
                # Transitioning: intermediate height ratio
                else:
                    return PrimaryBodyState.TRANSITIONING, 0.70
        
        # Fallback: try to detect lying from body angle
        body_angle = self._calculate_body_angle(keypoints_dict)
        if body_angle is not None:
            if abs(body_angle) > 45:  # Significant tilt suggests lying
                return PrimaryBodyState.LYING_DOWN, 0.60
            elif abs(body_angle) < 15:  # Upright
                return PrimaryBodyState.STANDING, 0.60
        
        return PrimaryBodyState.UNKNOWN, 0.0
    
    def detect_head_position(self, keypoints_dict: Dict[str, Dict]) -> Tuple[HeadPosition, float]:
        """Detect head position relative to body"""
        nose = keypoints_dict.get('Nose', {})
        neck = keypoints_dict.get('Neck', {})
        left_shoulder = keypoints_dict.get('L_Shoulder', {})
        right_shoulder = keypoints_dict.get('R_Shoulder', {})
        
        if not (nose.get('confidence', 0) > 0.3 and neck.get('confidence', 0) > 0.3):
            return HeadPosition.UNKNOWN, 0.0
        
        # Calculate shoulder level (body reference)
        shoulder_y = None
        if left_shoulder.get('confidence', 0) > 0.3 and right_shoulder.get('confidence', 0) > 0.3:
            shoulder_y = (left_shoulder['y'] + right_shoulder['y']) / 2
        elif left_shoulder.get('confidence', 0) > 0.3:
            shoulder_y = left_shoulder['y']  
        elif right_shoulder.get('confidence', 0) > 0.3:
            shoulder_y = right_shoulder['y']
        
        if shoulder_y is None:
            return HeadPosition.UNKNOWN, 0.0
        
        nose_y = nose['y']
        neck_y = neck['y']
        
        # Head position relative to shoulders
        head_level = (nose_y + neck_y) / 2
        height_diff = shoulder_y - head_level  # Positive = head above shoulders
        
        # Check for looking back (nose behind shoulder point)
        if left_shoulder.get('confidence', 0) > 0.3:
            shoulder_x = left_shoulder['x']
            if abs(nose['x'] - shoulder_x) < 50 and nose['x'] < shoulder_x:  # Nose near/behind shoulder
                return HeadPosition.LOOKING_BACK, 0.80
        
        # Vertical head position
        if height_diff > 30:  # Head well above shoulders
            return HeadPosition.UP_ALERT, 0.85
        elif height_diff < -40:  # Head well below shoulders
            return HeadPosition.DOWN_GRAZING, 0.85
        else:
            return HeadPosition.NORMAL, 0.75
    
    def detect_leg_activity(self, keypoints_dict: Dict[str, Dict]) -> Tuple[LegActivity, float]:
        """Detect leg movement patterns"""
        if len(self.pose_history) < 5:
            return LegActivity.UNKNOWN, 0.0
        
        # Get paw positions for movement analysis
        current_paws = self._get_paw_positions(keypoints_dict)
        if len(current_paws) < 2:
            return LegActivity.UNKNOWN, 0.0
        
        # Analyze movement over recent frames
        recent_poses = list(self.pose_history)[-5:]
        movement_vectors = []
        
        for i, past_pose in enumerate(recent_poses):
            past_keypoints = self.extract_keypoints_dict(past_pose)
            past_paws = self._get_paw_positions(past_keypoints)
            
            if len(past_paws) >= 2:
                # Calculate movement for each paw
                for paw_name in current_paws:
                    if paw_name in past_paws:
                        current_pos = current_paws[paw_name]
                        past_pos = past_paws[paw_name]
                        movement = np.array(current_pos) - np.array(past_pos)
                        movement_vectors.append(np.linalg.norm(movement))
        
        if not movement_vectors:
            return LegActivity.STATIC, 0.70
        
        avg_movement = np.mean(movement_vectors)
        max_movement = np.max(movement_vectors)
        movement_std = np.std(movement_vectors)
        
        # Classify based on movement patterns
        if avg_movement < 5:  # Very little movement
            return LegActivity.STATIC, 0.85
        elif avg_movement > 20 and movement_std > 10:  # High, irregular movement
            if max_movement > 50:
                return LegActivity.KICKING, 0.75
            else:
                return LegActivity.RESTLESS, 0.70
        elif avg_movement > 10 and movement_std < 8:  # Moderate, regular movement
            # Check for alternating pattern (walking)
            alternating = self._detect_alternating_pattern(recent_poses)
            if alternating:
                return LegActivity.WALKING_PATTERN, 0.80
        elif max_movement > 15 and len(set(movement_vectors)) == 1:  # Single leg repetitive
            return LegActivity.PAWING, 0.75
        
        return LegActivity.UNKNOWN, 0.0
    
    def detect_behavioral_events(self, state_result: StateDetectionResult) -> List[BehavioralEvent]:
        """
        Detect behavioral events based on state combinations and sequences
        
        Key patterns:
        - Colic: Standing + Looking Back + Pawing, or Lying→Rolling→Standing repeatedly  
        - Distress: Restless movement + Head up alert
        - Grazing: Standing + Head down + Static legs for extended period
        """
        events = []
        
        if len(self.state_history) < 10:
            return events
        
        # Get recent state sequence
        recent_states = list(self.state_history)[-10:]
        
        # Pattern 1: Colic - State combination
        if (state_result.primary_state == PrimaryBodyState.STANDING and
            state_result.head_position == HeadPosition.LOOKING_BACK and
            state_result.leg_activity == LegActivity.PAWING):
            
            events.append(BehavioralEvent(
                event_type="colic",
                severity="high",
                confidence=0.85,
                duration=state_result.state_duration,
                description="Standing with head turned back and pawing - classic colic indicator",
                state_sequence=["standing", "looking_back", "pawing"]
            ))
        
        # Pattern 2: Colic - Rolling sequence  
        rolling_count = sum(1 for s in recent_states if s.primary_state == PrimaryBodyState.ROLLING)
        lying_count = sum(1 for s in recent_states if s.primary_state == PrimaryBodyState.LYING_DOWN)
        
        if rolling_count >= 3 and lying_count >= 2:
            # Check for Lying→Rolling→Standing pattern
            state_sequence = [s.primary_state.value for s in recent_states]
            if "lying_down" in state_sequence and "rolling" in state_sequence:
                events.append(BehavioralEvent(
                    event_type="colic",
                    severity="critical", 
                    confidence=0.90,
                    duration=len(recent_states) * 0.33,  # Assume ~30fps
                    description="Repeated lying and rolling behavior - severe colic indicator",
                    state_sequence=state_sequence
                ))
        
        # Pattern 3: General distress
        if (state_result.head_position == HeadPosition.UP_ALERT and
            state_result.leg_activity in [LegActivity.RESTLESS, LegActivity.PAWING]):
            
            events.append(BehavioralEvent(
                event_type="distress",
                severity="medium",
                confidence=0.70,
                duration=state_result.state_duration,
                description="Alert posture with restless movement - possible distress",
                state_sequence=["up_alert", state_result.leg_activity.value]
            ))
        
        # Pattern 4: Normal grazing
        if (state_result.primary_state == PrimaryBodyState.STANDING and
            state_result.head_position == HeadPosition.DOWN_GRAZING and
            state_result.leg_activity == LegActivity.STATIC and
            state_result.state_duration > 10):
            
            events.append(BehavioralEvent(
                event_type="grazing",
                severity="low",
                confidence=0.90,
                duration=state_result.state_duration,
                description="Normal grazing behavior",
                state_sequence=["standing", "down_grazing", "static"]
            ))
        
        # Pattern 5: Unusual lying duration
        if (state_result.primary_state == PrimaryBodyState.LYING_DOWN and 
            state_result.state_duration > 600):  # 10 minutes
            
            events.append(BehavioralEvent(
                event_type="extended_lying",
                severity="medium",
                confidence=0.75,
                duration=state_result.state_duration,
                description="Extended lying period - may indicate illness or fatigue",
                state_sequence=["lying_down"]
            ))
        
        return events
    
    def process_pose_data(self, pose_data: Dict, timestamp: Optional[float] = None) -> Tuple[StateDetectionResult, List[BehavioralEvent]]:
        """
        Main processing function - analyze pose data and return hierarchical state detection
        
        Args:
            pose_data: Pose keypoints data from RTMPose or similar
            timestamp: Optional timestamp, uses current time if None
            
        Returns:
            Tuple of (StateDetectionResult, List[BehavioralEvent])
        """
        if timestamp is None:
            timestamp = time.time()
        
        # Extract keypoints
        keypoints_dict = self.extract_keypoints_dict(pose_data)
        keypoint_quality = self.calculate_keypoint_quality(keypoints_dict)
        
        # Primary state detection
        primary_state, primary_confidence = self.detect_primary_body_state(keypoints_dict)
        
        # Secondary state detection
        head_position, head_confidence = self.detect_head_position(keypoints_dict)
        leg_activity, leg_confidence = self.detect_leg_activity(keypoints_dict)
        
        # Calculate overall confidence
        overall_confidence = (primary_confidence * 0.6 + 
                            head_confidence * 0.2 + 
                            leg_confidence * 0.2)
        
        # State duration tracking
        if primary_state != self.current_primary_state:
            self.current_primary_state = primary_state
            self.current_state_start_time = timestamp
            self.state_confidence_accumulator = [overall_confidence]
        else:
            self.state_confidence_accumulator.append(overall_confidence)
        
        state_duration = timestamp - self.current_state_start_time
        
        # Transition probability (how likely to change state)
        transition_prob = self._calculate_transition_probability(primary_state, keypoints_dict)
        
        # Calculate additional measurements
        height_ratio = self._calculate_height_ratio(keypoints_dict)
        body_angle = self._calculate_body_angle(keypoints_dict)
        head_angle = self._calculate_head_angle(keypoints_dict)
        leg_spread = self._calculate_leg_spread(keypoints_dict)
        movement_velocity = self._calculate_movement_velocity(keypoints_dict)
        pose_stability = self._calculate_pose_stability()
        
        # Create result
        state_result = StateDetectionResult(
            primary_state=primary_state,
            head_position=head_position,
            leg_activity=leg_activity,
            confidence=overall_confidence,
            keypoint_quality=keypoint_quality,
            state_duration=state_duration,
            transition_probability=transition_prob,
            height_ratio=height_ratio or 0.0,
            body_angle=body_angle or 0.0,
            head_angle=head_angle or 0.0,
            leg_spread=leg_spread or 0.0,
            movement_velocity=movement_velocity or 0.0,
            pose_stability=pose_stability
        )
        
        # Detect behavioral events
        behavioral_events = self.detect_behavioral_events(state_result)
        
        # Update history
        self.state_history.append(state_result)
        self.pose_history.append(pose_data)
        self.timestamp_history.append(timestamp)
        
        return state_result, behavioral_events
    
    # Helper methods for geometric calculations
    
    def _estimate_bbox_height(self, keypoints_dict: Dict[str, Dict]) -> float:
        """Estimate bounding box height from keypoints"""
        valid_keypoints = [(kp['x'], kp['y']) for kp in keypoints_dict.values() 
                          if kp.get('confidence', 0) > 0.3]
        if len(valid_keypoints) < 3:
            return 0.0
        
        y_coords = [kp[1] for kp in valid_keypoints]
        return max(y_coords) - min(y_coords)
    
    def _calculate_height_ratio(self, keypoints_dict: Dict[str, Dict]) -> Optional[float]:
        """Calculate body height to bbox height ratio"""
        # Get shoulder and paw levels
        shoulders = [keypoints_dict.get('L_Shoulder', {}), keypoints_dict.get('R_Shoulder', {})]
        paws = [keypoints_dict.get('L_F_Paw', {}), keypoints_dict.get('R_F_Paw', {}),
               keypoints_dict.get('L_B_Paw', {}), keypoints_dict.get('R_B_Paw', {})]
        
        valid_shoulders = [s for s in shoulders if s.get('confidence', 0) > 0.3]
        valid_paws = [p for p in paws if p.get('confidence', 0) > 0.3]
        
        if not valid_shoulders or not valid_paws:
            return None
        
        shoulder_level = np.mean([s['y'] for s in valid_shoulders])
        paw_level = np.mean([p['y'] for p in valid_paws])
        body_height = abs(shoulder_level - paw_level)
        
        bbox_height = self._estimate_bbox_height(keypoints_dict)
        
        return body_height / bbox_height if bbox_height > 0 else None
    
    def _calculate_body_angle(self, keypoints_dict: Dict[str, Dict]) -> Optional[float]:
        """Calculate body tilt angle in degrees"""
        left_shoulder = keypoints_dict.get('L_Shoulder', {})
        right_shoulder = keypoints_dict.get('R_Shoulder', {})
        
        if (left_shoulder.get('confidence', 0) < 0.3 or 
            right_shoulder.get('confidence', 0) < 0.3):
            return None
        
        dx = right_shoulder['x'] - left_shoulder['x']
        dy = right_shoulder['y'] - left_shoulder['y']
        
        angle_rad = math.atan2(dy, dx)
        angle_deg = math.degrees(angle_rad)
        
        return angle_deg
    
    def _calculate_head_angle(self, keypoints_dict: Dict[str, Dict]) -> Optional[float]:
        """Calculate head angle relative to neck"""
        nose = keypoints_dict.get('Nose', {})
        neck = keypoints_dict.get('Neck', {})
        
        if (nose.get('confidence', 0) < 0.3 or neck.get('confidence', 0) < 0.3):
            return None
        
        dx = nose['x'] - neck['x']
        dy = nose['y'] - neck['y']
        
        angle_rad = math.atan2(dy, dx)
        angle_deg = math.degrees(angle_rad)
        
        return angle_deg
    
    def _calculate_leg_spread(self, keypoints_dict: Dict[str, Dict]) -> Optional[float]:
        """Calculate average distance between left and right legs"""
        leg_pairs = [
            ('L_F_Paw', 'R_F_Paw'),  # Front legs
            ('L_B_Paw', 'R_B_Paw'),  # Back legs
        ]
        
        spreads = []
        for left_name, right_name in leg_pairs:
            left_paw = keypoints_dict.get(left_name, {})
            right_paw = keypoints_dict.get(right_name, {})
            
            if (left_paw.get('confidence', 0) > 0.3 and 
                right_paw.get('confidence', 0) > 0.3):
                
                distance = math.sqrt(
                    (left_paw['x'] - right_paw['x'])**2 + 
                    (left_paw['y'] - right_paw['y'])**2
                )
                spreads.append(distance)
        
        return np.mean(spreads) if spreads else None
    
    def _calculate_movement_velocity(self, keypoints_dict: Dict[str, Dict]) -> Optional[float]:
        """Calculate average keypoint movement velocity"""
        if len(self.pose_history) < 2:
            return None
        
        prev_pose = self.pose_history[-1]
        prev_keypoints = self.extract_keypoints_dict(prev_pose)
        
        movements = []
        for kp_name in keypoints_dict:
            if (kp_name in prev_keypoints and 
                keypoints_dict[kp_name].get('confidence', 0) > 0.3 and
                prev_keypoints[kp_name].get('confidence', 0) > 0.3):
                
                dx = keypoints_dict[kp_name]['x'] - prev_keypoints[kp_name]['x']
                dy = keypoints_dict[kp_name]['y'] - prev_keypoints[kp_name]['y']
                movement = math.sqrt(dx*dx + dy*dy)
                movements.append(movement)
        
        return np.mean(movements) if movements else None
    
    def _calculate_pose_stability(self) -> float:
        """Calculate how stable the pose detection is over time"""
        if len(self.state_confidence_accumulator) < 3:
            return 0.5
        
        recent_confidences = self.state_confidence_accumulator[-5:]
        return 1.0 - np.std(recent_confidences)  # Lower std = higher stability
    
    def _calculate_transition_probability(self, current_state: PrimaryBodyState, 
                                        keypoints_dict: Dict[str, Dict]) -> float:
        """Calculate probability of transitioning to a different state"""
        if len(self.state_history) < 5:
            return 0.0
        
        # Check state stability
        recent_states = [s.primary_state for s in list(self.state_history)[-5:]]
        state_changes = sum(1 for i in range(1, len(recent_states)) 
                          if recent_states[i] != recent_states[i-1])
        
        # High rate of change indicates instability
        change_rate = state_changes / (len(recent_states) - 1)
        
        # Check if current measurements are at boundary conditions
        height_ratio = self._calculate_height_ratio(keypoints_dict)
        boundary_score = 0.0
        
        if height_ratio:
            # Near standing/lying boundary
            if 0.25 < height_ratio < 0.40:
                boundary_score += 0.3
            # Near lying/transitioning boundary  
            if 0.15 < height_ratio < 0.30:
                boundary_score += 0.2
        
        transition_prob = min(1.0, change_rate * 0.5 + boundary_score)
        return transition_prob
    
    def _detect_movement_pattern(self, keypoints_dict: Dict[str, Dict]) -> bool:
        """Detect if horse is walking based on leg movement patterns"""
        if len(self.pose_history) < 3:
            return False
        
        # Get paw positions over recent frames
        recent_paw_positions = []
        for pose in list(self.pose_history)[-3:]:
            kp_dict = self.extract_keypoints_dict(pose)
            paw_pos = self._get_paw_positions(kp_dict)
            recent_paw_positions.append(paw_pos)
        
        # Add current frame
        current_paws = self._get_paw_positions(keypoints_dict)
        recent_paw_positions.append(current_paws)
        
        # Check for alternating movement pattern
        movement_detected = False
        for paw_name in ['L_F_Paw', 'R_F_Paw', 'L_B_Paw', 'R_B_Paw']:
            movements = []
            for i in range(1, len(recent_paw_positions)):
                if (paw_name in recent_paw_positions[i-1] and 
                    paw_name in recent_paw_positions[i]):
                    
                    prev_pos = recent_paw_positions[i-1][paw_name]
                    curr_pos = recent_paw_positions[i][paw_name]
                    movement = math.sqrt(
                        (curr_pos[0] - prev_pos[0])**2 + 
                        (curr_pos[1] - prev_pos[1])**2
                    )
                    movements.append(movement)
            
            if movements and np.mean(movements) > 8:  # Significant movement
                movement_detected = True
                break
        
        return movement_detected
    
    def _detect_rotation_pattern(self, keypoints_dict: Dict[str, Dict]) -> bool:
        """Detect rotation during lying (rolling behavior)"""
        if len(self.pose_history) < 5:
            return False
        
        # Check body angle changes over time
        angles = []
        for pose in list(self.pose_history)[-5:]:
            kp_dict = self.extract_keypoints_dict(pose)
            angle = self._calculate_body_angle(kp_dict)
            if angle is not None:
                angles.append(angle)
        
        # Add current angle
        current_angle = self._calculate_body_angle(keypoints_dict)
        if current_angle is not None:
            angles.append(current_angle)
        
        if len(angles) < 3:
            return False
        
        # Check for significant angle changes (rotation)
        angle_changes = [abs(angles[i] - angles[i-1]) for i in range(1, len(angles))]
        max_change = max(angle_changes)
        total_change = sum(angle_changes)
        
        # Rolling detected if large angle changes
        return max_change > 30 or total_change > 90
    
    def _get_paw_positions(self, keypoints_dict: Dict[str, Dict]) -> Dict[str, Tuple[float, float]]:
        """Extract paw positions for movement analysis"""
        paw_positions = {}
        paw_names = ['L_F_Paw', 'R_F_Paw', 'L_B_Paw', 'R_B_Paw']
        
        for paw_name in paw_names:
            paw = keypoints_dict.get(paw_name, {})
            if paw.get('confidence', 0) > 0.3:
                paw_positions[paw_name] = (paw['x'], paw['y'])
        
        return paw_positions
    
    def _detect_alternating_pattern(self, recent_poses: List[Dict]) -> bool:
        """Detect alternating leg movement pattern (walking gait)"""
        if len(recent_poses) < 4:
            return False
        
        # Analyze diagonal pairs: L_F_Paw+R_B_Paw vs R_F_Paw+L_B_Paw
        diagonal_movements = []
        
        for i in range(1, len(recent_poses)):
            prev_kp = self.extract_keypoints_dict(recent_poses[i-1])
            curr_kp = self.extract_keypoints_dict(recent_poses[i])
            
            # Check diagonal pair 1: Left front + Right back
            lf_movement = rb_movement = 0
            if ('L_F_Paw' in prev_kp and 'L_F_Paw' in curr_kp and 
                prev_kp['L_F_Paw'].get('confidence', 0) > 0.3 and
                curr_kp['L_F_Paw'].get('confidence', 0) > 0.3):
                lf_movement = math.sqrt(
                    (curr_kp['L_F_Paw']['x'] - prev_kp['L_F_Paw']['x'])**2 +
                    (curr_kp['L_F_Paw']['y'] - prev_kp['L_F_Paw']['y'])**2
                )
            
            if ('R_B_Paw' in prev_kp and 'R_B_Paw' in curr_kp and 
                prev_kp['R_B_Paw'].get('confidence', 0) > 0.3 and
                curr_kp['R_B_Paw'].get('confidence', 0) > 0.3):
                rb_movement = math.sqrt(
                    (curr_kp['R_B_Paw']['x'] - prev_kp['R_B_Paw']['x'])**2 +
                    (curr_kp['R_B_Paw']['y'] - prev_kp['R_B_Paw']['y'])**2
                )
            
            diagonal1_movement = (lf_movement + rb_movement) / 2
            diagonal_movements.append(diagonal1_movement)
        
        # Simple alternating pattern detection
        return len(diagonal_movements) >= 2 and np.mean(diagonal_movements) > 5
    
    def get_state_summary(self) -> Dict:
        """Get summary of current state and recent history"""
        if not self.state_history:
            return {"status": "no_data"}
        
        current_state = self.state_history[-1]
        
        # Calculate state distribution over recent history
        recent_states = list(self.state_history)[-20:]  # Last 20 detections
        state_counts = {}
        for state_result in recent_states:
            state_name = state_result.primary_state.value
            state_counts[state_name] = state_counts.get(state_name, 0) + 1
        
        return {
            "current_state": current_state.to_dict(),
            "state_distribution": state_counts,
            "total_detections": len(self.state_history),
            "average_confidence": np.mean([s.confidence for s in recent_states]),
            "average_keypoint_quality": np.mean([s.keypoint_quality for s in recent_states]),
            "state_stability": current_state.pose_stability
        }