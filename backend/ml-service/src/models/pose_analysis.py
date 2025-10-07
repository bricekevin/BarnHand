"""Horse pose analysis and biomechanical calculations."""
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from scipy.signal import savgol_filter
from scipy.interpolate import interp1d
import logging

logger = logging.getLogger(__name__)


# AP10K keypoint indices for quadrupeds
KEYPOINT_NAMES = {
    0: "left_eye",
    1: "right_eye",
    2: "nose",
    3: "neck",
    4: "root_of_tail",
    5: "left_shoulder",
    6: "left_elbow",
    7: "left_front_paw",
    8: "right_shoulder",
    9: "right_elbow",
    10: "right_front_paw",
    11: "left_hip",
    12: "left_knee",
    13: "left_back_paw",
    14: "right_hip",
    15: "right_knee",
    16: "right_back_paw"
}

# Joint connections for skeletal structure
SKELETON_CONNECTIONS = [
    (0, 2), (1, 2), (2, 3),  # Head
    (3, 4),  # Spine
    (3, 5), (5, 6), (6, 7),  # Left front leg
    (3, 8), (8, 9), (9, 10),  # Right front leg
    (4, 11), (11, 12), (12, 13),  # Left back leg
    (4, 14), (14, 15), (15, 16),  # Right back leg
]


@dataclass
class PoseMetrics:
    """Container for biomechanical metrics from pose analysis."""
    joint_angles: Dict[str, float]  # Angles in degrees
    stride_length: Optional[float]  # Distance between hooves
    back_angle: float  # Spine curvature
    head_height: float  # Height of head relative to body
    leg_extension: Dict[str, float]  # Extension percentage per leg
    center_of_mass: Tuple[float, float]  # Estimated CoM position
    velocity: Optional[float]  # Movement velocity if tracking
    confidence: float  # Overall pose confidence


