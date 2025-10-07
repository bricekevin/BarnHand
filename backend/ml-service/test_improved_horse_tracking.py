#!/usr/bin/env python3
"""
Improved Horse Tracking with Better Re-identification
Fixes issues with multiple horses getting same ID and improves color/pose-based identification
"""

import os
import sys
import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field
from collections import deque
import time
from scipy.spatial.distance import euclidean
from sklearn.cluster import KMeans

# Set environment
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'
os.environ['MODEL_PATH'] = '../../models'
os.environ['YOLO_MODEL'] = 'downloads/yolov5m.pt'

sys.path.insert(0, 'src')

@dataclass
class HorseFeatures:
    """Comprehensive features for horse identification."""
    # Color features
    dominant_colors: np.ndarray = field(default_factory=lambda: np.zeros(6))  # Top 3 RGB colors
    color_histogram: np.ndarray = field(default_factory=lambda: np.zeros(64))  # HSV histogram
    
    # Pose features
    body_proportions: np.ndarray = field(default_factory=lambda: np.zeros(8))  # Body measurements
    pose_keypoints_norm: np.ndarray = field(default_factory=lambda: np.zeros(34))  # Normalized pose
    
    # Shape features
    aspect_ratio: float = 0.0
    bbox_size: float = 0.0
    
    def to_vector(self) -> np.ndarray:
        """Convert all features to single vector."""
        return np.concatenate([
            self.dominant_colors,
            self.color_histogram,
            self.body_proportions,
            self.pose_keypoints_norm,
            [self.aspect_ratio, self.bbox_size]
        ])

@dataclass
class TrackedHorse:
    """Enhanced tracked horse with better features."""
    horse_id: int
    color: Tuple[int, int, int]
    features_history: deque = field(default_factory=lambda: deque(maxlen=20))
    last_seen_frame: int = 0
    detection_count: int = 0
    avg_confidence: float = 0.0
    last_bbox: Optional[Dict] = None
    last_keypoints: Optional[List] = None
    display_name: str = ""
    
    # Color characteristics for identification
    primary_coat_color: str = ""
    coat_color_confidence: float = 0.0
    
    def update_features(self, features: HorseFeatures, frame_num: int, confidence: float):
        """Update horse features and stats."""
        self.features_history.append(features)
        self.last_seen_frame = frame_num
        self.detection_count += 1
        # Running average of confidence
        self.avg_confidence = ((self.avg_confidence * (self.detection_count - 1) + confidence) / 
                               self.detection_count)
    
    def get_average_features(self) -> HorseFeatures:
        """Get average features for matching."""
        if not self.features_history:
            return HorseFeatures()
        
        # Average all features
        avg_features = HorseFeatures()
        n = len(self.features_history)
        
        avg_features.dominant_colors = np.mean([f.dominant_colors for f in self.features_history], axis=0)
        avg_features.color_histogram = np.mean([f.color_histogram for f in self.features_history], axis=0)
        avg_features.body_proportions = np.mean([f.body_proportions for f in self.features_history], axis=0)
        avg_features.pose_keypoints_norm = np.mean([f.pose_keypoints_norm for f in self.features_history], axis=0)
        avg_features.aspect_ratio = np.mean([f.aspect_ratio for f in self.features_history])
        avg_features.bbox_size = np.mean([f.bbox_size for f in self.features_history])
        
        return avg_features


