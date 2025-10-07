#!/usr/bin/env python3
"""
Simple Horse State Detection
Detects one of four basic states per horse: standing, walking, running, lying down
Uses reliable geometric and movement analysis for accurate classification
"""

import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import math
from collections import deque

class HorseState(Enum):
    """Simple horse states - only one active per horse"""
    STANDING = "standing"
    WALKING = "walking" 
    RUNNING = "running"
    LYING_DOWN = "lying_down"
    UNKNOWN = "unknown"

@dataclass
class SimpleStateResult:
    """Simple state detection result"""
    state: HorseState
    confidence: float
    measurements: Dict[str, float]  # Raw measurements for debugging
    
    def to_dict(self) -> Dict:
        return {
            'state': self.state.value,
            'confidence': self.confidence,
            'measurements': self.measurements
        }

class SimpleStateDetector:
    """
    Simple, reliable horse state detector
    Focus on getting the basics right with minimal false positives
    """
    
    def __init__(self, history_length: int = 10):
        """
        Initialize simple state detector
        
        Args:
            history_length: Number of frames to keep for movement analysis
        """
        self.history_length = history_length
        self.pose_history: deque = deque(maxlen=history_length)
        self.current_state = HorseState.UNKNOWN
        
        # Keypoint names for RTMPose AP10K
        self.keypoint_names = [
            'Nose', 'L_Eye', 'R_Eye', 'Neck', 'L_Shoulder', 'R_Shoulder',
            'L_Elbow', 'R_Elbow', 'L_F_Paw', 'R_F_Paw', 'Root_of_tail',
            'L_Hip', 'R_Hip', 'L_Knee', 'R_Knee', 'L_B_Paw', 'R_B_Paw'
        ]
        
    def extract_keypoints_dict(self, pose_data: Dict) -> Dict[str, Dict]:
        """Extract keypoints as dictionary for easier access"""
        keypoints_dict = {}
        
        if not pose_data or not pose_data.get('keypoints'):
            return keypoints_dict
            
        keypoints = pose_data['keypoints']
        
        # Handle keypoint format: [{'name': 'Nose', 'x': 100, 'y': 200, 'confidence': 0.9}, ...]
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
    
    def calculate_height_ratio(self, keypoints_dict: Dict[str, Dict]) -> Optional[float]:
        """
        Calculate body height to bbox height ratio
        This is the most reliable indicator for standing vs lying
        """
        # Get shoulder points
        left_shoulder = keypoints_dict.get('L_Shoulder', {})
        right_shoulder = keypoints_dict.get('R_Shoulder', {}) 
        
        # Get paw points (ground level)
        left_front_paw = keypoints_dict.get('L_F_Paw', {})
        right_front_paw = keypoints_dict.get('R_F_Paw', {})
        left_back_paw = keypoints_dict.get('L_B_Paw', {})
        right_back_paw = keypoints_dict.get('R_B_Paw', {})
        
        # Need at least one shoulder and one paw
        shoulders = [s for s in [left_shoulder, right_shoulder] if s.get('confidence', 0) > 0.4]
        paws = [p for p in [left_front_paw, right_front_paw, left_back_paw, right_back_paw] 
                if p.get('confidence', 0) > 0.4]
        
        if not shoulders or not paws:
            return None
        
        # Calculate average shoulder and paw levels
        shoulder_y = np.mean([s['y'] for s in shoulders])
        paw_y = np.mean([p['y'] for p in paws])
        
        # Body height (vertical distance from shoulders to paws)
        body_height = abs(shoulder_y - paw_y)
        
        # Estimate bbox height from all keypoints
        all_valid_points = [kp for kp in keypoints_dict.values() if kp.get('confidence', 0) > 0.3]
        if len(all_valid_points) < 3:
            return None
        
        y_coords = [kp['y'] for kp in all_valid_points]
        bbox_height = max(y_coords) - min(y_coords)
        
        if bbox_height <= 0:
            return None
        
        height_ratio = body_height / bbox_height
        return height_ratio
    
    def calculate_movement_velocity(self, keypoints_dict: Dict[str, Dict]) -> Optional[float]:
        """
        Calculate average keypoint movement between frames
        Used to distinguish walking/running from standing
        """
        if len(self.pose_history) < 2:
            return None
        
        # Get previous pose
        prev_pose = self.pose_history[-1] 
        prev_keypoints = self.extract_keypoints_dict(prev_pose)
        
        # Calculate movement for reliable keypoints
        movements = []
        reliable_keypoints = ['Neck', 'L_Shoulder', 'R_Shoulder', 'L_Hip', 'R_Hip']
        
        for kp_name in reliable_keypoints:
            if (kp_name in keypoints_dict and kp_name in prev_keypoints and
                keypoints_dict[kp_name].get('confidence', 0) > 0.4 and
                prev_keypoints[kp_name].get('confidence', 0) > 0.4):
                
                curr_pos = (keypoints_dict[kp_name]['x'], keypoints_dict[kp_name]['y'])
                prev_pos = (prev_keypoints[kp_name]['x'], prev_keypoints[kp_name]['y'])
                
                movement = math.sqrt(
                    (curr_pos[0] - prev_pos[0])**2 + 
                    (curr_pos[1] - prev_pos[1])**2
                )
                movements.append(movement)
        
        if not movements:
            return None
        
        return np.mean(movements)
    
    def calculate_leg_movement(self, keypoints_dict: Dict[str, Dict]) -> Optional[float]:
        """
        Calculate specific leg movement to distinguish walking from body drift
        Legs should show more movement than body during walking/running
        """
        if len(self.pose_history) < 2:
            return None
        
        # Get previous pose
        prev_pose = self.pose_history[-1]
        prev_keypoints = self.extract_keypoints_dict(prev_pose)
        
        # Calculate movement specifically for legs/paws
        leg_movements = []
        leg_keypoints = ['L_F_Paw', 'R_F_Paw', 'L_B_Paw', 'R_B_Paw', 'L_Knee', 'R_Knee']
        
        for kp_name in leg_keypoints:
            if (kp_name in keypoints_dict and kp_name in prev_keypoints and
                keypoints_dict[kp_name].get('confidence', 0) > 0.4 and
                prev_keypoints[kp_name].get('confidence', 0) > 0.4):
                
                curr_pos = (keypoints_dict[kp_name]['x'], keypoints_dict[kp_name]['y'])
                prev_pos = (prev_keypoints[kp_name]['x'], prev_keypoints[kp_name]['y'])
                
                movement = math.sqrt(
                    (curr_pos[0] - prev_pos[0])**2 + 
                    (curr_pos[1] - prev_pos[1])**2
                )
                leg_movements.append(movement)
        
        if not leg_movements:
            return None
        
        return np.mean(leg_movements)
    
    def detect_state(self, pose_data: Dict) -> SimpleStateResult:
        """
        Main state detection function
        Returns one of: standing, walking, running, lying_down
        """
        keypoints_dict = self.extract_keypoints_dict(pose_data)
        
        if not keypoints_dict:
            return SimpleStateResult(
                state=HorseState.UNKNOWN,
                confidence=0.0,
                measurements={}
            )
        
        # Calculate measurements
        height_ratio = self.calculate_height_ratio(keypoints_dict)
        movement_velocity = self.calculate_movement_velocity(keypoints_dict)
        leg_movement = self.calculate_leg_movement(keypoints_dict)
        
        measurements = {
            'height_ratio': height_ratio or 0.0,
            'movement_velocity': movement_velocity or 0.0,
            'leg_movement': leg_movement or 0.0,
            'keypoints_detected': len(keypoints_dict)
        }
        
        # State detection logic
        detected_state, confidence = self._classify_state(height_ratio, movement_velocity, leg_movement)
        
        # Update history
        self.pose_history.append(pose_data)
        self.current_state = detected_state
        
        return SimpleStateResult(
            state=detected_state,
            confidence=confidence,
            measurements=measurements
        )
    
    def _classify_state(self, height_ratio: Optional[float], 
                       movement_velocity: Optional[float],
                       leg_movement: Optional[float]) -> Tuple[HorseState, float]:
        """
        Classify state based on measurements with clear thresholds
        Priority: lying vs standing first, then movement analysis
        """
        
        # Step 1: Lying vs Standing (most reliable)
        if height_ratio is not None:
            if height_ratio < 0.3:  # Low height ratio = lying down
                return HorseState.LYING_DOWN, 0.90
            elif height_ratio > 0.45:  # High height ratio = upright
                # Step 2: Movement analysis for upright horses
                if movement_velocity is not None and leg_movement is not None:
                    
                    # Very little movement = standing
                    if movement_velocity < 3.0 and leg_movement < 5.0:
                        return HorseState.STANDING, 0.85
                    
                    # High movement = running
                    elif movement_velocity > 15.0 or leg_movement > 20.0:
                        return HorseState.RUNNING, 0.80
                    
                    # Moderate movement = walking  
                    elif movement_velocity > 5.0 or leg_movement > 8.0:
                        return HorseState.WALKING, 0.75
                    
                    else:
                        # Default to standing for upright horse with unclear movement
                        return HorseState.STANDING, 0.70
                
                else:
                    # No movement data, but clearly upright
                    return HorseState.STANDING, 0.60
            
            else:
                # Intermediate height ratio - unclear state
                return HorseState.UNKNOWN, 0.30
        
        # No reliable height data
        return HorseState.UNKNOWN, 0.0
    
    def get_state_confidence(self) -> float:
        """Get confidence in current state detection"""
        return 0.8 if self.current_state != HorseState.UNKNOWN else 0.0

