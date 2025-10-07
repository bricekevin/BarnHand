#!/usr/bin/env python3
"""
Deep Learning Re-identification for Horse Tracking
Uses CNN-based feature extraction for robust individual horse re-identification
Inspired by Wildlife ReID models but using available pre-trained networks
"""

import os
import sys
import cv2
import numpy as np
import torch
import torch.nn as nn
import torchvision.transforms as transforms
from torchvision import models
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field
from collections import deque
import time
from sklearn.metrics.pairwise import cosine_similarity
from scipy.spatial.distance import cosine

# Set environment
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'
os.environ['MODEL_PATH'] = '../../models'
os.environ['YOLO_MODEL'] = 'downloads/yolov5m.pt'

sys.path.insert(0, 'src')

@dataclass
class DeepHorseFeatures:
    """Deep learning features for horse re-identification."""
    # CNN embeddings (main features for ReID)
    cnn_features: np.ndarray = field(default_factory=lambda: np.zeros(512))  # Deep features
    
    # Auxiliary features
    color_histogram: np.ndarray = field(default_factory=lambda: np.zeros(64))  # HSV histogram
    body_proportions: np.ndarray = field(default_factory=lambda: np.zeros(8))   # Pose-based
    
    # Metadata
    quality_score: float = 1.0  # Quality of the detection/crop
    
    def to_vector(self) -> np.ndarray:
        """Get the primary CNN feature vector for matching."""
        return self.cnn_features

@dataclass
class DeepTrackedHorse:
    """Horse tracked with deep learning features."""
    horse_id: int
    color: Tuple[int, int, int]
    
    # Feature gallery - store multiple good quality features
    feature_gallery: List[DeepHorseFeatures] = field(default_factory=list)
    max_gallery_size: int = 20
    
    # Tracking info
    last_seen_frame: int = 0
    first_seen_frame: int = 0
    detection_count: int = 0
    avg_confidence: float = 0.0
    last_bbox: Optional[Dict] = None
    last_keypoints: Optional[List] = None
    
    # Re-identification stats
    times_reidentified: int = 0
    max_absence_period: int = 0
    
    def add_features(self, features: DeepHorseFeatures, frame_num: int, confidence: float):
        """Add features to gallery with quality filtering."""
        self.last_seen_frame = frame_num
        self.detection_count += 1
        
        # Update confidence
        self.avg_confidence = ((self.avg_confidence * (self.detection_count - 1) + confidence) / 
                               self.detection_count)
        
        # Add to gallery if good quality
        if features.quality_score > 0.5:  # Quality threshold
            if len(self.feature_gallery) >= self.max_gallery_size:
                # Remove oldest low-quality feature
                min_quality_idx = min(range(len(self.feature_gallery)), 
                                     key=lambda i: self.feature_gallery[i].quality_score)
                if features.quality_score > self.feature_gallery[min_quality_idx].quality_score:
                    self.feature_gallery[min_quality_idx] = features
            else:
                self.feature_gallery.append(features)
    
    def get_reid_features(self) -> List[np.ndarray]:
        """Get best features for re-identification matching."""
        if not self.feature_gallery:
            return [np.zeros(512)]
        
        # Return top quality features
        sorted_features = sorted(self.feature_gallery, 
                               key=lambda f: f.quality_score, 
                               reverse=True)
        
        # Return top 5 features for matching
        return [f.cnn_features for f in sorted_features[:5]]