class ImprovedHorseTracker:
    """Improved horse tracker with better re-identification."""
    
    HORSE_COLORS = [
        (255, 100, 100),  # Light blue - Horse 1
        (100, 255, 100),  # Light green - Horse 2  
        (100, 100, 255),  # Light red - Horse 3
        (255, 255, 100),  # Cyan - Horse 4
        (255, 100, 255),  # Magenta - Horse 5
        (100, 255, 255),  # Yellow - Horse 6
        (200, 150, 255),  # Light orange - Horse 7
        (255, 150, 200),  # Light purple - Horse 8
        (150, 255, 200),  # Light teal - Horse 9
        (255, 200, 150),  # Light peach - Horse 10
    ]
    
    def __init__(self, similarity_threshold: float = 0.75, max_frames_missing: int = 30):
        self.horses: Dict[int, TrackedHorse] = {}
        self.next_horse_id = 1
        self.similarity_threshold = similarity_threshold
        self.max_frames_missing = max_frames_missing
        self.frame_count = 0
        
        # Feature weights for different aspects
        self.color_weight = 0.5      # Color is most important
        self.pose_weight = 0.3       # Body proportions second
        self.shape_weight = 0.2      # Size/shape least important
        
    def extract_horse_color_features(self, frame: np.ndarray, bbox: Dict) -> Tuple[np.ndarray, np.ndarray, str]:
        """Extract detailed color features from horse region."""
        x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
        
        # Bounds check
        x = max(0, min(x, frame.shape[1] - 1))
        y = max(0, min(y, frame.shape[0] - 1))
        w = min(w, frame.shape[1] - x)
        h = min(h, frame.shape[0] - y)
        
        if w <= 0 or h <= 0:
            return np.zeros(6), np.zeros(64), "unknown"
        
        horse_region = frame[y:y+h, x:x+w]
        if horse_region.size == 0:
            return np.zeros(6), np.zeros(64), "unknown"
        
        # Resize for consistent processing
        horse_resized = cv2.resize(horse_region, (128, 128))
        
        # 1. Dominant colors using K-means
        pixels = horse_resized.reshape(-1, 3)
        try:
            kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
            kmeans.fit(pixels)
            dominant_colors = kmeans.cluster_centers_.flatten() / 255.0  # Normalize to 0-1
        except:
            dominant_colors = np.zeros(6)
        
        # 2. HSV color histogram
        hsv_region = cv2.cvtColor(horse_resized, cv2.COLOR_BGR2HSV)
        
        # Focus on body region (exclude background-prone edges)
        body_region = hsv_region[16:112, 16:112]  # Crop 16px border
        
        # Create histogram for each HSV channel
        h_hist = cv2.calcHist([body_region], [0], None, [32], [0, 180])
        s_hist = cv2.calcHist([body_region], [1], None, [16], [0, 256])
        v_hist = cv2.calcHist([body_region], [2], None, [16], [0, 256])
        
        # Normalize histograms
        h_hist = h_hist.flatten() / (h_hist.sum() + 1e-6)
        s_hist = s_hist.flatten() / (s_hist.sum() + 1e-6)
        v_hist = v_hist.flatten() / (v_hist.sum() + 1e-6)
        
        color_histogram = np.concatenate([h_hist, s_hist, v_hist])
        
        # 3. Classify dominant coat color
        dominant_bgr = dominant_colors.reshape(3, 3) * 255
        coat_color = self._classify_horse_coat_color(dominant_bgr)
        
        return dominant_colors, color_histogram, coat_color
    
    def _classify_horse_coat_color(self, dominant_colors: np.ndarray) -> str:
        """Classify horse coat color from dominant colors."""
        # Average the dominant colors
        avg_color = np.mean(dominant_colors, axis=0)
        b, g, r = avg_color
        
        # Convert to more intuitive RGB
        rgb = np.array([r, g, b])
        
        # Define color ranges (rough classification)
        if np.all(rgb > 150):  # Light colors
            if r > g + 20 and r > b + 20:
                return "chestnut"  # Reddish-brown
            elif g > r + 10 and g > b + 10:
                return "palomino"  # Golden
            else:
                return "gray"     # Gray/white
        elif np.all(rgb > 80):  # Medium colors
            if r > 120 and g < 100 and b < 80:
                return "bay"      # Brown with dark mane
            elif r > g + 15:
                return "sorrel"   # Reddish
            else:
                return "brown"    # General brown
        else:  # Dark colors
            if np.all(rgb < 60):
                return "black"
            else:
                return "dark_brown"
    
    def extract_pose_features(self, keypoints: List, bbox: Dict) -> np.ndarray:
        """Extract pose-based proportion features."""
        if not keypoints or len(keypoints) < 17:
            return np.zeros(8)
        
        # Convert keypoints to dict for easier access
        kp_dict = {kp['name']: (kp['x'], kp['y'], kp['confidence']) for kp in keypoints}
        
        features = []
        
        # Body measurements (normalized by bbox size)
        bbox_w, bbox_h = bbox['width'], bbox['height']
        
        def safe_distance(kp1_name, kp2_name):
            if kp1_name in kp_dict and kp2_name in kp_dict:
                kp1 = kp_dict[kp1_name]
                kp2 = kp_dict[kp2_name]
                if kp1[2] > 0.3 and kp2[2] > 0.3:  # Good confidence
                    return euclidean([kp1[0], kp1[1]], [kp2[0], kp2[1]]) / max(bbox_w, bbox_h)
            return 0.0
        
        # 1. Head to neck distance (head size indicator)
        features.append(safe_distance("Nose", "Neck"))
        
        # 2. Neck to tail distance (body length)
        features.append(safe_distance("Neck", "Root_of_tail"))
        
        # 3. Shoulder width (front leg span)
        features.append(safe_distance("L_Shoulder", "R_Shoulder"))
        
        # 4. Hip width (back leg span)
        features.append(safe_distance("L_Hip", "R_Hip"))
        
        # 5. Front leg length
        front_leg_len = (safe_distance("L_Shoulder", "L_Elbow") + 
                        safe_distance("L_Elbow", "L_F_Paw") +
                        safe_distance("R_Shoulder", "R_Elbow") + 
                        safe_distance("R_Elbow", "R_F_Paw")) / 4
        features.append(front_leg_len)
        
        # 6. Back leg length
        back_leg_len = (safe_distance("L_Hip", "L_Knee") + 
                       safe_distance("L_Knee", "L_B_Paw") +
                       safe_distance("R_Hip", "R_Knee") + 
                       safe_distance("R_Knee", "R_B_Paw")) / 4
        features.append(back_leg_len)
        
        # 7. Body height (shoulder/hip to ground approximation)
        body_height = (front_leg_len + back_leg_len) / 2
        features.append(body_height)
        
        # 8. Overall body aspect ratio
        if bbox_w > 0:
            features.append(bbox_h / bbox_w)
        else:
            features.append(1.0)
        
        return np.array(features)
    
    def extract_comprehensive_features(self, frame: np.ndarray, bbox: Dict, 
                                     keypoints: Optional[List] = None) -> HorseFeatures:
        """Extract all features for horse identification."""
        features = HorseFeatures()
        
        # Color features
        features.dominant_colors, features.color_histogram, coat_color = self.extract_horse_color_features(frame, bbox)
        
        # Pose features (if available)
        if keypoints:
            features.body_proportions = self.extract_pose_features(keypoints, bbox)
            
            # Normalized keypoint positions (relative to bbox)
            kp_positions = []
            for kp in keypoints[:17]:  # Ensure we only use 17 keypoints
                if kp['confidence'] > 0.2:
                    # Normalize to bbox coordinates
                    norm_x = (kp['x'] - bbox['x']) / max(bbox['width'], 1)
                    norm_y = (kp['y'] - bbox['y']) / max(bbox['height'], 1)
                    kp_positions.extend([norm_x, norm_y])
                else:
                    kp_positions.extend([0.0, 0.0])  # Missing keypoint
            
            # Pad to exactly 34 values (17 * 2)
            while len(kp_positions) < 34:
                kp_positions.append(0.0)
            features.pose_keypoints_norm = np.array(kp_positions[:34])
        
        # Shape features
        features.aspect_ratio = bbox['height'] / max(bbox['width'], 1)
        features.bbox_size = bbox['width'] * bbox['height']
        
        return features
    
    def compute_weighted_similarity(self, features1: HorseFeatures, features2: HorseFeatures) -> float:
        """Compute weighted similarity between two feature sets."""
        
        # Color similarity (most important)
        color_sim = 0.0
        if np.any(features1.dominant_colors) and np.any(features2.dominant_colors):
            # Dominant colors similarity
            dom_sim = 1 - np.linalg.norm(features1.dominant_colors - features2.dominant_colors) / np.sqrt(6)
            # Histogram similarity
            hist_sim = np.dot(features1.color_histogram, features2.color_histogram) / (
                np.linalg.norm(features1.color_histogram) * np.linalg.norm(features2.color_histogram) + 1e-6)
            color_sim = (dom_sim + hist_sim) / 2
        
        # Pose similarity
        pose_sim = 0.0
        if np.any(features1.body_proportions) and np.any(features2.body_proportions):
            # Body proportions similarity
            prop_diff = np.linalg.norm(features1.body_proportions - features2.body_proportions)
            prop_sim = max(0, 1 - prop_diff / 2)  # Scale appropriately
            
            # Keypoint positions similarity
            kp_diff = np.linalg.norm(features1.pose_keypoints_norm - features2.pose_keypoints_norm)
            kp_sim = max(0, 1 - kp_diff / 4)  # Scale appropriately
            
            pose_sim = (prop_sim + kp_sim) / 2
        
        # Shape similarity (least important)
        shape_sim = 0.0
        if features1.aspect_ratio > 0 and features2.aspect_ratio > 0:
            ratio_diff = abs(features1.aspect_ratio - features2.aspect_ratio) / max(features1.aspect_ratio, features2.aspect_ratio)
            shape_sim = max(0, 1 - ratio_diff)
        
        # Weighted combination
        total_similarity = (self.color_weight * color_sim + 
                          self.pose_weight * pose_sim + 
                          self.shape_weight * shape_sim)
        
        return total_similarity
    
    def match_horses_frame(self, detections_with_poses: List[Tuple]) -> List[TrackedHorse]:
        """
        Match all horses in a frame simultaneously to prevent duplicate assignments.
        detections_with_poses: List of (detection, pose_data, frame_num) tuples
        """
        if not detections_with_poses:
            return []
        
        frame_num = detections_with_poses[0][2]
        
        # Extract features for all detections
        detection_features = []
        for detection, pose_data, _, frame in detections_with_poses:
            keypoints = pose_data.get('keypoints', []) if pose_data else []
            features = self.extract_comprehensive_features(
                frame,  # Use the frame from current detection
                detection['bbox'], 
                keypoints
            )
            detection_features.append((detection, pose_data, features))
        
        # Get active horses for matching
        active_horses = [h for h in self.horses.values() 
                        if frame_num - h.last_seen_frame <= self.max_frames_missing]
        
        # Create similarity matrix
        n_detections = len(detection_features)
        n_horses = len(active_horses)
        
        if n_horses == 0:
            # No existing horses, create new ones for all detections
            matched_horses = []
            for detection, pose_data, features in detection_features:
                new_horse = self._create_new_horse(detection, pose_data, features, frame_num)
                matched_horses.append(new_horse)
            return matched_horses
        
        # Calculate similarity matrix
        similarity_matrix = np.zeros((n_detections, n_horses))
        
        for i, (_, _, det_features) in enumerate(detection_features):
            for j, horse in enumerate(active_horses):
                horse_features = horse.get_average_features()
                similarity = self.compute_weighted_similarity(det_features, horse_features)
                similarity_matrix[i, j] = similarity
        
        # Use Hungarian algorithm for optimal assignment
        matched_horses = []
        used_horses = set()
        
        # Simple greedy matching (you could use scipy.optimize.linear_sum_assignment for optimal)
        for _ in range(min(n_detections, n_horses)):
            # Find best match
            best_i, best_j = np.unravel_index(np.argmax(similarity_matrix), similarity_matrix.shape)
            best_sim = similarity_matrix[best_i, best_j]
            
            if best_sim >= self.similarity_threshold and best_j not in used_horses:
                # Match found
                detection, pose_data, features = detection_features[best_i]
                horse = active_horses[best_j]
                
                # Update horse
                horse.update_features(features, frame_num, detection['confidence'])
                horse.last_bbox = detection['bbox']
                if pose_data:
                    horse.last_keypoints = pose_data.get('keypoints', [])
                
                matched_horses.append(horse)
                used_horses.add(best_j)
                
                print(f"   🔄 Matched detection {best_i+1} to Horse #{horse.horse_id} (similarity: {best_sim:.3f})")
                
                # Remove this match from consideration
                similarity_matrix[best_i, :] = -1
                similarity_matrix[:, best_j] = -1
            else:
                break
        
        # Create new horses for unmatched detections
        for i, (detection, pose_data, features) in enumerate(detection_features):
            if not any(similarity_matrix[i, j] == -1 for j in range(n_horses)):
                # This detection wasn't matched
                new_horse = self._create_new_horse(detection, pose_data, features, frame_num)
                matched_horses.append(new_horse)
        
        return matched_horses
    
    def _create_new_horse(self, detection, pose_data, features, frame_num) -> TrackedHorse:
        """Create a new tracked horse."""
        new_horse = TrackedHorse(
            horse_id=self.next_horse_id,
            color=self.HORSE_COLORS[(self.next_horse_id - 1) % len(self.HORSE_COLORS)],
            last_seen_frame=frame_num,
            last_bbox=detection['bbox'],
            display_name=f"Horse #{self.next_horse_id}"
        )
        
        new_horse.update_features(features, frame_num, detection['confidence'])
        if pose_data:
            new_horse.last_keypoints = pose_data.get('keypoints', [])
        
        # Classify coat color
        if np.any(features.dominant_colors):
            dominant_bgr = features.dominant_colors.reshape(3, 3) * 255
            new_horse.primary_coat_color = self._classify_horse_coat_color(dominant_bgr)
        
        self.horses[self.next_horse_id] = new_horse
        print(f"   🆕 New Horse #{self.next_horse_id} detected (coat: {new_horse.primary_coat_color})")
        self.next_horse_id += 1
        
        return new_horse
    
    def get_active_horses(self, current_frame: int) -> List[TrackedHorse]:
        """Get list of currently active (recently seen) horses."""
        active = []
        for horse in self.horses.values():
            if current_frame - horse.last_seen_frame <= self.max_frames_missing:
                active.append(horse)
        return active
    
    def get_stats(self) -> Dict:
        """Get tracking statistics."""
        active_horses = self.get_active_horses(self.frame_count)
        return {
            'total_horses_seen': len(self.horses),
            'currently_active': len(active_horses),
            'total_detections': sum(h.detection_count for h in self.horses.values()),
            'avg_confidence': np.mean([h.avg_confidence for h in self.horses.values()]) if self.horses else 0
        }


