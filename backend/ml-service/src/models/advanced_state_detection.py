#!/usr/bin/env python3
"""
Advanced Horse State Detection System
Implements two-tier state detection: single-frame with smoothing + temporal analysis
Configurable via external YAML configuration file
"""

import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from enum import Enum
import math
from collections import deque, Counter
import yaml
from pathlib import Path
import logging
try:
    from scipy import signal
    from scipy.spatial import distance
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False
    logger.warning("SciPy not available - some advanced features disabled")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BodyState(Enum):
    """Horse body position states"""
    UPRIGHT = "upright"  # Consolidates standing_still, moving, walking
    RUNNING = "running"
    LYING_DOWN = "lying_down"
    KNEELING = "kneeling"
    JUMPING = "jumping"
    UNKNOWN = "unknown"

class HeadPosition(Enum):
    """Horse head position states"""
    HEAD_UP = "head_up"
    HEAD_DOWN = "head_down"
    HEAD_LEFT = "head_left"
    HEAD_RIGHT = "head_right"
    HEAD_LEFT_BACK = "head_left_back"
    HEAD_RIGHT_BACK = "head_right_back"
    HEAD_NEUTRAL = "head_neutral"

class TemporalAction(Enum):
    """Multi-frame temporal actions"""
    WALKING_PATTERN = "walking_pattern"
    RUNNING_PATTERN = "running_pattern"
    PAWING_GROUND = "pawing_ground"
    JUMPING_ACTION = "jumping_action"
    LOOKING_BACK_AT_ABDOMEN = "looking_back_at_abdomen"
    ROLLING = "rolling"
    GRAZING = "grazing"
    NONE = "none"

@dataclass
class StateDetectionResult:
    """Complete state detection result"""
    frame_idx: int
    timestamp: float
    horse_id: int
    
    # Single-frame states
    body_state: BodyState
    body_confidence: float
    body_raw_scores: Dict[str, float]
    
    head_position: HeadPosition
    head_confidence: float
    head_angle: float  # degrees from horizontal
    
    # Temporal actions
    action_1s: Optional[TemporalAction] = None
    action_1s_confidence: float = 0.0
    action_5s: Optional[TemporalAction] = None
    action_5s_confidence: float = 0.0
    
    # Measurements
    measurements: Dict[str, Any] = field(default_factory=dict)
    
    # Alerts
    alerts: List[str] = field(default_factory=list)
    
    # Raw pose data for comprehensive analysis
    pose_data: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        result = {
            'frame_idx': self.frame_idx,
            'timestamp': self.timestamp,
            'horse_id': self.horse_id,
            'body_state': {
                'state': self.body_state.value,
                'confidence': self.body_confidence,
                'raw_scores': self.body_raw_scores
            },
            'head_position': {
                'state': self.head_position.value,
                'confidence': self.head_confidence,
                'angle': self.head_angle
            },
            'action_1s': {
                'action': self.action_1s.value if self.action_1s else 'none',
                'confidence': self.action_1s_confidence
            },
            'action_5s': {
                'action': self.action_5s.value if self.action_5s else 'none',
                'confidence': self.action_5s_confidence
            },
            'measurements': self.measurements,
            'alerts': self.alerts
        }
        
        # Add comprehensive position and pose data if available
        if hasattr(self, 'pose_data') and self.pose_data:
            # Add bounding box coordinates
            if 'bbox' in self.pose_data:
                bbox = self.pose_data['bbox']
                result['position'] = {
                    'bbox_x': bbox.get('x', 0),
                    'bbox_y': bbox.get('y', 0),
                    'bbox_width': bbox.get('width', 0),
                    'bbox_height': bbox.get('height', 0),
                    'bbox_center_x': bbox.get('x', 0) + bbox.get('width', 0) / 2,
                    'bbox_center_y': bbox.get('y', 0) + bbox.get('height', 0) / 2
                }
            
            # Add detailed keypoints
            keypoints_data = {}
            keypoint_names = ['Nose', 'Neck', 'L_Shoulder', 'R_Shoulder', 'L_F_Elbow', 'R_F_Elbow',
                             'L_F_Knee', 'R_F_Knee', 'L_F_Paw', 'R_F_Paw', 'L_B_Paw', 'R_B_Paw',
                             'L_B_Knee', 'R_B_Knee', 'L_B_Elbow', 'R_B_Elbow', 'Tail']
            
            for kp_name in keypoint_names:
                if kp_name in self.pose_data:
                    kp = self.pose_data[kp_name]
                    keypoints_data[kp_name.lower()] = {
                        'x': kp.get('x', 0),
                        'y': kp.get('y', 0),
                        'confidence': kp.get('confidence', 0.0)
                    }
            
            if keypoints_data:
                result['keypoints'] = keypoints_data
                
                # Add pose quality metrics
                visible_keypoints = [kp for kp in keypoints_data.values() if kp['confidence'] > 0.3]
                result['pose_quality'] = {
                    'visible_keypoints': len(visible_keypoints),
                    'total_keypoints': len(keypoints_data),
                    'pose_completeness': len(visible_keypoints) / len(keypoints_data) if keypoints_data else 0
                }
        
        return result