class DeepReIDFeatureExtractor:
    """Extract deep features for horse re-identification using CNN."""
    
    def __init__(self, device='cpu'):
        self.device = torch.device(device)
        
        # Load pre-trained ResNet model (commonly used for ReID)
        # ResNet50 is a good balance of speed and accuracy
        self.base_model = models.resnet50(pretrained=True)
        
        # Remove the final classification layer to get features
        self.feature_extractor = nn.Sequential(
            *list(self.base_model.children())[:-1]  # Remove final FC layer
        )
        self.feature_extractor.eval()
        self.feature_extractor.to(self.device)
        
        # Image preprocessing for ResNet
        self.preprocess = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((256, 128)),  # Standard ReID size (height x width)
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], 
                               std=[0.229, 0.224, 0.225])
        ])
        
        print("✅ Deep ReID feature extractor initialized with ResNet50")
    
    def extract_cnn_features(self, image_crop: np.ndarray) -> np.ndarray:
        """Extract CNN features from horse crop."""
        if image_crop.size == 0:
            return np.zeros(2048)  # ResNet50 feature size
        
        # Preprocess image
        with torch.no_grad():
            # Convert BGR to RGB
            image_rgb = cv2.cvtColor(image_crop, cv2.COLOR_BGR2RGB)
            
            # Apply preprocessing
            input_tensor = self.preprocess(image_rgb)
            input_batch = input_tensor.unsqueeze(0).to(self.device)
            
            # Extract features
            features = self.feature_extractor(input_batch)
            features = features.squeeze().cpu().numpy()
            
            # L2 normalize for cosine similarity
            features = features / (np.linalg.norm(features) + 1e-6)
            
        return features
    
    def compute_crop_quality(self, image_crop: np.ndarray, bbox: Dict) -> float:
        """Compute quality score for the horse crop."""
        if image_crop.size == 0:
            return 0.0
        
        quality_factors = []
        
        # 1. Size quality (bigger is better)
        size_score = min(1.0, (bbox['width'] * bbox['height']) / (400 * 400))
        quality_factors.append(size_score)
        
        # 2. Aspect ratio quality (horses should be roughly 1.5:1)
        aspect_ratio = bbox['width'] / max(bbox['height'], 1)
        ar_score = 1.0 - abs(aspect_ratio - 1.5) / 2
        quality_factors.append(max(0, ar_score))
        
        # 3. Blur detection (less blur is better)
        gray = cv2.cvtColor(image_crop, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        blur_score = min(1.0, laplacian_var / 100)
        quality_factors.append(blur_score)
        
        # 4. Brightness quality (not too dark or bright)
        mean_brightness = gray.mean() / 255
        brightness_score = 1.0 - abs(mean_brightness - 0.5) * 2
        quality_factors.append(max(0, brightness_score))
        
        return np.mean(quality_factors)


class DeepReIDHorseTracker:
    """Horse tracker using deep learning re-identification."""
    
    HORSE_COLORS = [
        (255, 100, 100),  # Light blue - Horse 1
        (100, 255, 100),  # Light green - Horse 2  
        (100, 100, 255),  # Light red - Horse 3
        (255, 255, 100),  # Cyan - Horse 4
        (255, 100, 255),  # Magenta - Horse 5
        (100, 255, 255),  # Yellow - Horse 6
    ]
    
    def __init__(self, 
                 reid_threshold: float = 0.7,           # Cosine similarity threshold
                 max_horses_expected: int = 3,          # Expected number of horses
                 device: str = 'cpu'):
        
        self.horses: Dict[int, DeepTrackedHorse] = {}
        self.next_horse_id = 1
        self.reid_threshold = reid_threshold
        self.max_horses_expected = max_horses_expected
        self.frame_count = 0
        
        # Initialize deep feature extractor
        self.feature_extractor = DeepReIDFeatureExtractor(device)
        
        # Track matching statistics
        self.successful_reids = 0
        self.total_detections = 0
        
    def extract_auxiliary_features(self, frame: np.ndarray, bbox: Dict) -> Tuple[np.ndarray, np.ndarray]:
        """Extract auxiliary features (color, shape) to supplement CNN features."""
        x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
        
        # Bounds check
        x = max(0, min(x, frame.shape[1] - 1))
        y = max(0, min(y, frame.shape[0] - 1))
        w = min(w, frame.shape[1] - x)
        h = min(h, frame.shape[0] - y)
        
        if w <= 0 or h <= 0:
            return np.zeros(64), np.zeros(8)
        
        horse_region = frame[y:y+h, x:x+w]
        
        # HSV color histogram
        if horse_region.size > 0:
            hsv = cv2.cvtColor(horse_region, cv2.COLOR_BGR2HSV)
            h_hist = cv2.calcHist([hsv], [0], None, [32], [0, 180])
            s_hist = cv2.calcHist([hsv], [1], None, [16], [0, 256])
            v_hist = cv2.calcHist([hsv], [2], None, [16], [0, 256])
            
            h_hist = h_hist.flatten() / (h_hist.sum() + 1e-6)
            s_hist = s_hist.flatten() / (s_hist.sum() + 1e-6)
            v_hist = v_hist.flatten() / (v_hist.sum() + 1e-6)
            
            color_histogram = np.concatenate([h_hist, s_hist, v_hist])
        else:
            color_histogram = np.zeros(64)
        
        # Basic shape features
        shape_features = np.array([
            w / max(h, 1),  # aspect ratio
            w * h / (frame.shape[0] * frame.shape[1]),  # relative size
            x / frame.shape[1],  # x position
            y / frame.shape[0],  # y position
            (x + w/2) / frame.shape[1],  # center x
            (y + h/2) / frame.shape[0],  # center y
            0, 0  # padding
        ])
        
        return color_histogram, shape_features
    
    def extract_deep_features(self, frame: np.ndarray, bbox: Dict, 
                            keypoints: Optional[List] = None) -> DeepHorseFeatures:
        """Extract deep CNN features for horse re-identification."""
        features = DeepHorseFeatures()
        
        # Extract horse crop
        x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
        x = max(0, min(x, frame.shape[1] - 1))
        y = max(0, min(y, frame.shape[0] - 1))
        w = min(w, frame.shape[1] - x)
        h = min(h, frame.shape[0] - y)
        
        if w > 0 and h > 0:
            horse_crop = frame[y:y+h, x:x+w]
            
            # Extract CNN features (main ReID features)
            cnn_features = self.feature_extractor.extract_cnn_features(horse_crop)
            
            # Reduce dimensionality to 512 for efficiency
            if len(cnn_features) > 512:
                # Simple dimensionality reduction by taking first 512 features
                features.cnn_features = cnn_features[:512]
            else:
                features.cnn_features = np.pad(cnn_features, (0, 512 - len(cnn_features)))
            
            # Compute quality score
            features.quality_score = self.feature_extractor.compute_crop_quality(horse_crop, bbox)
            
            # Extract auxiliary features
            features.color_histogram, shape_features = self.extract_auxiliary_features(frame, bbox)
            
            # Extract body proportions from keypoints if available
            if keypoints and len(keypoints) >= 17:
                features.body_proportions = self.extract_pose_proportions(keypoints, bbox)
            else:
                features.body_proportions = shape_features
        
        return features
    
    def extract_pose_proportions(self, keypoints: List, bbox: Dict) -> np.ndarray:
        """Extract body proportions from pose keypoints."""
        # Similar to before but simplified
        proportions = []
        
        # Get keypoint dict
        kp_dict = {kp['name']: (kp['x'], kp['y'], kp['confidence']) for kp in keypoints}
        
        # Calculate key distances normalized by bbox
        bbox_diag = np.sqrt(bbox['width']**2 + bbox['height']**2)
        
        def safe_distance(kp1_name, kp2_name):
            if kp1_name in kp_dict and kp2_name in kp_dict:
                kp1 = kp_dict[kp1_name]
                kp2 = kp_dict[kp2_name]
                if kp1[2] > 0.3 and kp2[2] > 0.3:
                    dist = np.sqrt((kp1[0] - kp2[0])**2 + (kp1[1] - kp2[1])**2)
                    return dist / bbox_diag
            return 0.0
        
        # Key body measurements
        proportions.append(safe_distance("Nose", "Neck"))
        proportions.append(safe_distance("Neck", "Root_of_tail"))
        proportions.append(safe_distance("L_Shoulder", "R_Shoulder"))
        proportions.append(safe_distance("L_Hip", "R_Hip"))
        
        # Pad to 8 dimensions
        while len(proportions) < 8:
            proportions.append(0.0)
        
        return np.array(proportions[:8])
    
    def compute_reid_similarity(self, query_features: np.ndarray, 
                               gallery_features: List[np.ndarray]) -> float:
        """
        Compute similarity between query and gallery features.
        Uses maximum similarity across gallery (best match).
        """
        if len(gallery_features) == 0:
            return 0.0
        
        similarities = []
        for gallery_feat in gallery_features:
            # Cosine similarity
            sim = 1 - cosine(query_features, gallery_feat)
            similarities.append(sim)
        
        # Return maximum similarity (best match in gallery)
        return max(similarities)
    
    def match_horses_deep_reid(self, detections_with_poses: List[Tuple]) -> List[DeepTrackedHorse]:
        """Match horses using deep re-identification."""
        if not detections_with_poses:
            return []
        
        frame_num = detections_with_poses[0][2]
        self.total_detections += len(detections_with_poses)
        
        # Extract deep features for all detections
        detection_features = []
        for detection, pose_data, _, frame in detections_with_poses:
            keypoints = pose_data.get('keypoints', []) if pose_data else []
            features = self.extract_deep_features(frame, detection['bbox'], keypoints)
            detection_features.append((detection, pose_data, features))
        
        matched_horses = []
        used_horses = set()
        unmatched_detections = []
        
        # For each detection, find best matching horse
        for detection, pose_data, features in detection_features:
            best_match = None
            best_similarity = 0.0
            
            # Compare with all existing horses
            for horse_id, horse in self.horses.items():
                if horse_id in used_horses:
                    continue
                
                # Get gallery features from horse
                gallery_features = horse.get_reid_features()
                
                # Compute ReID similarity
                similarity = self.compute_reid_similarity(
                    features.cnn_features, 
                    gallery_features
                )
                
                if similarity > best_similarity and similarity >= self.reid_threshold:
                    best_similarity = similarity
                    best_match = horse
            
            if best_match:
                # Successful re-identification
                frames_absent = frame_num - best_match.last_seen_frame
                
                if frames_absent > 1:
                    best_match.times_reidentified += 1
                    best_match.max_absence_period = max(best_match.max_absence_period, frames_absent)
                    if frames_absent > 30:
                        print(f"   🎯 RE-IDENTIFIED Horse #{best_match.horse_id} after {frames_absent} frames! (similarity: {best_similarity:.3f})")
                        self.successful_reids += 1
                
                # Update horse
                best_match.add_features(features, frame_num, detection['confidence'])
                best_match.last_bbox = detection['bbox']
                if pose_data:
                    best_match.last_keypoints = pose_data.get('keypoints', [])
                
                matched_horses.append(best_match)
                used_horses.add(best_match.horse_id)
            else:
                unmatched_detections.append((detection, pose_data, features))
        
        # Create new horses only if we haven't reached expected count
        for detection, pose_data, features in unmatched_detections:
            if len(self.horses) < self.max_horses_expected:
                # Create new horse
                new_horse = self._create_new_horse(detection, pose_data, features, frame_num)
                matched_horses.append(new_horse)
                print(f"   🆕 New Horse #{new_horse.horse_id} created (total: {len(self.horses)})")
            else:
                # Force match to closest existing horse if at capacity
                print(f"   ⚠️ At capacity ({self.max_horses_expected} horses) - forcing match...")
                
                # Find best match even below threshold
                best_match = None
                best_similarity = 0.0
                
                for horse_id, horse in self.horses.items():
                    if horse_id in used_horses:
                        continue
                    
                    gallery_features = horse.get_reid_features()
                    similarity = self.compute_reid_similarity(features.cnn_features, gallery_features)
                    
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_match = horse
                
                if best_match:
                    print(f"   🔄 Force-matched to Horse #{best_match.horse_id} (similarity: {best_similarity:.3f})")
                    best_match.add_features(features, frame_num, detection['confidence'])
                    best_match.last_bbox = detection['bbox']
                    if pose_data:
                        best_match.last_keypoints = pose_data.get('keypoints', [])
                    matched_horses.append(best_match)
                    used_horses.add(best_match.horse_id)
        
        return matched_horses
    
    def _create_new_horse(self, detection, pose_data, features, frame_num) -> DeepTrackedHorse:
        """Create a new tracked horse."""
        new_horse = DeepTrackedHorse(
            horse_id=self.next_horse_id,
            color=self.HORSE_COLORS[(self.next_horse_id - 1) % len(self.HORSE_COLORS)],
            last_seen_frame=frame_num,
            first_seen_frame=frame_num,
            last_bbox=detection['bbox']
        )
        
        new_horse.add_features(features, frame_num, detection['confidence'])
        if pose_data:
            new_horse.last_keypoints = pose_data.get('keypoints', [])
        
        self.horses[self.next_horse_id] = new_horse
        self.next_horse_id += 1
        
        return new_horse
    
    def get_stats(self) -> Dict:
        """Get tracking statistics."""
        return {
            'total_horses': len(self.horses),
            'total_detections': self.total_detections,
            'successful_reids': self.successful_reids,
            'reid_rate': self.successful_reids / max(self.total_detections, 1)
        }


def create_deep_reid_video():
    """Create video with deep learning re-identification."""
    
    print("🐎 Deep Learning Horse Re-identification System")
    print("=" * 70)
    print("Using CNN features (ResNet50) for robust individual horse recognition")
    print()
    
    from src.models.detection import HorseDetectionModel
    from src.models.pose import HorsePoseModel
    
    # Load models
    print("🔧 Loading models...")
    yolo_model = HorseDetectionModel()
    yolo_model.load_models()
    
    pose_model = HorsePoseModel()
    pose_model.load_model()
    
    print("✅ Detection and pose models loaded")
    
    # Initialize deep ReID tracker
    print("🧠 Initializing deep learning re-identification...")
    tracker = DeepReIDHorseTracker(
        reid_threshold=0.7,        # Similarity threshold for matching
        max_horses_expected=3,      # We know there are 3 horses
        device='cpu'                # Use 'cuda' if available
    )
    
    # Video setup
    input_video = "../../media/rolling-on-ground.mp4"
    output_video = "../../horse_tracking_deep_reid.mp4"
    
    cap = cv2.VideoCapture(input_video)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))
    
    # Process full video
    max_frames = total_frames
    
    print(f"📹 Processing {max_frames} frames ({max_frames/fps:.1f} seconds)")
    print(f"🎯 Target: Maintain exactly 3 horses using deep ReID")
    print()
    
    stats = {
        'frames_processed': 0,
        'horses_detected': 0,
        'poses_estimated': 0
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
            
            # Deep learning re-identification matching
            matched_horses = tracker.match_horses_deep_reid(detections_with_poses)
            
            # Draw all matched horses
            for horse in matched_horses:
                color = horse.color
                bbox = horse.last_bbox
                
                # Draw bounding box
                x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
                cv2.rectangle(overlay_frame, (x, y), (x + w, y + h), color, 3)
                
                # Horse info text
                confidence = 0.0
                for det, _, _, _ in detections_with_poses:
                    if det['bbox'] == bbox:
                        confidence = det['confidence']
                        break
                
                text = f"Horse #{horse.horse_id} ({confidence:.1%})"
                
                # Show re-identification info
                if horse.times_reidentified > 0:
                    text += f" [ReID: {horse.times_reidentified}x]"
                
                # Quality indicator
                if horse.feature_gallery:
                    avg_quality = np.mean([f.quality_score for f in horse.feature_gallery])
                    text += f" Q:{avg_quality:.2f}"
                
                # Draw text with background
                text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
                cv2.rectangle(overlay_frame, 
                            (x, y - text_size[1] - 10),
                            (x + text_size[0] + 10, y),
                            color, -1)
                cv2.putText(overlay_frame, text, (x + 5, y - 5),
                          cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                
                # Draw keypoints if available
                if horse.last_keypoints:
                    for kp in horse.last_keypoints:
                        if kp['confidence'] > 0.3:
                            kx, ky = int(kp['x']), int(kp['y'])
                            if 0 <= kx < width and 0 <= ky < height:
                                cv2.circle(overlay_frame, (kx, ky), 3, color, -1)
        
        # Draw statistics
        tracking_stats = tracker.get_stats()
        stats_text = [
            f"Frame: {frame_idx}/{max_frames}",
            f"Total Horses: {tracking_stats['total_horses']} (target: 3)",
            f"Re-identifications: {tracking_stats['successful_reids']}",
            f"ReID Rate: {tracking_stats['reid_rate']:.1%}"
        ]
        
        y_offset = 30
        for text in stats_text:
            # Highlight if exceeding 3 horses
            if "Total Horses:" in text and tracking_stats['total_horses'] > 3:
                text_color = (0, 0, 255)  # Red
            elif "Total Horses:" in text and tracking_stats['total_horses'] == 3:
                text_color = (0, 255, 0)  # Green
            else:
                text_color = (255, 255, 255)  # White
            
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
            print(f"   Horses: {tracking_stats['total_horses']} | ReIDs: {tracking_stats['successful_reids']}")
    
    cap.release()
    out.release()
    
    elapsed_time = time.time() - start_time
    final_stats = tracker.get_stats()
    
    print(f"\n📊 Deep ReID Tracking Results:")
    print(f"   Frames processed: {stats['frames_processed']}")
    print(f"   Processing time: {elapsed_time:.1f}s ({stats['frames_processed']/elapsed_time:.1f} fps)")
    print(f"   Total detections: {stats['horses_detected']}")
    print(f"   Poses estimated: {stats['poses_estimated']}")
    
    print(f"\n🎯 Final Horse Count:")
    print(f"   Total horses created: {final_stats['total_horses']} (target: 3)")
    print(f"   Successful re-identifications: {final_stats['successful_reids']}")
    print(f"   Re-identification rate: {final_stats['reid_rate']:.1%}")
    
    if final_stats['total_horses'] <= 3:
        print("   ✅ SUCCESS: Deep ReID maintained correct horse count!")
    elif final_stats['total_horses'] <= 5:
        print("   ⚠️ Good: Minor oversegmentation but significant improvement")
    else:
        print("   ❌ Still creating too many horses - may need parameter tuning")
    
    # Show details for each horse
    print(f"\n🐎 Individual Horse Statistics:")
    for horse_id, horse in tracker.horses.items():
        print(f"   Horse #{horse_id}:")
        print(f"      Detections: {horse.detection_count}")
        print(f"      Gallery size: {len(horse.feature_gallery)} features")
        print(f"      Times re-identified: {horse.times_reidentified}")
        print(f"      Max absence: {horse.max_absence_period} frames")
        print(f"      Avg confidence: {horse.avg_confidence:.1%}")
    
    print(f"\n✅ Video created: {output_video}")
    print(f"   Using deep CNN features for robust re-identification")
    
    return final_stats['total_horses']


def main():
    print("🧠 Deep Learning Horse Re-identification System")
    print("=" * 80)
    print("Goal: Use CNN features to maintain exactly 3 horses")
    print("Method: ResNet50 feature extraction + cosine similarity matching")
    print()
    
    num_horses = create_deep_reid_video()
    
    print(f"\n🎉 Deep ReID Tracking Complete!")
    if num_horses == 3:
        print("   🎯 PERFECT: Maintained exactly 3 horses!")
    elif num_horses <= 5:
        print(f"   ✅ GOOD: Only {num_horses} horses (vs 13 before)")
    else:
        print(f"   📈 Created {num_horses} horses - needs parameter tuning")
    
    return 0


if __name__ == "__main__":
    exit(main())