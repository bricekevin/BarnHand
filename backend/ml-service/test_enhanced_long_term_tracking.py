#!/usr/bin/env python3
"""
Enhanced Long-term Horse Tracking with Re-identification
Fixes issue where horses leaving/returning frame get new IDs instead of matching existing ones
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
    """Enhanced tracked horse with long-term memory."""
    horse_id: int
    color: Tuple[int, int, int]
    
    # Short-term features (recent detections)
    recent_features: deque = field(default_factory=lambda: deque(maxlen=10))
    
    # Long-term features (entire history, weighted)
    all_features_history: List = field(default_factory=list)
    consolidated_features: Optional[HorseFeatures] = None
    
    last_seen_frame: int = 0
    detection_count: int = 0
    avg_confidence: float = 0.0
    last_bbox: Optional[Dict] = None
    last_keypoints: Optional[List] = None
    display_name: str = ""
    
    # Long-term characteristics
    primary_coat_color: str = ""
    stable_body_proportions: np.ndarray = field(default_factory=lambda: np.zeros(8))
    frames_absent: int = 0
    total_frames_seen: int = 0
    
    def update_features(self, features: HorseFeatures, frame_num: int, confidence: float):
        """Update horse features with long-term consolidation."""
        self.recent_features.append(features)
        self.all_features_history.append((features, frame_num, confidence))
        
        self.last_seen_frame = frame_num
        self.detection_count += 1
        self.total_frames_seen += 1
        self.frames_absent = 0  # Reset absence counter
        
        # Running average of confidence
        self.avg_confidence = ((self.avg_confidence * (self.detection_count - 1) + confidence) / 
                               self.detection_count)
        
        # Update consolidated features every 5 detections
        if len(self.all_features_history) % 5 == 0:
            self._update_consolidated_features()
    
    def increment_absence(self):
        """Called each frame when horse is not detected."""
        self.frames_absent += 1
    
    def _update_consolidated_features(self):
        """Create consolidated features weighted by recency and confidence."""
        if not self.all_features_history:
            return
        
        # Weight more recent detections higher
        weights = []
        features_list = []
        
        for i, (features, frame_num, confidence) in enumerate(self.all_features_history):
            # Recency weight (more recent = higher weight)
            recency_weight = np.exp(-0.01 * (self.last_seen_frame - frame_num))
            # Confidence weight
            confidence_weight = confidence
            # Combined weight
            weight = recency_weight * confidence_weight
            
            weights.append(weight)
            features_list.append(features)
        
        weights = np.array(weights)
        weights = weights / weights.sum()  # Normalize
        
        # Weighted average of features
        self.consolidated_features = HorseFeatures()
        
        # Average dominant colors
        dom_colors = np.array([f.dominant_colors for f in features_list])
        self.consolidated_features.dominant_colors = np.average(dom_colors, axis=0, weights=weights)
        
        # Average color histograms
        hist_colors = np.array([f.color_histogram for f in features_list])
        self.consolidated_features.color_histogram = np.average(hist_colors, axis=0, weights=weights)
        
        # Average body proportions (most stable)
        body_props = np.array([f.body_proportions for f in features_list])
        self.consolidated_features.body_proportions = np.average(body_props, axis=0, weights=weights)
        self.stable_body_proportions = self.consolidated_features.body_proportions.copy()
        
        # Average keypoint patterns
        kp_norms = np.array([f.pose_keypoints_norm for f in features_list])
        self.consolidated_features.pose_keypoints_norm = np.average(kp_norms, axis=0, weights=weights)
        
        # Average other features
        self.consolidated_features.aspect_ratio = np.average(
            [f.aspect_ratio for f in features_list], weights=weights)
        self.consolidated_features.bbox_size = np.average(
            [f.bbox_size for f in features_list], weights=weights)
    
    def get_best_features_for_matching(self) -> HorseFeatures:
        """Get best features for long-term re-identification."""
        if self.consolidated_features is not None and len(self.all_features_history) >= 3:
            # Use consolidated features if we have enough history
            return self.consolidated_features
        elif self.recent_features:
            # Use recent features if available
            return self.recent_features[-1]
        else:
            # Fallback to empty features
            return HorseFeatures()


class EnhancedLongTermTracker:
    """Enhanced tracker with better long-term re-identification."""
    
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
    
    def __init__(self, 
                 active_similarity_threshold: float = 0.75,    # For recently seen horses
                 longterm_similarity_threshold: float = 0.65,  # For horses absent >30 frames
                 max_frames_missing: int = 150):               # Keep horses in memory longer
        
        self.horses: Dict[int, TrackedHorse] = {}
        self.next_horse_id = 1
        self.active_similarity_threshold = active_similarity_threshold
        self.longterm_similarity_threshold = longterm_similarity_threshold
        self.max_frames_missing = max_frames_missing
        self.frame_count = 0
        
        # Feature weights for different aspects
        self.color_weight = 0.4      # Color less important for long-term
        self.pose_weight = 0.4       # Body proportions more important
        self.shape_weight = 0.2      # Size/shape moderate importance
        
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
        
        # 2. HSV color histogram with larger central region
        hsv_region = cv2.cvtColor(horse_resized, cv2.COLOR_BGR2HSV)
        
        # Focus on central body region (exclude more background)
        body_region = hsv_region[24:104, 24:104]  # Larger central crop
        
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
        
        # Body proportion features (most stable across time)
        features.append(safe_distance("Nose", "Neck"))          # Head size
        features.append(safe_distance("Neck", "Root_of_tail"))  # Body length
        features.append(safe_distance("L_Shoulder", "R_Shoulder"))  # Shoulder width
        features.append(safe_distance("L_Hip", "R_Hip"))        # Hip width
        
        # Leg proportions (fairly stable)
        front_leg_len = (safe_distance("L_Shoulder", "L_Elbow") + 
                        safe_distance("L_Elbow", "L_F_Paw") +
                        safe_distance("R_Shoulder", "R_Elbow") + 
                        safe_distance("R_Elbow", "R_F_Paw")) / 4
        features.append(front_leg_len)
        
        back_leg_len = (safe_distance("L_Hip", "L_Knee") + 
                       safe_distance("L_Knee", "L_B_Paw") +
                       safe_distance("R_Hip", "R_Knee") + 
                       safe_distance("R_Knee", "R_B_Paw")) / 4
        features.append(back_leg_len)
        
        # Overall proportions
        body_height = (front_leg_len + back_leg_len) / 2
        features.append(body_height)
        
        # Aspect ratio
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
    
    def compute_enhanced_similarity(self, features1: HorseFeatures, features2: HorseFeatures, 
                                  horse: TrackedHorse) -> float:
        """Compute enhanced similarity for long-term re-identification."""
        
        # Color similarity (less weight for long-term)
        color_sim = 0.0
        if np.any(features1.dominant_colors) and np.any(features2.dominant_colors):
            # Dominant colors similarity
            dom_sim = 1 - np.linalg.norm(features1.dominant_colors - features2.dominant_colors) / np.sqrt(6)
            # Histogram similarity
            hist_sim = np.dot(features1.color_histogram, features2.color_histogram) / (
                np.linalg.norm(features1.color_histogram) * np.linalg.norm(features2.color_histogram) + 1e-6)
            color_sim = (dom_sim + hist_sim) / 2
        
        # Body proportions similarity (higher weight for long-term)
        pose_sim = 0.0
        if np.any(features1.body_proportions) and np.any(features2.body_proportions):
            # Use stable body proportions if available
            if np.any(horse.stable_body_proportions):
                stable_props = horse.stable_body_proportions
                prop_diff = np.linalg.norm(features1.body_proportions - stable_props)
            else:
                prop_diff = np.linalg.norm(features1.body_proportions - features2.body_proportions)
            
            prop_sim = max(0, 1 - prop_diff / 2)  # Scale appropriately
            
            # Keypoint positions similarity (lower weight for long-term)
            kp_diff = np.linalg.norm(features1.pose_keypoints_norm - features2.pose_keypoints_norm)
            kp_sim = max(0, 1 - kp_diff / 4)  # Scale appropriately
            
            pose_sim = (0.7 * prop_sim + 0.3 * kp_sim)  # Weight body proportions higher
        
        # Shape similarity
        shape_sim = 0.0
        if features1.aspect_ratio > 0 and features2.aspect_ratio > 0:
            ratio_diff = abs(features1.aspect_ratio - features2.aspect_ratio) / max(features1.aspect_ratio, features2.aspect_ratio)
            shape_sim = max(0, 1 - ratio_diff)
        
        # Weighted combination with adjusted weights for long-term
        total_similarity = (self.color_weight * color_sim + 
                          self.pose_weight * pose_sim + 
                          self.shape_weight * shape_sim)
        
        return total_similarity
    
    def match_horses_frame(self, detections_with_poses: List[Tuple]) -> List[TrackedHorse]:
        """Enhanced matching with long-term re-identification."""
        if not detections_with_poses:
            return []
        
        frame_num = detections_with_poses[0][2]
        
        # Update absence counters for all horses
        for horse in self.horses.values():
            if horse.last_seen_frame < frame_num:
                horse.increment_absence()
        
        # Extract features for all detections
        detection_features = []
        for detection, pose_data, _, frame in detections_with_poses:
            keypoints = pose_data.get('keypoints', []) if pose_data else []
            features = self.extract_comprehensive_features(frame, detection['bbox'], keypoints)
            detection_features.append((detection, pose_data, features))
        
        # Separate horses by absence duration
        active_horses = []      # Recently seen (< 30 frames ago)
        dormant_horses = []     # Not seen for a while but still in memory
        
        for horse in self.horses.values():
            frames_since_seen = frame_num - horse.last_seen_frame
            if frames_since_seen <= 30:
                active_horses.append(horse)
            elif frames_since_seen <= self.max_frames_missing:
                dormant_horses.append(horse)
        
        matched_horses = []
        used_horses = set()
        
        # Phase 1: Match to recently active horses (stricter threshold)
        unmatched_detections = []
        
        for detection, pose_data, features in detection_features:
            best_match = None
            best_similarity = 0.0
            
            for horse in active_horses:
                if horse.horse_id in used_horses:
                    continue
                    
                horse_features = horse.get_best_features_for_matching()
                similarity = self.compute_enhanced_similarity(features, horse_features, horse)
                
                if similarity > best_similarity and similarity >= self.active_similarity_threshold:
                    best_similarity = similarity
                    best_match = horse
            
            if best_match:
                # Match found with active horse
                best_match.update_features(features, frame_num, detection['confidence'])
                best_match.last_bbox = detection['bbox']
                if pose_data:
                    best_match.last_keypoints = pose_data.get('keypoints', [])
                
                matched_horses.append(best_match)
                used_horses.add(best_match.horse_id)
                print(f"   🔄 Matched to Active Horse #{best_match.horse_id} (similarity: {best_similarity:.3f})")
            else:
                unmatched_detections.append((detection, pose_data, features))
        
        # Phase 2: Try to match remaining detections to dormant horses (relaxed threshold)
        still_unmatched = []
        
        for detection, pose_data, features in unmatched_detections:
            best_match = None
            best_similarity = 0.0
            
            for horse in dormant_horses:
                if horse.horse_id in used_horses:
                    continue
                    
                horse_features = horse.get_best_features_for_matching()
                similarity = self.compute_enhanced_similarity(features, horse_features, horse)
                
                if similarity > best_similarity and similarity >= self.longterm_similarity_threshold:
                    best_similarity = similarity
                    best_match = horse
            
            if best_match:
                # Re-identification of dormant horse!
                best_match.update_features(features, frame_num, detection['confidence'])
                best_match.last_bbox = detection['bbox']
                if pose_data:
                    best_match.last_keypoints = pose_data.get('keypoints', [])
                
                matched_horses.append(best_match)
                used_horses.add(best_match.horse_id)
                frames_absent = frame_num - best_match.last_seen_frame
                print(f"   🎯 RE-IDENTIFIED Horse #{best_match.horse_id} after {frames_absent} frames absent! (similarity: {best_similarity:.3f})")
            else:
                still_unmatched.append((detection, pose_data, features))
        
        # Phase 3: Create new horses for truly unmatched detections
        for detection, pose_data, features in still_unmatched:
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
            if current_frame - horse.last_seen_frame <= 30:  # Recently active
                active.append(horse)
        return active
    
    def get_all_known_horses(self, current_frame: int) -> List[TrackedHorse]:
        """Get all horses still in memory."""
        known = []
        for horse in self.horses.values():
            if current_frame - horse.last_seen_frame <= self.max_frames_missing:
                known.append(horse)
        return known
    
    def get_stats(self) -> Dict:
        """Get tracking statistics."""
        active_horses = self.get_active_horses(self.frame_count)
        all_known = self.get_all_known_horses(self.frame_count)
        return {
            'total_horses_created': len(self.horses),
            'horses_in_memory': len(all_known),
            'currently_active': len(active_horses),
            'total_detections': sum(h.detection_count for h in self.horses.values()),
            'avg_confidence': np.mean([h.avg_confidence for h in self.horses.values()]) if self.horses else 0
        }


def create_enhanced_long_term_video():
    """Create video with enhanced long-term horse tracking."""
    
    print("🐎 Enhanced Long-term Horse Tracking with Re-identification")
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
    
    # Initialize enhanced long-term tracker
    tracker = EnhancedLongTermTracker(
        active_similarity_threshold=0.75,     # Strict for recent horses
        longterm_similarity_threshold=0.65,   # Relaxed for returning horses  
        max_frames_missing=150                # Keep horses in memory longer
    )
    
    # Video setup
    input_video = "../../media/rolling-on-ground.mp4"
    output_video = "../../horse_tracking_enhanced_longterm.mp4"
    
    cap = cv2.VideoCapture(input_video)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))
    
    # Process full video length
    max_frames = total_frames
    
    print(f"📹 Processing {max_frames} frames ({max_frames/fps:.1f} seconds) - ENHANCED LONG-TERM...")
    print(f"   🎯 Focus: Prevent new IDs for returning horses")
    print(f"   📊 Target: 3 horses maximum (not 11+)")
    
    stats = {
        'frames_processed': 0,
        'horses_detected': 0,
        'poses_estimated': 0,
        're_identifications': 0
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
            
            # Enhanced matching with long-term re-identification
            matched_horses = tracker.match_horses_frame(detections_with_poses)
            
            # Count re-identifications
            for horse in matched_horses:
                if frame_idx - horse.last_seen_frame > 30:
                    stats['re_identifications'] += 1
            
            # Draw all matched horses
            for horse in matched_horses:
                # Get display info
                color = horse.color
                bbox = horse.last_bbox
                
                # Draw bounding box with horse-specific color
                x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
                cv2.rectangle(overlay_frame, (x, y), (x + w, y + h), color, 3)
                
                # Enhanced horse ID display with absence info
                matching_detection = None
                for det, _, _, _ in detections_with_poses:
                    if det['bbox'] == bbox:
                        matching_detection = det
                        break
                
                confidence = matching_detection['confidence'] if matching_detection else 0.0
                text = f"Horse #{horse.horse_id} ({confidence:.1%})"
                
                # Add coat color and status info
                if horse.primary_coat_color and horse.primary_coat_color != "unknown":
                    text += f" - {horse.primary_coat_color}"
                
                # Show if this is a recent re-identification
                if horse.frames_absent > 0:
                    text += f" [back after {horse.frames_absent}f]"
                
                # Background for text
                text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
                cv2.rectangle(overlay_frame, 
                            (x, y - text_size[1] - 10),
                            (x + text_size[0] + 10, y),
                            color, -1)
                cv2.putText(overlay_frame, text, (x + 5, y - 5),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                
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
        
        # Draw enhanced tracking statistics
        tracking_stats = tracker.get_stats()
        stats_text = [
            f"Frame: {frame_idx}/{max_frames}",
            f"Active Horses: {tracking_stats['currently_active']}",
            f"Known Horses: {tracking_stats['horses_in_memory']}",
            f"Total Created: {tracking_stats['total_horses_created']}",
            f"Re-IDs: {stats['re_identifications']}"
        ]
        
        y_offset = 30
        for i, text in enumerate(stats_text):
            # Highlight total created if > 3
            text_color = (0, 0, 255) if "Total Created:" in text and tracking_stats['total_horses_created'] > 3 else (0, 255, 0)
            cv2.putText(overlay_frame, text, (10, y_offset),
                      cv2.FONT_HERSHEY_SIMPLEX, 0.7, text_color, 2)
            y_offset += 30
        
        out.write(overlay_frame)
        stats['frames_processed'] += 1
        
        # Progress updates
        if frame_idx % 100 == 0 and frame_idx > 0:
            elapsed = time.time() - start_time
            fps_actual = frame_idx / elapsed
            eta = (max_frames - frame_idx) / fps_actual
            print(f"   Frame {frame_idx}/{max_frames} | {fps_actual:.1f} fps | ETA: {eta:.1f}s")
            
            # Show current horses and re-identification success
            all_known = tracker.get_all_known_horses(frame_idx)
            if all_known:
                horse_info = []
                for h in all_known:
                    status = "active" if frame_idx - h.last_seen_frame <= 30 else f"absent {frame_idx - h.last_seen_frame}f"
                    horse_info.append(f"#{h.horse_id}({status})")
                print(f"   Known horses: {', '.join(horse_info)}")
                print(f"   🎯 Total horses created so far: {len(tracker.horses)} (target: 3)")
    
    cap.release()
    out.release()
    
    elapsed_time = time.time() - start_time
    
    print(f"\n📊 Enhanced Long-term Tracking Results:")
    print(f"   Frames processed: {stats['frames_processed']}")
    print(f"   Processing time: {elapsed_time:.1f}s ({stats['frames_processed']/elapsed_time:.1f} fps)")
    print(f"   Total detections: {stats['horses_detected']}")
    print(f"   Poses estimated: {stats['poses_estimated']}")
    print(f"   Re-identifications: {stats['re_identifications']}")
    
    final_stats = tracker.get_stats()
    print(f"\n🎯 Final Horse Count Analysis:")
    print(f"   Total horses created: {final_stats['total_horses_created']} (target: 3)")
    
    if final_stats['total_horses_created'] <= 5:
        print("   ✅ SUCCESS: Significant improvement in horse re-identification!")
    else:
        print("   ⚠️  Still room for improvement in long-term re-identification")
    
    # Show details for each tracked horse
    print(f"\n🐎 Individual Horse Details:")
    for horse_id in sorted(tracker.horses.keys()):
        horse = tracker.horses[horse_id]
        print(f"   Horse #{horse_id}:")
        print(f"      Total detections: {horse.detection_count}")
        print(f"      Total frames seen: {horse.total_frames_seen}")
        print(f"      Avg confidence: {horse.avg_confidence:.1%}")
        print(f"      Coat color: {horse.primary_coat_color}")
        print(f"      Last seen: frame {horse.last_seen_frame}")
    
    print(f"\n✅ Video created: {output_video}")
    print(f"   Key improvements:")
    print(f"   - Two-phase matching: active vs. dormant horses")
    print(f"   - Relaxed similarity threshold for returning horses") 
    print(f"   - Longer memory: horses kept for 150 frames")
    print(f"   - Enhanced feature consolidation over time")
    
    return final_stats['total_horses_created']


def main():
    print("🐎 Enhanced Long-term Horse Tracking System") 
    print("=" * 80)
    print("Goal: Keep horse count at 3 (not 11+) by better re-identifying returning horses")
    print()
    
    num_horses_created = create_enhanced_long_term_video()
    
    print(f"\n🎉 Enhanced Long-term Tracking Complete!")
    print(f"   Total horses created: {num_horses_created} (previous: 13)")
    
    if num_horses_created <= 5:
        print("   🎯 MAJOR IMPROVEMENT: Much better re-identification of returning horses!")
    else:
        print("   📈 Improvement achieved, but still room for refinement")
    
    return 0


if __name__ == "__main__":
    exit(main())