class AdvancedStateDetector:
    """
    Advanced two-tier state detection system with configurable thresholds
    """
    
    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize detector with configuration
        
        Args:
            config_path: Path to YAML configuration file
        """
        # Load configuration
        self.config = self._load_config(config_path)
        
        # Initialize buffers for smoothing
        self.body_state_buffer = deque(
            maxlen=self.config['single_frame']['smoothing_frames_body']
        )
        self.head_position_buffer = deque(
            maxlen=self.config['single_frame']['smoothing_frames_head']
        )
        
        # Initialize temporal analysis buffers
        self.temporal_buffer_short = deque(
            maxlen=self.config['temporal_analysis']['temporal_window_short']
        )
        self.temporal_buffer_long = deque(
            maxlen=self.config['temporal_analysis']['temporal_window_long']
        )
        
        # State history for hysteresis
        self.current_body_state = BodyState.UNKNOWN
        self.current_head_position = HeadPosition.HEAD_NEUTRAL
        
        # Frame counter
        self.frame_count = 0
        
        # Alert tracking
        self.last_alert_time = {}
        
        # Keypoint names for RTMPose AP10K
        self.keypoint_names = [
            'Nose', 'L_Eye', 'R_Eye', 'Neck', 'L_Shoulder', 'R_Shoulder',
            'L_Elbow', 'R_Elbow', 'L_F_Paw', 'R_F_Paw', 'Root_of_tail',
            'L_Hip', 'R_Hip', 'L_Knee', 'R_Knee', 'L_B_Paw', 'R_B_Paw'
        ]
    
    def _load_config(self, config_path: Optional[str]) -> Dict:
        """Load configuration from YAML file or use defaults"""
        if config_path and Path(config_path).exists():
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        else:
            # Default configuration
            return self._get_default_config()
    
    def _get_default_config(self) -> Dict:
        """Return default configuration"""
        return {
            'single_frame': {
                'smoothing_frames_body': 15,
                'smoothing_frames_head': 10,
                'min_confidence_threshold': 0.6,
                'hysteresis_factor': 0.8,
                'body_state': {
                    'movement_threshold_pixels': 5,
                    'hoof_similarity_threshold': 0.1,
                    'standing_hip_range': [0.4, 0.6],
                    'lying_hip_threshold': 0.7,
                    'lying_aspect_ratio': 1.3,
                    'kneeling_height_diff': 0.2,
                    'jumping_ground_clearance': 0.2,
                    'jumping_leg_angle': 120
                },
                'head_position': {
                    'head_angle_threshold': 110,
                    'head_up_threshold': 0.15,
                    'head_down_threshold': 0.5,
                    'head_lateral_threshold': 0.2
                }
            },
            'temporal_analysis': {
                'temporal_window_short': 30,
                'temporal_window_long': 150,
                'update_interval': 15,
                'min_valid_frames_ratio': 0.6,
                'gait_detection': {
                    'walking_speed_range': [1.0, 2.0],
                    'running_speed_threshold': 2.0,
                    'suspension_phase_frames': 2,
                    'gait_rhythm_threshold': 0.7
                },
                'pawing_detection': {
                    'pawing_frequency_range': [1.0, 3.0],
                    'pawing_min_cycles': 3,
                    'pawing_amplitude_threshold': 20,
                    'stationary_hoof_threshold': 10
                }
            },
            'confidence_weights': {
                'single_frame': {
                    'keypoint_visibility': 0.4,
                    'geometric_match': 0.4,
                    'smoothing_consistency': 0.2
                },
                'multi_frame': {
                    'pattern_match': 0.5,
                    'temporal_consistency': 0.3,
                    'keypoint_quality': 0.2
                }
            }
        }
    
    def extract_keypoints_dict(self, pose_data: Dict) -> Dict[str, Dict]:
        """Extract keypoints as dictionary for easier access"""
        keypoints_dict = {}
        
        if not pose_data or 'keypoints' not in pose_data:
            return keypoints_dict
        
        keypoints = pose_data['keypoints']
        
        if isinstance(keypoints, list) and len(keypoints) > 0:
            if isinstance(keypoints[0], dict):
                for kp in keypoints:
                    if 'name' in kp and 'x' in kp and 'y' in kp:
                        keypoints_dict[kp['name']] = {
                            'x': kp['x'],
                            'y': kp['y'],
                            'confidence': kp.get('confidence', 0.0)
                        }
        
        return keypoints_dict
    
    def detect_body_state(self, keypoints: Dict[str, Dict], bbox: Dict) -> Tuple[BodyState, float, Dict[str, float]]:
        """
        Detect body state from single frame
        
        Returns:
            (state, confidence, raw_scores)
        """
        raw_scores = {}
        
        # Calculate key metrics
        aspect_ratio = bbox['width'] / bbox['height'] if bbox['height'] > 0 else 1.0
        
        # Get hoof positions
        hooves = ['L_F_Paw', 'R_F_Paw', 'L_B_Paw', 'R_B_Paw']
        hoof_positions = []
        for hoof in hooves:
            if hoof in keypoints and keypoints[hoof]['confidence'] > 0.3:
                hoof_positions.append(keypoints[hoof])
        
        # Get body positions
        hips = ['L_Hip', 'R_Hip']
        shoulders = ['L_Shoulder', 'R_Shoulder']
        
        hip_positions = [keypoints[h] for h in hips if h in keypoints and keypoints[h]['confidence'] > 0.3]
        shoulder_positions = [keypoints[s] for s in shoulders if s in keypoints and keypoints[s]['confidence'] > 0.3]
        
        # Check for lying down
        if aspect_ratio > self.config['single_frame']['body_state']['lying_aspect_ratio']:
            if hip_positions:
                avg_hip_y = np.mean([h['y'] for h in hip_positions])
                hip_ratio = (avg_hip_y - bbox['y']) / bbox['height']
                if hip_ratio > self.config['single_frame']['body_state']['lying_hip_threshold']:
                    raw_scores['lying_down'] = 0.9
                    return BodyState.LYING_DOWN, 0.9, raw_scores
        
        # Check for jumping (all hooves off ground)
        if len(hoof_positions) >= 3:
            ground_level = bbox['y'] + bbox['height']
            hooves_off_ground = sum(1 for h in hoof_positions 
                                   if (ground_level - h['y']) > bbox['height'] * 
                                   self.config['single_frame']['body_state']['jumping_ground_clearance'])
            if hooves_off_ground >= 3:
                raw_scores['jumping'] = 0.85
                return BodyState.JUMPING, 0.85, raw_scores
        
        # Check for kneeling
        if shoulder_positions and hip_positions:
            avg_shoulder_y = np.mean([s['y'] for s in shoulder_positions])
            avg_hip_y = np.mean([h['y'] for h in hip_positions])
            height_diff = abs(avg_shoulder_y - avg_hip_y) / bbox['height']
            if height_diff > self.config['single_frame']['body_state']['kneeling_height_diff']:
                if avg_shoulder_y > avg_hip_y:  # Front lower than back
                    raw_scores['kneeling'] = 0.75
                    return BodyState.KNEELING, 0.75, raw_scores
        
        # Default to upright (will refine with movement analysis)
        raw_scores['upright'] = 0.7
        return BodyState.UPRIGHT, 0.7, raw_scores
    
    def detect_head_position(self, keypoints: Dict[str, Dict], bbox: Dict) -> Tuple[HeadPosition, float, float]:
        """
        Detect head position from keypoints
        
        Returns:
            (position, confidence, angle)
        """
        nose = keypoints.get('Nose', {})
        neck = keypoints.get('Neck', {})
        shoulders = ['L_Shoulder', 'R_Shoulder']
        
        if not nose.get('confidence', 0) > 0.3 or not neck.get('confidence', 0) > 0.3:
            return HeadPosition.HEAD_NEUTRAL, 0.0, 0.0
        
        # Calculate head angle
        dx = nose['x'] - neck['x']
        dy = nose['y'] - neck['y']
        angle = math.degrees(math.atan2(dy, dx))
        
        # Vertical position analysis
        height_ratio = (nose['y'] - bbox['y']) / bbox['height']
        
        if height_ratio < self.config['single_frame']['head_position']['head_up_threshold']:
            return HeadPosition.HEAD_UP, 0.85, angle
        elif height_ratio > self.config['single_frame']['head_position']['head_down_threshold']:
            return HeadPosition.HEAD_DOWN, 0.85, angle
        
        # Lateral position analysis
        lateral_ratio = abs(nose['x'] - neck['x']) / bbox['width']
        
        if lateral_ratio > self.config['single_frame']['head_position']['head_lateral_threshold']:
            # Check if looking back
            shoulder_x = np.mean([keypoints[s]['x'] for s in shoulders 
                                 if s in keypoints and keypoints[s]['confidence'] > 0.3])
            if nose['x'] < shoulder_x and dx < 0:
                return HeadPosition.HEAD_LEFT_BACK, 0.8, angle
            elif nose['x'] > shoulder_x and dx > 0:
                return HeadPosition.HEAD_RIGHT_BACK, 0.8, angle
            elif dx < 0:
                return HeadPosition.HEAD_LEFT, 0.75, angle
            else:
                return HeadPosition.HEAD_RIGHT, 0.75, angle
        
        return HeadPosition.HEAD_NEUTRAL, 0.7, angle
    
    def analyze_movement_pattern(self, frames: List[Dict]) -> Tuple[Optional[TemporalAction], float]:
        """
        Analyze movement patterns across multiple frames
        """
        if len(frames) < self.config['temporal_analysis']['min_valid_frames_ratio'] * len(frames):
            return None, 0.0
        
        # Extract hoof positions across frames
        hoof_tracks = {
            'L_F_Paw': [],
            'R_F_Paw': [],
            'L_B_Paw': [],
            'R_B_Paw': []
        }
        
        for frame in frames:
            kp_dict = self.extract_keypoints_dict(frame)
            for hoof in hoof_tracks:
                if hoof in kp_dict and kp_dict[hoof]['confidence'] > 0.3:
                    hoof_tracks[hoof].append((kp_dict[hoof]['x'], kp_dict[hoof]['y']))
        
        # Check for pawing pattern (single hoof repetitive movement)
        if HAS_SCIPY:
            for hoof, positions in hoof_tracks.items():
                if len(positions) > 10:
                    y_positions = [p[1] for p in positions]
                    # Detect peaks in vertical movement
                    peaks, _ = signal.find_peaks(y_positions, 
                        height=self.config['temporal_analysis']['pawing_detection']['pawing_amplitude_threshold'])
                    
                    if len(peaks) >= self.config['temporal_analysis']['pawing_detection']['pawing_min_cycles']:
                        # Check if other hooves are stationary
                        other_hooves_stationary = True
                        for other_hoof, other_positions in hoof_tracks.items():
                            if other_hoof != hoof and len(other_positions) > 5:
                                movement = np.std([p[0] for p in other_positions])
                                if movement > self.config['temporal_analysis']['pawing_detection']['stationary_hoof_threshold']:
                                    other_hooves_stationary = False
                                    break
                        
                        if other_hooves_stationary:
                            return TemporalAction.PAWING_GROUND, 0.85
        
        # Check for walking/running patterns
        # Calculate overall movement speed
        if len(frames) > 20:
            first_frame = self.extract_keypoints_dict(frames[0])
            last_frame = self.extract_keypoints_dict(frames[-1])
            
            if 'Neck' in first_frame and 'Neck' in last_frame:
                distance = math.sqrt(
                    (last_frame['Neck']['x'] - first_frame['Neck']['x'])**2 +
                    (last_frame['Neck']['y'] - first_frame['Neck']['y'])**2
                )
                
                # Estimate body length from bbox
                avg_body_length = np.mean([f.get('bbox', {}).get('width', 0) for f in frames if 'bbox' in f])
                if avg_body_length > 0:
                    body_lengths_moved = distance / avg_body_length
                    time_seconds = len(frames) / 30.0  # Assuming 30 fps
                    
                    speed = body_lengths_moved / time_seconds * 5  # Normalize to 5 seconds
                    
                    if speed > self.config['temporal_analysis']['gait_detection']['running_speed_threshold']:
                        return TemporalAction.RUNNING_PATTERN, 0.8
                    elif self.config['temporal_analysis']['gait_detection']['walking_speed_range'][0] <= speed <= \
                         self.config['temporal_analysis']['gait_detection']['walking_speed_range'][1]:
                        return TemporalAction.WALKING_PATTERN, 0.75
        
        return TemporalAction.NONE, 0.0
    
    def apply_smoothing(self, buffer: deque, current_state: Any, state_type: str) -> Any:
        """
        Apply smoothing with hysteresis to state transitions
        """
        if len(buffer) < len(buffer) * 0.6:  # Not enough data
            return current_state
        
        # Count state occurrences
        state_counts = Counter(buffer)
        total_count = len(buffer)
        
        # Find most common state
        most_common_state, count = state_counts.most_common(1)[0]
        confidence = count / total_count
        
        # Apply hysteresis
        if confidence >= self.config['single_frame']['min_confidence_threshold']:
            return most_common_state
        elif current_state in state_counts:
            # Bias toward current state
            current_confidence = state_counts[current_state] / total_count
            if current_confidence >= self.config['single_frame']['min_confidence_threshold'] * \
               self.config['single_frame']['hysteresis_factor']:
                return current_state
        
        return most_common_state
    
    def detect_state(self, pose_data: Dict, frame_idx: int, timestamp: float, horse_id: int) -> StateDetectionResult:
        """
        Main state detection function
        
        Args:
            pose_data: Dictionary with keypoints and bbox
            frame_idx: Current frame index
            timestamp: Current timestamp
            horse_id: Horse identifier
        
        Returns:
            StateDetectionResult with all detected states and actions
        """
        self.frame_count += 1
        
        # Extract keypoints and bbox
        keypoints = self.extract_keypoints_dict(pose_data)
        bbox = pose_data.get('bbox', {})
        
        if not keypoints or not bbox:
            return StateDetectionResult(
                frame_idx=frame_idx,
                timestamp=timestamp,
                horse_id=horse_id,
                body_state=BodyState.UNKNOWN,
                body_confidence=0.0,
                body_raw_scores={},
                head_position=HeadPosition.HEAD_NEUTRAL,
                head_confidence=0.0,
                head_angle=0.0,
                pose_data=pose_data.copy()
            )
        
        # Single-frame detection
        body_state, body_conf, body_scores = self.detect_body_state(keypoints, bbox)
        head_pos, head_conf, head_angle = self.detect_head_position(keypoints, bbox)
        
        # Add to smoothing buffers
        self.body_state_buffer.append(body_state)
        self.head_position_buffer.append(head_pos)
        
        # Apply smoothing
        smoothed_body_state = self.apply_smoothing(
            self.body_state_buffer, self.current_body_state, 'body'
        )
        smoothed_head_position = self.apply_smoothing(
            self.head_position_buffer, self.current_head_position, 'head'
        )
        
        # Update current states
        self.current_body_state = smoothed_body_state
        self.current_head_position = smoothed_head_position
        
        # Add to temporal buffers
        self.temporal_buffer_short.append(pose_data)
        self.temporal_buffer_long.append(pose_data)
        
        # Temporal analysis (if enough frames)
        action_1s = None
        action_1s_conf = 0.0
        action_5s = None
        action_5s_conf = 0.0
        
        if len(self.temporal_buffer_short) >= self.config['temporal_analysis']['temporal_window_short'] * 0.6:
            action_1s, action_1s_conf = self.analyze_movement_pattern(list(self.temporal_buffer_short))
        
        if len(self.temporal_buffer_long) >= self.config['temporal_analysis']['temporal_window_long'] * 0.6:
            action_5s, action_5s_conf = self.analyze_movement_pattern(list(self.temporal_buffer_long))
        
        # Check for alerts
        alerts = self.check_for_alerts(smoothed_body_state, smoothed_head_position, action_5s)
        
        # Compile measurements
        measurements = {
            'keypoints_detected': len(keypoints),
            'avg_keypoint_confidence': np.mean([kp['confidence'] for kp in keypoints.values()]),
            'bbox_aspect_ratio': bbox['width'] / bbox['height'] if bbox['height'] > 0 else 1.0,
            'frame_count': self.frame_count
        }
        
        return StateDetectionResult(
            frame_idx=frame_idx,
            timestamp=timestamp,
            horse_id=horse_id,
            body_state=smoothed_body_state,
            body_confidence=body_conf,
            body_raw_scores=body_scores,
            head_position=smoothed_head_position,
            head_confidence=head_conf,
            head_angle=head_angle,
            action_1s=action_1s,
            action_1s_confidence=action_1s_conf,
            action_5s=action_5s,
            action_5s_confidence=action_5s_conf,
            measurements=measurements,
            alerts=alerts,
            pose_data=pose_data.copy()
        )
    
    def check_for_alerts(self, body_state: BodyState, head_position: HeadPosition, 
                         action: Optional[TemporalAction]) -> List[str]:
        """Check for concerning state combinations"""
        alerts = []
        
        # Check for colic signs
        if body_state == BodyState.LYING_DOWN and head_position in [HeadPosition.HEAD_LEFT_BACK, HeadPosition.HEAD_RIGHT_BACK]:
            alerts.append("⚠️ Possible colic: Horse lying down and looking at abdomen")
        
        if action == TemporalAction.PAWING_GROUND and head_position in [HeadPosition.HEAD_LEFT_BACK, HeadPosition.HEAD_RIGHT_BACK]:
            alerts.append("⚠️ Discomfort: Horse pawing and looking back")
        
        return alerts

class AdvancedStateTracker:
    """
    Track states for multiple horses with advanced detection
    """
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path
        self.horse_detectors: Dict[int, AdvancedStateDetector] = {}
        self.horse_states: Dict[int, StateDetectionResult] = {}
        self.timeline_data: List[Dict] = []
    
    def update_horse_state(self, horse_id: int, pose_data: Dict, 
                          frame_idx: int, timestamp: float) -> StateDetectionResult:
        """Update state for a specific horse"""
        
        # Create detector for new horse
        if horse_id not in self.horse_detectors:
            self.horse_detectors[horse_id] = AdvancedStateDetector(self.config_path)
        
        # Detect state
        state_result = self.horse_detectors[horse_id].detect_state(
            pose_data, frame_idx, timestamp, horse_id
        )
        self.horse_states[horse_id] = state_result
        
        # Add to timeline
        self.timeline_data.append(state_result.to_dict())
        
        return state_result
    
    def get_horse_state(self, horse_id: int) -> Optional[StateDetectionResult]:
        """Get current state for a horse"""
        return self.horse_states.get(horse_id)
    
    def get_all_states(self) -> Dict[int, StateDetectionResult]:
        """Get all current horse states"""
        return self.horse_states.copy()
    
    def save_timeline_data(self, output_path: str, format: str = 'json'):
        """Save timeline data to file"""
        import json
        import csv
        
        if format == 'json':
            with open(output_path, 'w') as f:
                json.dump(self.timeline_data, f, indent=2)
        elif format == 'csv':
            if self.timeline_data:
                keys = self.timeline_data[0].keys()
                with open(output_path, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=keys)
                    writer.writeheader()
                    writer.writerows(self.timeline_data)
        
        logger.info(f"Timeline data saved to {output_path}")