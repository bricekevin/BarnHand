"""Gait classification for horse movement patterns."""
import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from collections import deque
from enum import Enum
import logging

from .pose_analysis import PoseMetrics, PoseAnalyzer

logger = logging.getLogger(__name__)


class GaitType(Enum):
    """Horse gait types."""
    STANDING = "standing"
    WALK = "walk"
    TROT = "trot"
    CANTER = "canter"
    GALLOP = "gallop"
    BACKING = "backing"
    UNKNOWN = "unknown"


class ActionType(Enum):
    """Horse action/behavior types."""
    STANDING = "standing"
    WALKING = "walking"
    RUNNING = "running"
    GRAZING = "grazing"  # Head down, eating
    RESTING = "resting"  # Lying down
    DRINKING = "drinking"  # Head down at water
    ALERT = "alert"  # Head up, ears forward
    PLAYING = "playing"  # Energetic movements
    UNKNOWN = "unknown"


@dataclass
class GaitMetrics:
    """Metrics for gait analysis."""
    gait_type: GaitType
    action_type: ActionType
    confidence: float
    stride_frequency: Optional[float]  # Steps per second
    stride_length: Optional[float]  # Average stride distance
    symmetry_score: float  # 0-1, how symmetric the gait is
    regularity_score: float  # 0-1, how regular the pattern is