class SimpleStateTracker:
    """
    Track states for multiple horses
    Maintains one state per horse with history
    """
    
    def __init__(self):
        self.horse_detectors: Dict[int, SimpleStateDetector] = {}
        self.horse_states: Dict[int, SimpleStateResult] = {}
    
    def update_horse_state(self, horse_id: int, pose_data: Dict) -> SimpleStateResult:
        """Update state for a specific horse"""
        
        # Create detector for new horse
        if horse_id not in self.horse_detectors:
            self.horse_detectors[horse_id] = SimpleStateDetector()
        
        # Detect state
        state_result = self.horse_detectors[horse_id].detect_state(pose_data)
        self.horse_states[horse_id] = state_result
        
        return state_result
    
    def get_horse_state(self, horse_id: int) -> Optional[SimpleStateResult]:
        """Get current state for a horse"""
        return self.horse_states.get(horse_id)
    
    def get_all_states(self) -> Dict[int, SimpleStateResult]:
        """Get all current horse states"""
        return self.horse_states.copy()
    
    def get_state_summary(self) -> Dict:
        """Get summary of all horse states"""
        state_counts = {}
        total_confidence = 0.0
        
        for state_result in self.horse_states.values():
            state_name = state_result.state.value
            state_counts[state_name] = state_counts.get(state_name, 0) + 1
            total_confidence += state_result.confidence
        
        avg_confidence = total_confidence / len(self.horse_states) if self.horse_states else 0.0
        
        return {
            'total_horses': len(self.horse_states),
            'state_distribution': state_counts,
            'average_confidence': avg_confidence
        }