"""Pose validation and outlier detection for quality control."""
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from scipy import stats
import logging

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Results from pose validation."""
    is_valid: bool
    confidence: float
    issues: List[str]
    outlier_keypoints: List[int]
    corrected_keypoints: Optional[np.ndarray]


class PoseValidator:
    """Validate and correct horse pose detections."""
    
    def __init__(self, confidence_threshold: float = 0.3):
        """Initialize pose validator.
        
        Args:
            confidence_threshold: Minimum keypoint confidence
        """
        self.confidence_threshold = confidence_threshold
        
        # Anatomical constraints for horses
        self.bone_length_ratios = {
            # Relative lengths (normalized to spine length)
            ("neck", "spine"): (0.6, 0.9),  # Neck is 60-90% of spine
            ("upper_leg", "spine"): (0.4, 0.6),  # Upper leg segments
            ("lower_leg", "upper_leg"): (0.8, 1.2),  # Lower vs upper leg
        }
        
        # Valid angle ranges for joints (degrees)
        self.joint_angle_ranges = {
            "shoulder": (30, 150),
            "elbow": (45, 180),
            "hip": (30, 150),
            "knee": (40, 180),
            "neck": (60, 160),
        }
        
        # Maximum movement between frames (pixels)
        self.max_movement_per_frame = 50
        
        # History for outlier detection
        self.keypoint_history = []
        self.max_history = 30
    
    def check_anatomical_constraints(self, keypoints: np.ndarray) -> Tuple[bool, List[str]]:
        """Check if pose satisfies anatomical constraints.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            
        Returns:
            Tuple of (is_valid, list of issues)
        """
        issues = []
        
        # Check spine length (neck to tail)
        if all(keypoints[[3, 4], 2] > self.confidence_threshold):
            spine_length = np.linalg.norm(keypoints[3, :2] - keypoints[4, :2])
            
            # Check if spine length is reasonable (not too short or long)
            if spine_length < 20:  # Too short
                issues.append("Spine length unusually short")
            elif spine_length > 500:  # Too long
                issues.append("Spine length unusually long")
            
            # Check neck length relative to spine
            if keypoints[2, 2] > self.confidence_threshold:  # Nose
                neck_length = np.linalg.norm(keypoints[2, :2] - keypoints[3, :2])
                neck_ratio = neck_length / spine_length if spine_length > 0 else 0
                
                if neck_ratio < self.bone_length_ratios[("neck", "spine")][0]:
                    issues.append("Neck too short relative to spine")
                elif neck_ratio > self.bone_length_ratios[("neck", "spine")][1]:
                    issues.append("Neck too long relative to spine")
        
        # Check leg proportions
        leg_configs = [
            (5, 6, 7, "front_left"),   # Front left leg
            (8, 9, 10, "front_right"),  # Front right leg
            (11, 12, 13, "back_left"),  # Back left leg
            (14, 15, 16, "back_right")  # Back right leg
        ]
        
        for upper, middle, lower, leg_name in leg_configs:
            if all(keypoints[[upper, middle, lower], 2] > self.confidence_threshold):
                upper_length = np.linalg.norm(keypoints[upper, :2] - keypoints[middle, :2])
                lower_length = np.linalg.norm(keypoints[middle, :2] - keypoints[lower, :2])
                
                if upper_length > 0:
                    ratio = lower_length / upper_length
                    if ratio < self.bone_length_ratios[("lower_leg", "upper_leg")][0]:
                        issues.append(f"{leg_name}: Lower segment too short")
                    elif ratio > self.bone_length_ratios[("lower_leg", "upper_leg")][1]:
                        issues.append(f"{leg_name}: Lower segment too long")
        
        return len(issues) == 0, issues
    
    def detect_outlier_keypoints(self, keypoints: np.ndarray) -> List[int]:
        """Detect outlier keypoints using statistical methods.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            
        Returns:
            List of outlier keypoint indices
        """
        outliers = []
        
        # Add to history
        self.keypoint_history.append(keypoints.copy())
        if len(self.keypoint_history) > self.max_history:
            self.keypoint_history.pop(0)
        
        # Need enough history for statistical analysis
        if len(self.keypoint_history) < 5:
            return outliers
        
        # Check each keypoint against historical distribution
        for kp_idx in range(keypoints.shape[0]):
            if keypoints[kp_idx, 2] < self.confidence_threshold:
                continue
            
            # Get historical positions for this keypoint
            historical_x = [h[kp_idx, 0] for h in self.keypoint_history[:-1] 
                           if h[kp_idx, 2] > self.confidence_threshold]
            historical_y = [h[kp_idx, 1] for h in self.keypoint_history[:-1]
                           if h[kp_idx, 2] > self.confidence_threshold]
            
            if len(historical_x) < 3:
                continue
            
            # Calculate z-scores
            z_score_x = abs(stats.zscore([*historical_x, keypoints[kp_idx, 0]]))[-1]
            z_score_y = abs(stats.zscore([*historical_y, keypoints[kp_idx, 1]]))[-1]
            
            # Flag as outlier if z-score > 3 (99.7% confidence)
            if z_score_x > 3 or z_score_y > 3:
                outliers.append(kp_idx)
        
        return outliers
    
    def check_temporal_consistency(self, 
                                  keypoints: np.ndarray,
                                  prev_keypoints: Optional[np.ndarray]) -> Tuple[bool, List[str]]:
        """Check temporal consistency between frames.
        
        Args:
            keypoints: Current frame keypoints
            prev_keypoints: Previous frame keypoints
            
        Returns:
            Tuple of (is_consistent, list of issues)
        """
        if prev_keypoints is None:
            return True, []
        
        issues = []
        
        for i in range(keypoints.shape[0]):
            # Check only confident keypoints
            if (keypoints[i, 2] > self.confidence_threshold and 
                prev_keypoints[i, 2] > self.confidence_threshold):
                
                movement = np.linalg.norm(keypoints[i, :2] - prev_keypoints[i, :2])
                
                if movement > self.max_movement_per_frame:
                    issues.append(f"Keypoint {i} moved {movement:.1f} pixels (max: {self.max_movement_per_frame})")
        
        return len(issues) == 0, issues
    
    def check_pose_completeness(self, keypoints: np.ndarray) -> Tuple[float, List[str]]:
        """Check how complete the pose detection is.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            
        Returns:
            Tuple of (completeness_score, missing parts)
        """
        missing_parts = []
        keypoint_names = {
            0: "left_eye", 1: "right_eye", 2: "nose",
            3: "neck", 4: "root_of_tail",
            5: "left_shoulder", 6: "left_elbow", 7: "left_front_paw",
            8: "right_shoulder", 9: "right_elbow", 10: "right_front_paw",
            11: "left_hip", 12: "left_knee", 13: "left_back_paw",
            14: "right_hip", 15: "right_knee", 16: "right_back_paw"
        }
        
        # Count confident keypoints
        confident_count = 0
        for i in range(keypoints.shape[0]):
            if keypoints[i, 2] > self.confidence_threshold:
                confident_count += 1
            else:
                missing_parts.append(keypoint_names.get(i, f"keypoint_{i}"))
        
        completeness = confident_count / keypoints.shape[0]
        
        return completeness, missing_parts
    
    def correct_outliers(self, 
                        keypoints: np.ndarray,
                        outlier_indices: List[int]) -> np.ndarray:
        """Correct outlier keypoints using interpolation or prediction.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            outlier_indices: Indices of outlier keypoints
            
        Returns:
            Corrected keypoints
        """
        corrected = keypoints.copy()
        
        if len(self.keypoint_history) < 2:
            # Not enough history, just reduce confidence
            for idx in outlier_indices:
                corrected[idx, 2] *= 0.5
            return corrected
        
        for idx in outlier_indices:
            # Get historical positions
            historical_positions = []
            for h in self.keypoint_history[:-1]:
                if h[idx, 2] > self.confidence_threshold:
                    historical_positions.append(h[idx, :2])
            
            if len(historical_positions) >= 2:
                # Use median of recent positions
                median_pos = np.median(historical_positions[-5:], axis=0)
                corrected[idx, :2] = median_pos
                # Reduce confidence to indicate correction
                corrected[idx, 2] *= 0.7
            else:
                # Just reduce confidence if not enough history
                corrected[idx, 2] *= 0.5
        
        return corrected
    
    def validate_joint_angles(self, joint_angles: Dict[str, float]) -> Tuple[bool, List[str]]:
        """Validate that joint angles are within normal ranges.
        
        Args:
            joint_angles: Dictionary of joint angles in degrees
            
        Returns:
            Tuple of (is_valid, list of issues)
        """
        issues = []
        
        angle_mapping = {
            "front_left_shoulder": "shoulder",
            "front_right_shoulder": "shoulder",
            "back_left_hip": "hip",
            "back_right_hip": "hip",
            "front_left_elbow": "elbow",
            "front_right_elbow": "elbow",
            "back_left_knee": "knee",
            "back_right_knee": "knee",
            "neck": "neck"
        }
        
        for joint_name, angle in joint_angles.items():
            if joint_name in angle_mapping:
                range_key = angle_mapping[joint_name]
                if range_key in self.joint_angle_ranges:
                    min_angle, max_angle = self.joint_angle_ranges[range_key]
                    
                    if angle < min_angle:
                        issues.append(f"{joint_name}: Angle {angle:.1f}° below minimum {min_angle}°")
                    elif angle > max_angle:
                        issues.append(f"{joint_name}: Angle {angle:.1f}° above maximum {max_angle}°")
        
        return len(issues) == 0, issues
    
    def validate(self, 
                keypoints: np.ndarray,
                prev_keypoints: Optional[np.ndarray] = None,
                joint_angles: Optional[Dict[str, float]] = None) -> ValidationResult:
        """Perform complete pose validation.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            prev_keypoints: Optional previous frame keypoints
            joint_angles: Optional pre-calculated joint angles
            
        Returns:
            ValidationResult with validation details
        """
        issues = []
        
        # Check completeness
        completeness, missing_parts = self.check_pose_completeness(keypoints)
        if completeness < 0.5:  # Less than 50% detected
            issues.append(f"Pose incomplete ({completeness:.1%} detected)")
            if len(missing_parts) <= 5:  # List specific parts if not too many
                issues.append(f"Missing: {', '.join(missing_parts[:5])}")
        
        # Check anatomical constraints
        is_anatomical, anatomical_issues = self.check_anatomical_constraints(keypoints)
        issues.extend(anatomical_issues)
        
        # Check temporal consistency
        is_consistent, temporal_issues = self.check_temporal_consistency(keypoints, prev_keypoints)
        issues.extend(temporal_issues)
        
        # Detect outliers
        outlier_keypoints = self.detect_outlier_keypoints(keypoints)
        if outlier_keypoints:
            issues.append(f"Outlier keypoints detected: {outlier_keypoints}")
        
        # Validate joint angles if provided
        if joint_angles:
            angles_valid, angle_issues = self.validate_joint_angles(joint_angles)
            issues.extend(angle_issues)
        
        # Correct outliers if found
        corrected_keypoints = None
        if outlier_keypoints:
            corrected_keypoints = self.correct_outliers(keypoints, outlier_keypoints)
        
        # Calculate overall confidence
        base_confidence = np.mean(keypoints[:, 2])
        
        # Reduce confidence based on issues
        confidence = base_confidence
        if issues:
            confidence *= max(0.3, 1.0 - (len(issues) * 0.1))
        
        # Determine if valid
        is_valid = (
            len(issues) <= 2 and  # Allow minor issues
            confidence > 0.4 and
            completeness > 0.4
        )
        
        return ValidationResult(
            is_valid=is_valid,
            confidence=confidence,
            issues=issues,
            outlier_keypoints=outlier_keypoints,
            corrected_keypoints=corrected_keypoints
        )
    
    def reset(self):
        """Reset the validator's history."""
        self.keypoint_history.clear()