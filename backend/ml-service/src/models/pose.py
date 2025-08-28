"""RTMPose model for horse pose estimation."""
import time
import math
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np
import torch
from loguru import logger

from ..config.settings import settings


class HorsePoseModel:
    """RTMPose-based pose estimation for horses."""
    
    # AP10K keypoints for horses (17 keypoints)
    KEYPOINT_NAMES = [
        "nose", "left_eye", "right_eye", "neck", 
        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
        "left_front_paw", "right_front_paw", "back", "left_hip", 
        "right_hip", "left_knee", "right_knee", "left_back_paw", "right_back_paw"
    ]
    
    # Skeleton connections for visualization
    SKELETON = [
        (0, 3), (3, 11),  # nose -> neck -> back
        (1, 0), (2, 0),   # eyes -> nose
        (3, 4), (3, 5),   # neck -> shoulders
        (4, 6), (6, 8),   # left front leg
        (5, 7), (7, 9),   # right front leg
        (11, 12), (11, 13), # back -> hips
        (12, 14), (14, 16), # left back leg
        (13, 15), (15, 17)  # right back leg
    ]
    
    def __init__(self) -> None:
        self.device = self._setup_device()
        self.model: Optional[Any] = None
        self.performance_metrics = {
            "avg_time": 0.0,
            "pose_estimations": 0
        }
        
    def load_model(self) -> None:
        """Load RTMPose model for horse pose estimation."""
        try:
            model_path = Path(settings.model_path) / settings.pose_model
            
            if not model_path.exists():
                logger.warning(f"Pose model not found: {model_path}")
                logger.info("Pose estimation will be disabled")
                return
                
            logger.info(f"Loading RTMPose model: {model_path}")
            
            # TODO: Load actual RTMPose model
            # This is a placeholder - in production you'd use:
            # from mmpose.apis import init_pose_model
            # self.model = init_pose_model(config_path, model_path, device=self.device)
            
            # For now, create a mock model structure
            self.model = {
                "loaded": True,
                "path": str(model_path),
                "device": str(self.device)
            }
            
            logger.info(f"RTMPose model loaded on {self.device}")
            
        except Exception as error:
            logger.error(f"Failed to load pose model: {error}")
            self.model = None
            
    def _setup_device(self) -> torch.device:
        """Setup computation device for pose estimation."""
        if settings.ml_device == "cuda" and torch.cuda.is_available():
            device = torch.device("cuda")
        elif settings.ml_device == "auto":
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            device = torch.device("cpu")
            
        return device
        
    def estimate_pose(self, frame: np.ndarray, horse_bbox: Dict[str, float]) -> Tuple[Optional[Dict[str, Any]], float]:
        """
        Estimate horse pose within bounding box.
        
        Args:
            frame: Input video frame
            horse_bbox: Horse bounding box with x, y, width, height
            
        Returns:
            Tuple of (pose_data, processing_time_ms)
        """
        start_time = time.time()
        
        if not self.model:
            logger.debug("Pose model not available, skipping pose estimation")
            return None, 0.0
            
        try:
            # Extract horse region from frame
            x, y, w, h = int(horse_bbox["x"]), int(horse_bbox["y"]), int(horse_bbox["width"]), int(horse_bbox["height"])
            horse_region = frame[y:y+h, x:x+w]
            
            if horse_region.size == 0:
                logger.warning("Invalid horse bounding box for pose estimation")
                return None, 0.0
                
            # Resize to model input size (typically 256x256 for RTMPose)
            input_size = (256, 256)
            resized_region = cv2.resize(horse_region, input_size)
            
            # TODO: Replace with actual RTMPose inference
            # For now, generate mock pose keypoints
            pose_data = self._generate_mock_pose(horse_bbox)
            
            processing_time = (time.time() - start_time) * 1000
            self._update_performance_metrics(processing_time)
            
            logger.debug(f"Pose estimation completed in {processing_time:.1f}ms")
            return pose_data, processing_time
            
        except Exception as error:
            processing_time = (time.time() - start_time) * 1000
            logger.error(f"Pose estimation failed after {processing_time:.1f}ms: {error}")
            return None, processing_time
            
    def _generate_mock_pose(self, horse_bbox: Dict[str, float]) -> Dict[str, Any]:
        """Generate mock pose data for development/testing."""
        x, y, w, h = horse_bbox["x"], horse_bbox["y"], horse_bbox["width"], horse_bbox["height"]
        
        # Generate realistic keypoints within the bounding box
        keypoints = []
        for i, name in enumerate(self.KEYPOINT_NAMES):
            # Distribute keypoints realistically within bounding box
            kp_x = x + (w * (0.2 + 0.6 * (i % 3) / 2))  # Vary x position
            kp_y = y + (h * (0.1 + 0.8 * i / len(self.KEYPOINT_NAMES)))  # Progress down body
            confidence = 0.7 + np.random.random() * 0.25  # 0.7-0.95 confidence
            
            keypoints.append({
                "name": name,
                "x": float(kp_x),
                "y": float(kp_y),
                "confidence": float(confidence)
            })
            
        # Calculate pose angles
        angles = self._calculate_pose_angles(keypoints)
        
        # Estimate gait type based on keypoint positions
        gait_type, velocity = self._estimate_gait(keypoints)
        
        return {
            "keypoints": keypoints,
            "angles": angles,
            "gait_type": gait_type,
            "velocity": velocity,
            "pose_confidence": np.mean([kp["confidence"] for kp in keypoints]),
            "model_used": "rtmpose_mock"
        }
        
    def _calculate_pose_angles(self, keypoints: List[Dict[str, Any]]) -> Dict[str, float]:
        """Calculate joint angles from keypoints."""
        def angle_between_points(p1: Dict, p2: Dict, p3: Dict) -> float:
            """Calculate angle at point p2 formed by p1-p2-p3."""
            v1 = np.array([p1["x"] - p2["x"], p1["y"] - p2["y"]])
            v2 = np.array([p3["x"] - p2["x"], p3["y"] - p2["y"]])
            
            cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
            angle = math.degrees(math.acos(np.clip(cos_angle, -1, 1)))
            return angle
            
        # Create keypoint lookup
        kp_dict = {kp["name"]: kp for kp in keypoints}
        
        angles = {}
        
        try:
            # Neck angle (nose-neck-back)
            if all(name in kp_dict for name in ["nose", "neck", "back"]):
                angles["neck_angle"] = angle_between_points(
                    kp_dict["nose"], kp_dict["neck"], kp_dict["back"]
                )
                
            # Shoulder angles
            if all(name in kp_dict for name in ["neck", "left_shoulder", "left_elbow"]):
                angles["left_shoulder_angle"] = angle_between_points(
                    kp_dict["neck"], kp_dict["left_shoulder"], kp_dict["left_elbow"] 
                )
                
            # Back angle (shoulder-back-hip)
            if all(name in kp_dict for name in ["left_shoulder", "back", "left_hip"]):
                angles["back_angle"] = angle_between_points(
                    kp_dict["left_shoulder"], kp_dict["back"], kp_dict["left_hip"]
                )
                
        except Exception as error:
            logger.warning(f"Angle calculation failed: {error}")
            
        return angles
        
    def _estimate_gait(self, keypoints: List[Dict[str, Any]]) -> Tuple[str, float]:
        """Estimate gait type and velocity from pose."""
        # Simple gait classification based on leg positions
        # In production, this would use temporal analysis across multiple frames
        
        # For mock data, randomly assign gait types with realistic probabilities
        import random
        
        gaits = ["stand", "walk", "trot", "graze"]
        weights = [0.4, 0.35, 0.15, 0.1]  # Stand most common, then walk, etc.
        
        gait_type = np.random.choice(gaits, p=weights)
        
        # Estimate velocity based on gait
        velocity_map = {
            "stand": 0.0 + np.random.random() * 0.2,  # 0-0.2 m/s
            "graze": 0.0 + np.random.random() * 0.3,  # 0-0.3 m/s  
            "walk": 1.0 + np.random.random() * 0.8,   # 1.0-1.8 m/s
            "trot": 3.0 + np.random.random() * 2.0    # 3.0-5.0 m/s
        }
        
        velocity = velocity_map[gait_type]
        
        return gait_type, round(velocity, 2)
        
    def _update_performance_metrics(self, processing_time: float) -> None:
        """Update performance tracking."""
        alpha = 0.1
        if self.performance_metrics["avg_time"] == 0:
            self.performance_metrics["avg_time"] = processing_time
        else:
            self.performance_metrics["avg_time"] = (
                (1 - alpha) * self.performance_metrics["avg_time"] + 
                alpha * processing_time
            )
        self.performance_metrics["pose_estimations"] += 1
        
    def get_performance_info(self) -> Dict[str, Any]:
        """Get pose estimation performance metrics."""
        return {
            "model_loaded": self.model is not None,
            "device": str(self.device),
            "avg_processing_time_ms": round(self.performance_metrics["avg_time"], 2),
            "total_estimations": self.performance_metrics["pose_estimations"],
            "keypoint_count": len(self.KEYPOINT_NAMES),
            "configuration": {
                "confidence_threshold": settings.pose_confidence_threshold,
                "input_size": "256x256"
            }
        }