class PoseAnalyzer:
    """Analyze horse poses for biomechanical metrics."""
    
    def __init__(self, confidence_threshold: float = 0.3):
        """Initialize pose analyzer.
        
        Args:
            confidence_threshold: Minimum keypoint confidence
        """
        self.confidence_threshold = confidence_threshold
        self.pose_history = []  # Store recent poses for temporal analysis
        self.max_history_length = 30  # ~1 second at 30fps
        
    def calculate_angle(self, 
                       p1: Tuple[float, float], 
                       p2: Tuple[float, float], 
                       p3: Tuple[float, float]) -> float:
        """Calculate angle at p2 formed by p1-p2-p3.
        
        Args:
            p1, p2, p3: Points as (x, y) tuples
            
        Returns:
            Angle in degrees
        """
        # Vectors
        v1 = np.array(p1) - np.array(p2)
        v2 = np.array(p3) - np.array(p2)
        
        # Handle zero vectors
        if np.linalg.norm(v1) == 0 or np.linalg.norm(v2) == 0:
            return 0.0
        
        # Calculate angle using dot product
        cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
        cos_angle = np.clip(cos_angle, -1.0, 1.0)
        angle = np.degrees(np.arccos(cos_angle))
        
        return angle
    
    def calculate_joint_angles(self, keypoints: np.ndarray) -> Dict[str, float]:
        """Calculate important joint angles from keypoints.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            
        Returns:
            Dictionary of joint angles
        """
        angles = {}
        
        # Ensure keypoints is a numpy array with proper shape
        if not isinstance(keypoints, np.ndarray):
            keypoints = np.array(keypoints)
        
        if keypoints.shape[0] < 17:
            return angles  # Not enough keypoints
        
        # Front left leg angles
        indices = [5, 6, 7]
        if all(idx < len(keypoints) and keypoints[idx, 2] > self.confidence_threshold for idx in indices):
            angles["front_left_shoulder"] = self.calculate_angle(
                keypoints[3, :2], keypoints[5, :2], keypoints[6, :2]
            )
            angles["front_left_elbow"] = self.calculate_angle(
                keypoints[5, :2], keypoints[6, :2], keypoints[7, :2]
            )
        
        # Front right leg angles
        indices = [8, 9, 10]
        if all(idx < len(keypoints) and keypoints[idx, 2] > self.confidence_threshold for idx in indices):
            angles["front_right_shoulder"] = self.calculate_angle(
                keypoints[3, :2], keypoints[8, :2], keypoints[9, :2]
            )
            angles["front_right_elbow"] = self.calculate_angle(
                keypoints[8, :2], keypoints[9, :2], keypoints[10, :2]
            )
        
        # Back left leg angles
        indices = [11, 12, 13]
        if all(idx < len(keypoints) and keypoints[idx, 2] > self.confidence_threshold for idx in indices):
            angles["back_left_hip"] = self.calculate_angle(
                keypoints[4, :2], keypoints[11, :2], keypoints[12, :2]
            )
            angles["back_left_knee"] = self.calculate_angle(
                keypoints[11, :2], keypoints[12, :2], keypoints[13, :2]
            )
        
        # Back right leg angles
        indices = [14, 15, 16]
        if all(idx < len(keypoints) and keypoints[idx, 2] > self.confidence_threshold for idx in indices):
            angles["back_right_hip"] = self.calculate_angle(
                keypoints[4, :2], keypoints[14, :2], keypoints[15, :2]
            )
            angles["back_right_knee"] = self.calculate_angle(
                keypoints[14, :2], keypoints[15, :2], keypoints[16, :2]
            )
        
        # Neck angle
        indices = [2, 3, 4]
        if all(idx < len(keypoints) and keypoints[idx, 2] > self.confidence_threshold for idx in indices):
            angles["neck"] = self.calculate_angle(
                keypoints[2, :2], keypoints[3, :2], keypoints[4, :2]
            )
        
        return angles
    
    def calculate_stride_metrics(self, keypoints: np.ndarray) -> Dict[str, float]:
        """Calculate stride and gait metrics.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            
        Returns:
            Dictionary with stride metrics
        """
        metrics = {}
        
        # Ensure keypoints is a numpy array with proper shape
        if not isinstance(keypoints, np.ndarray):
            keypoints = np.array(keypoints)
        
        if keypoints.shape[0] < 17:
            return metrics  # Not enough keypoints
        
        # Front hooves distance (stride width)
        if 7 < len(keypoints) and 10 < len(keypoints) and \
           keypoints[7, 2] > self.confidence_threshold and keypoints[10, 2] > self.confidence_threshold:
            front_distance = np.linalg.norm(
                keypoints[7, :2] - keypoints[10, :2]
            )
            metrics["front_stride_width"] = front_distance
        
        # Back hooves distance
        if 13 < len(keypoints) and 16 < len(keypoints) and \
           keypoints[13, 2] > self.confidence_threshold and keypoints[16, 2] > self.confidence_threshold:
            back_distance = np.linalg.norm(
                keypoints[13, :2] - keypoints[16, :2]
            )
            metrics["back_stride_width"] = back_distance
        
        # Diagonal stride (left front to right back)
        if 7 < len(keypoints) and 16 < len(keypoints) and \
           keypoints[7, 2] > self.confidence_threshold and keypoints[16, 2] > self.confidence_threshold:
            diagonal_distance = np.linalg.norm(
                keypoints[7, :2] - keypoints[16, :2]
            )
            metrics["diagonal_stride"] = diagonal_distance
        
        return metrics
    
    def calculate_back_angle(self, keypoints: np.ndarray) -> float:
        """Calculate spine/back curvature angle.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            
        Returns:
            Back angle in degrees (0 = straight)
        """
        # Ensure keypoints is a numpy array with proper shape
        if not isinstance(keypoints, np.ndarray):
            keypoints = np.array(keypoints)
        
        if keypoints.shape[0] < 5:
            return 0.0  # Not enough keypoints
        
        # Check if spine keypoints are valid
        if 3 < len(keypoints) and 4 < len(keypoints) and \
           keypoints[3, 2] > self.confidence_threshold and keypoints[4, 2] > self.confidence_threshold:
            # Get neck and tail base positions
            neck = keypoints[3, :2]
            tail = keypoints[4, :2]
            
            # Calculate angle from horizontal
            dx = tail[0] - neck[0]
            dy = tail[1] - neck[1]
            angle = np.degrees(np.arctan2(dy, dx))
            
            return abs(angle)  # Return absolute angle
        
        return 0.0
    
    def estimate_center_of_mass(self, keypoints: np.ndarray) -> Tuple[float, float]:
        """Estimate center of mass from keypoints.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            
        Returns:
            Estimated (x, y) center of mass
        """
        # Use confident keypoints with body part weights
        weights = {
            3: 0.2,  # Neck - heavier
            4: 0.2,  # Tail base - heavier
            5: 0.075, 6: 0.05, 7: 0.025,  # Left front leg
            8: 0.075, 9: 0.05, 10: 0.025,  # Right front leg
            11: 0.075, 12: 0.05, 13: 0.025,  # Left back leg
            14: 0.075, 15: 0.05, 16: 0.025,  # Right back leg
        }
        
        total_weight = 0
        weighted_sum = np.zeros(2)
        
        # Ensure keypoints is a numpy array with proper shape
        if not isinstance(keypoints, np.ndarray):
            keypoints = np.array(keypoints)
        
        for idx, weight in weights.items():
            if idx < len(keypoints) and keypoints[idx, 2] > self.confidence_threshold:
                weighted_sum += keypoints[idx, :2] * weight
                total_weight += weight
        
        if total_weight > 0:
            return tuple(weighted_sum / total_weight)
        else:
            # Fallback to geometric center of confident points
            confident_points = keypoints[keypoints[:, 2] > self.confidence_threshold, :2]
            if len(confident_points) > 0:
                return tuple(confident_points.mean(axis=0))
            return (0.0, 0.0)
    
    def smooth_keypoints(self, 
                        keypoints_sequence: List[np.ndarray],
                        window_length: int = 5) -> List[np.ndarray]:
        """Apply Savitzky-Golay filter for temporal smoothing.
        
        Args:
            keypoints_sequence: List of keypoint arrays
            window_length: Smoothing window size (must be odd)
            
        Returns:
            Smoothed keypoint sequence
        """
        if len(keypoints_sequence) < window_length:
            return keypoints_sequence
        
        # Ensure window length is odd
        if window_length % 2 == 0:
            window_length += 1
        
        smoothed = []
        n_frames = len(keypoints_sequence)
        n_keypoints = keypoints_sequence[0].shape[0]
        
        for kp_idx in range(n_keypoints):
            # Extract x, y, confidence across frames
            x_vals = [kps[kp_idx, 0] for kps in keypoints_sequence]
            y_vals = [kps[kp_idx, 1] for kps in keypoints_sequence]
            c_vals = [kps[kp_idx, 2] for kps in keypoints_sequence]
            
            # Only smooth if confidence is sufficient
            if np.mean(c_vals) > self.confidence_threshold:
                # Apply Savitzky-Golay filter
                x_smooth = savgol_filter(x_vals, window_length, 2)
                y_smooth = savgol_filter(y_vals, window_length, 2)
                
                # Rebuild smoothed keypoints
                for frame_idx in range(n_frames):
                    if frame_idx >= len(smoothed):
                        smoothed.append(np.zeros_like(keypoints_sequence[0]))
                    
                    # Ensure proper array dimensions before indexing
                    try:
                        if len(smoothed[frame_idx].shape) >= 2 and smoothed[frame_idx].shape[0] > kp_idx:
                            smoothed[frame_idx][kp_idx] = [
                                x_smooth[frame_idx],
                                y_smooth[frame_idx],
                                c_vals[frame_idx]
                            ]
                        else:
                            # Skip if array structure is wrong
                            continue
                    except (IndexError, AttributeError) as e:
                        # Skip problematic keypoint indexing
                        continue
            else:
                # Keep original if confidence too low
                for frame_idx in range(n_frames):
                    if frame_idx >= len(smoothed):
                        smoothed.append(np.zeros_like(keypoints_sequence[0]))
                    
                    try:
                        if (len(smoothed[frame_idx].shape) >= 2 and 
                            smoothed[frame_idx].shape[0] > kp_idx and
                            len(keypoints_sequence[frame_idx].shape) >= 2 and
                            keypoints_sequence[frame_idx].shape[0] > kp_idx):
                            smoothed[frame_idx][kp_idx] = keypoints_sequence[frame_idx][kp_idx]
                    except (IndexError, AttributeError):
                        # Skip problematic keypoint indexing
                        continue
        
        return smoothed
    
    def interpolate_missing_keypoints(self,
                                     keypoints: np.ndarray,
                                     prev_keypoints: Optional[np.ndarray] = None,
                                     next_keypoints: Optional[np.ndarray] = None) -> np.ndarray:
        """Interpolate missing keypoints using temporal neighbors.
        
        Args:
            keypoints: Current frame keypoints
            prev_keypoints: Previous frame keypoints
            next_keypoints: Next frame keypoints
            
        Returns:
            Keypoints with interpolated values
        """
        interpolated = keypoints.copy()
        
        for i in range(keypoints.shape[0]):
            # If current keypoint has low confidence
            if keypoints[i, 2] < self.confidence_threshold:
                valid_points = []
                
                # Collect valid neighboring points
                if prev_keypoints is not None and prev_keypoints[i, 2] > self.confidence_threshold:
                    valid_points.append(prev_keypoints[i, :2])
                if next_keypoints is not None and next_keypoints[i, 2] > self.confidence_threshold:
                    valid_points.append(next_keypoints[i, :2])
                
                # Interpolate if we have valid neighbors
                if len(valid_points) > 0:
                    interpolated[i, :2] = np.mean(valid_points, axis=0)
                    # Set confidence as average of neighbors
                    interpolated[i, 2] = self.confidence_threshold
        
        return interpolated
    
    def analyze_pose(self, 
                     keypoints: np.ndarray,
                     timestamp: Optional[float] = None) -> PoseMetrics:
        """Perform complete pose analysis.
        
        Args:
            keypoints: Array of shape (17, 3) with (x, y, confidence)
            timestamp: Optional timestamp for temporal analysis
            
        Returns:
            PoseMetrics with all calculated values
        """
        # Add to history for temporal analysis
        if timestamp is not None:
            self.pose_history.append({
                "timestamp": timestamp,
                "keypoints": keypoints.copy()
            })
            # Keep only recent history
            if len(self.pose_history) > self.max_history_length:
                self.pose_history.pop(0)
        
        # Calculate metrics
        joint_angles = self.calculate_joint_angles(keypoints)
        stride_metrics = self.calculate_stride_metrics(keypoints)
        back_angle = self.calculate_back_angle(keypoints)
        center_of_mass = self.estimate_center_of_mass(keypoints)
        
        # Calculate head height
        head_height = 0.0
        if keypoints[2, 2] > self.confidence_threshold:  # Nose
            head_height = keypoints[2, 1]
        
        # Calculate leg extension percentages
        leg_extension = {}
        if "front_left_elbow" in joint_angles:
            # More extended = larger angle
            leg_extension["front_left"] = min(joint_angles["front_left_elbow"] / 180.0, 1.0)
        if "front_right_elbow" in joint_angles:
            leg_extension["front_right"] = min(joint_angles["front_right_elbow"] / 180.0, 1.0)
        if "back_left_knee" in joint_angles:
            leg_extension["back_left"] = min(joint_angles["back_left_knee"] / 180.0, 1.0)
        if "back_right_knee" in joint_angles:
            leg_extension["back_right"] = min(joint_angles["back_right_knee"] / 180.0, 1.0)
        
        # Calculate overall confidence
        confidence = np.mean(keypoints[:, 2])
        
        # Estimate velocity if we have history
        velocity = None
        if len(self.pose_history) >= 2:
            prev_com = self.estimate_center_of_mass(self.pose_history[-2]["keypoints"])
            dt = timestamp - self.pose_history[-2]["timestamp"] if timestamp else 1.0
            if dt > 0:
                velocity = np.linalg.norm(np.array(center_of_mass) - np.array(prev_com)) / dt
        
        return PoseMetrics(
            joint_angles=joint_angles,
            stride_length=stride_metrics.get("diagonal_stride"),
            back_angle=back_angle,
            head_height=head_height,
            leg_extension=leg_extension,
            center_of_mass=center_of_mass,
            velocity=velocity,
            confidence=confidence
        )