class GaitClassifier:
    """Classify horse gaits from pose sequences."""
    
    def __init__(self, window_size: int = 30):
        """Initialize gait classifier.
        
        Args:
            window_size: Number of frames to analyze for classification
        """
        self.window_size = window_size
        self.pose_buffer = deque(maxlen=window_size)
        self.pose_analyzer = PoseAnalyzer()
        
        # Gait characteristic thresholds
        self.velocity_thresholds = {
            GaitType.STANDING: 0.5,
            GaitType.WALK: 2.0,
            GaitType.TROT: 4.0,
            GaitType.CANTER: 6.0,
            GaitType.GALLOP: float('inf')
        }
        
        # Stride frequency ranges (steps/second)
        self.frequency_ranges = {
            GaitType.STANDING: (0, 0.1),
            GaitType.WALK: (0.8, 1.2),
            GaitType.TROT: (1.8, 2.5),
            GaitType.CANTER: (2.5, 3.5),
            GaitType.GALLOP: (3.5, 5.0)
        }
    
    def detect_footfall_pattern(self, 
                                poses: List[Dict[str, np.ndarray]]) -> List[bool]:
        """Detect footfall patterns from pose sequence.
        
        Args:
            poses: List of pose dictionaries with keypoints
            
        Returns:
            List of boolean arrays for each foot contact
        """
        footfall_patterns = {
            "front_left": [],
            "front_right": [],
            "back_left": [],
            "back_right": []
        }
        
        # Keypoint indices for hooves
        hoof_indices = {
            "front_left": 7,
            "front_right": 10,
            "back_left": 13,
            "back_right": 16
        }
        
        prev_positions = {}
        
        for pose in poses:
            keypoints = pose["keypoints"]
            
            for leg, idx in hoof_indices.items():
                if keypoints[idx, 2] > 0.3:  # If confident
                    current_pos = keypoints[idx, :2]
                    
                    # Check if hoof is stationary (in contact with ground)
                    if leg in prev_positions:
                        movement = np.linalg.norm(current_pos - prev_positions[leg])
                        # Hoof is in contact if movement is minimal
                        is_contact = movement < 2.0  # Threshold in pixels
                        footfall_patterns[leg].append(is_contact)
                    else:
                        footfall_patterns[leg].append(False)
                    
                    prev_positions[leg] = current_pos
                else:
                    footfall_patterns[leg].append(False)
        
        return footfall_patterns
    
    def calculate_stride_frequency(self, 
                                  footfall_patterns: Dict[str, List[bool]],
                                  fps: float = 30.0) -> float:
        """Calculate stride frequency from footfall patterns.
        
        Args:
            footfall_patterns: Dictionary of foot contact patterns
            fps: Frames per second
            
        Returns:
            Stride frequency in steps per second
        """
        total_steps = 0
        
        for leg, pattern in footfall_patterns.items():
            if len(pattern) < 2:
                continue
            
            # Count transitions from contact to no-contact (steps)
            steps = 0
            for i in range(1, len(pattern)):
                if pattern[i-1] and not pattern[i]:  # Liftoff
                    steps += 1
            
            total_steps += steps
        
        # Calculate frequency
        duration_seconds = len(list(footfall_patterns.values())[0]) / fps
        if duration_seconds > 0:
            return total_steps / duration_seconds
        
        return 0.0
    
    def calculate_gait_symmetry(self,
                               footfall_patterns: Dict[str, List[bool]]) -> float:
        """Calculate gait symmetry score.
        
        Args:
            footfall_patterns: Dictionary of foot contact patterns
            
        Returns:
            Symmetry score (0-1)
        """
        # Compare left vs right patterns
        left_pattern = []
        right_pattern = []
        
        if "front_left" in footfall_patterns and "back_left" in footfall_patterns:
            left_pattern = [
                a or b for a, b in 
                zip(footfall_patterns["front_left"], footfall_patterns["back_left"])
            ]
        
        if "front_right" in footfall_patterns and "back_right" in footfall_patterns:
            right_pattern = [
                a or b for a, b in
                zip(footfall_patterns["front_right"], footfall_patterns["back_right"])
            ]
        
        if len(left_pattern) == 0 or len(right_pattern) == 0:
            return 0.0
        
        # Calculate correlation between patterns
        left_float = np.array(left_pattern, dtype=float)
        right_float = np.array(right_pattern, dtype=float)
        
        if np.std(left_float) > 0 and np.std(right_float) > 0:
            correlation = np.corrcoef(left_float, right_float)[0, 1]
            # Convert correlation to 0-1 score
            symmetry = (correlation + 1) / 2
            return max(0, min(1, symmetry))
        
        return 0.5
    
    def classify_gait_from_pattern(self,
                                   frequency: float,
                                   velocity: Optional[float]) -> GaitType:
        """Classify gait type from frequency and velocity.
        
        Args:
            frequency: Stride frequency in steps/second
            velocity: Movement velocity
            
        Returns:
            Classified gait type
        """
        # Use velocity if available
        if velocity is not None:
            for gait, threshold in sorted(
                self.velocity_thresholds.items(), 
                key=lambda x: x[1]
            ):
                if velocity < threshold:
                    return gait
        
        # Otherwise use frequency
        for gait, (min_freq, max_freq) in self.frequency_ranges.items():
            if min_freq <= frequency <= max_freq:
                return gait
        
        # Default based on frequency alone
        if frequency < 0.1:
            return GaitType.STANDING
        elif frequency < 1.5:
            return GaitType.WALK
        elif frequency < 2.5:
            return GaitType.TROT
        elif frequency < 3.5:
            return GaitType.CANTER
        else:
            return GaitType.GALLOP
    
    def classify_action(self, 
                       pose_metrics: PoseMetrics,
                       gait_type: GaitType) -> ActionType:
        """Classify horse action/behavior from pose.
        
        Args:
            pose_metrics: Analyzed pose metrics
            gait_type: Detected gait type
            
        Returns:
            Classified action type
        """
        # Head position relative to body
        head_low = pose_metrics.head_height > 200  # Head below threshold
        
        # Check if lying down (low center of mass)
        if pose_metrics.center_of_mass[1] > 300:  # Low position
            return ActionType.RESTING
        
        # Check based on gait
        if gait_type == GaitType.STANDING:
            if head_low:
                # Head down while standing = grazing or drinking
                if pose_metrics.back_angle < 20:  # Straight back
                    return ActionType.GRAZING
                else:
                    return ActionType.DRINKING
            else:
                # Head up while standing
                if pose_metrics.joint_angles.get("neck", 0) < 90:
                    return ActionType.ALERT
                else:
                    return ActionType.STANDING
        
        elif gait_type in [GaitType.WALK, GaitType.BACKING]:
            return ActionType.WALKING
        
        elif gait_type in [GaitType.TROT, GaitType.CANTER, GaitType.GALLOP]:
            # Check for playful behavior (irregular patterns)
            if hasattr(self, 'last_metrics') and self.last_metrics:
                # Large changes in direction or speed = playing
                if pose_metrics.velocity and self.last_metrics.velocity:
                    speed_change = abs(pose_metrics.velocity - self.last_metrics.velocity)
                    if speed_change > 2.0:  # Sudden speed changes
                        return ActionType.PLAYING
            return ActionType.RUNNING
        
        return ActionType.UNKNOWN
    
    def add_pose(self, 
                keypoints: np.ndarray,
                timestamp: float) -> None:
        """Add a pose to the buffer for analysis.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            timestamp: Timestamp of the frame
        """
        self.pose_buffer.append({
            "keypoints": keypoints,
            "timestamp": timestamp,
            "metrics": self.pose_analyzer.analyze_pose(keypoints, timestamp)
        })
    
    def classify(self, fps: float = 30.0) -> Optional[GaitMetrics]:
        """Classify gait from buffered poses.
        
        Args:
            fps: Frames per second of the video
            
        Returns:
            GaitMetrics if enough data, None otherwise
        """
        if len(self.pose_buffer) < 10:  # Need minimum frames
            return None
        
        # Extract footfall patterns
        footfall_patterns = self.detect_footfall_pattern(list(self.pose_buffer))
        
        # Calculate metrics
        stride_frequency = self.calculate_stride_frequency(footfall_patterns, fps)
        symmetry_score = self.calculate_gait_symmetry(footfall_patterns)
        
        # Get average velocity from pose metrics
        velocities = [
            p["metrics"].velocity 
            for p in self.pose_buffer 
            if p["metrics"].velocity is not None
        ]
        avg_velocity = np.mean(velocities) if velocities else None
        
        # Get average stride length
        stride_lengths = [
            p["metrics"].stride_length 
            for p in self.pose_buffer 
            if p["metrics"].stride_length is not None
        ]
        avg_stride = np.mean(stride_lengths) if stride_lengths else None
        
        # Classify gait type
        gait_type = self.classify_gait_from_pattern(stride_frequency, avg_velocity)
        
        # Classify action type
        latest_metrics = self.pose_buffer[-1]["metrics"]
        action_type = self.classify_action(latest_metrics, gait_type)
        
        # Store for next comparison
        self.last_metrics = latest_metrics
        
        # Calculate regularity (standard deviation of stride intervals)
        regularity_score = 1.0  # Default to regular
        if len(footfall_patterns.get("front_left", [])) > 0:
            pattern = footfall_patterns["front_left"]
            intervals = []
            last_contact = None
            
            for i, contact in enumerate(pattern):
                if contact and last_contact is not None:
                    intervals.append(i - last_contact)
                if contact:
                    last_contact = i
            
            if len(intervals) > 1:
                std_dev = np.std(intervals)
                mean_interval = np.mean(intervals)
                if mean_interval > 0:
                    # Normalize standard deviation
                    regularity_score = max(0, 1 - (std_dev / mean_interval))
        
        # Calculate confidence based on data quality
        confidence = np.mean([p["metrics"].confidence for p in self.pose_buffer])
        
        return GaitMetrics(
            gait_type=gait_type,
            action_type=action_type,
            confidence=confidence,
            stride_frequency=stride_frequency,
            stride_length=avg_stride,
            symmetry_score=symmetry_score,
            regularity_score=regularity_score
        )
    
    def reset(self):
        """Reset the classifier buffer."""
        self.pose_buffer.clear()
        self.pose_analyzer.pose_history.clear()
        if hasattr(self, 'last_metrics'):
            delattr(self, 'last_metrics')