def create_improved_tracked_video():
    """Create video with improved horse tracking."""
    
    print("🐎 Improved Horse Tracking with Better Re-identification")
    print("=" * 70)
    
    from src.models.detection import HorseDetectionModel
    from src.models.pose import HorsePoseModel
    
    # Load models
    print("🔧 Loading models...")
    yolo_model = HorseDetectionModel()
    yolo_model.load_models()
    
    pose_model = HorsePoseModel()
    pose_model.load_model()
    
    print("✅ Models loaded")
    
    # Initialize improved tracker
    tracker = ImprovedHorseTracker(similarity_threshold=0.75, max_frames_missing=30)
    
    # Video setup
    input_video = "../../media/rolling-on-ground.mp4"
    output_video = "../../horse_tracking_improved_full_length.mp4"
    
    cap = cv2.VideoCapture(input_video)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))
    
    # Process full video length as requested
    max_frames = total_frames
    
    print(f"📹 Processing {max_frames} frames ({max_frames/fps:.1f} seconds) - FULL VIDEO LENGTH...")
    
    stats = {
        'frames_processed': 0,
        'horses_detected': 0,
        'poses_estimated': 0,
        'unique_horses': set()
    }
    
    start_time = time.time()
    
    for frame_idx in range(max_frames):
        ret, frame = cap.read()
        if not ret:
            break
        
        tracker.frame_count = frame_idx
        overlay_frame = frame.copy()
        
        # Detect horses in current frame
        detections, _ = yolo_model.detect_horses(frame)
        
        if detections:
            stats['horses_detected'] += len(detections)
            
            # Get pose data for all detections
            detections_with_poses = []
            for detection in detections:
                pose_data, _ = pose_model.estimate_pose(frame, detection['bbox'])
                if pose_data:
                    stats['poses_estimated'] += 1
                detections_with_poses.append((detection, pose_data, frame_idx, frame))
            
            # Match all horses simultaneously 
            matched_horses = tracker.match_horses_frame(detections_with_poses)
            
            for horse in matched_horses:
                stats['unique_horses'].add(horse.horse_id)
                
                # Get display info
                color = horse.color
                bbox = horse.last_bbox
                
                # Draw bounding box with horse-specific color
                x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
                cv2.rectangle(overlay_frame, (x, y), (x + w, y + h), color, 3)
                
                # Find the matching detection to get confidence
                matching_detection = None
                for det, _, _, _ in detections_with_poses:
                    if det['bbox'] == bbox:
                        matching_detection = det
                        break
                
                confidence = matching_detection['confidence'] if matching_detection else 0.0
                text = f"Horse #{horse.horse_id} ({confidence:.1%})"
                if horse.primary_coat_color and horse.primary_coat_color != "unknown":
                    text += f" - {horse.primary_coat_color}"
                
                # Background for text
                text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                cv2.rectangle(overlay_frame, 
                            (x, y - text_size[1] - 10),
                            (x + text_size[0] + 10, y),
                            color, -1)
                cv2.putText(overlay_frame, text, (x + 5, y - 5),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                
                # Draw keypoints and skeleton if available
                if horse.last_keypoints:
                    keypoints = horse.last_keypoints
                    kp_dict = {kp['name']: kp for kp in keypoints}
                    
                    # Draw keypoints
                    for kp in keypoints:
                        if kp['confidence'] > 0.3:
                            kx, ky = int(kp['x']), int(kp['y'])
                            if 0 <= kx < width and 0 <= ky < height:
                                cv2.circle(overlay_frame, (kx, ky), 4, color, -1)
                                cv2.circle(overlay_frame, (kx, ky), 6, (255, 255, 255), 2)
                    
                    # Draw skeleton
                    for start_name, end_name in pose_model.SKELETON:
                        if (start_name in kp_dict and end_name in kp_dict and
                            kp_dict[start_name]['confidence'] > 0.3 and 
                            kp_dict[end_name]['confidence'] > 0.3):
                            
                            start_pt = (int(kp_dict[start_name]['x']), 
                                      int(kp_dict[start_name]['y']))
                            end_pt = (int(kp_dict[end_name]['x']), 
                                    int(kp_dict[end_name]['y']))
                            
                            skeleton_color = tuple(min(255, c + 50) for c in color)
                            cv2.line(overlay_frame, start_pt, end_pt, skeleton_color, 2)
        
        # Draw tracking statistics
        tracking_stats = tracker.get_stats()
        stats_text = [
            f"Frame: {frame_idx}/{max_frames}",
            f"Active Horses: {tracking_stats['currently_active']}",
            f"Total Unique: {tracking_stats['total_horses_seen']}",
            f"Total Detections: {tracking_stats['total_detections']}"
        ]
        
        y_offset = 30
        for text in stats_text:
            cv2.putText(overlay_frame, text, (10, y_offset),
                      cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            y_offset += 30
        
        out.write(overlay_frame)
        stats['frames_processed'] += 1
        
        if frame_idx % 50 == 0 and frame_idx > 0:
            elapsed = time.time() - start_time
            fps_actual = frame_idx / elapsed
            print(f"   Frame {frame_idx}/{max_frames} | {fps_actual:.1f} fps")
            
            # Show current horses
            active_horses = tracker.get_active_horses(frame_idx)
            if active_horses:
                horse_info = []
                for h in active_horses:
                    coat = f" ({h.primary_coat_color})" if h.primary_coat_color != "unknown" else ""
                    horse_info.append(f"#{h.horse_id}{coat}")
                print(f"   Active horses: {', '.join(horse_info)}")
    
    cap.release()
    out.release()
    
    elapsed_time = time.time() - start_time
    
    print(f"\n📊 Improved Tracking Results:")
    print(f"   Frames processed: {stats['frames_processed']}")
    print(f"   Processing time: {elapsed_time:.1f}s ({stats['frames_processed']/elapsed_time:.1f} fps)")
    print(f"   Total detections: {stats['horses_detected']}")
    print(f"   Poses estimated: {stats['poses_estimated']}")
    print(f"   Unique horses identified: {len(stats['unique_horses'])}")
    
    # Show details for each tracked horse
    print(f"\n🐎 Individual Horse Details:")
    for horse_id in sorted(tracker.horses.keys()):
        horse = tracker.horses[horse_id]
        print(f"   Horse #{horse_id}:")
        print(f"      Detections: {horse.detection_count}")
        print(f"      Avg confidence: {horse.avg_confidence:.1%}")
        print(f"      Coat color: {horse.primary_coat_color}")
        print(f"      Last seen: frame {horse.last_seen_frame}")
    
    print(f"\n✅ Video created: {output_video}")
    return len(stats['unique_horses'])


def main():
    print("🐎 Improved Horse Tracking System")
    print("=" * 80)
    print("Testing improved re-identification with better color/pose features...")
    print()
    
    num_horses = create_improved_tracked_video()
    
    print(f"\n🎉 Improved Horse Tracking Complete!")
    print(f"   Successfully tracked {num_horses} unique horses")
    print(f"   Features: Color-based identification + pose proportions")
    print(f"   Fixed: Simultaneous detection assignment issue")
    
    return 0


if __name__ == "__main__":
    exit(main())