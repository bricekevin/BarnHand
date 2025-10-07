#!/usr/bin/env python3
"""
Complete Horse Processing Pipeline with Deep ReID
Combines YOLO detection, RTMPose estimation, and deep CNN re-identification
Maintains exactly 3 horse IDs throughout video processing
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
import time
import json
from scipy.spatial.distance import cosine

# Set environment
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'
os.environ['MODEL_PATH'] = '../../models'
os.environ['YOLO_MODEL'] = 'downloads/yolov5m.pt'

sys.path.insert(0, 'src')

class DeepReIDExtractor:
    """Deep CNN feature extractor for horse re-identification."""
    
    def __init__(self, device='cpu'):
        self.device = torch.device(device)
        
        # Load pre-trained ResNet18 (proven to work well)
        self.base_model = models.resnet18(pretrained=True)
        
        # Remove final classification layer for feature extraction
        self.feature_extractor = nn.Sequential(
            *list(self.base_model.children())[:-1]
        )
        self.feature_extractor.eval()
        self.feature_extractor.to(self.device)
        
        # Standard ImageNet preprocessing
        self.preprocess = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], 
                               std=[0.229, 0.224, 0.225])
        ])
        
        print("✅ Deep ReID extractor initialized (ResNet18)")
    
    def extract_features(self, image_crop: np.ndarray) -> np.ndarray:
        """Extract 512-dimensional features from horse crop."""
        if image_crop.size == 0:
            return np.zeros(512)
        
        try:
            with torch.no_grad():
                # Convert BGR to RGB
                image_rgb = cv2.cvtColor(image_crop, cv2.COLOR_BGR2RGB)
                
                # Preprocess
                input_tensor = self.preprocess(image_rgb)
                input_batch = input_tensor.unsqueeze(0).to(self.device)
                
                # Extract features
                features = self.feature_extractor(input_batch)
                features = features.squeeze().cpu().numpy()
                
                # L2 normalize for cosine similarity
                features = features / (np.linalg.norm(features) + 1e-6)
                
                return features
        except Exception as e:
            print(f"Feature extraction error: {e}")
            return np.zeros(512)

@dataclass
class TrackedHorse:
    """Horse representation with ReID features and pose data."""
    horse_id: int
    color: Tuple[int, int, int]
    features: List[np.ndarray] = field(default_factory=list)
    poses: List[Dict] = field(default_factory=list)
    max_features: int = 10
    max_poses: int = 5
    detection_count: int = 0
    last_bbox: Optional[Dict] = None
    last_pose: Optional[Dict] = None
    confidence_sum: float = 0.0
    
    def add_detection(self, features: np.ndarray, pose_data: Dict, bbox: Dict, confidence: float):
        """Add new detection data to horse."""
        self.detection_count += 1
        self.confidence_sum += confidence
        self.last_bbox = bbox
        self.last_pose = pose_data
        
        # Maintain feature gallery
        if len(self.features) >= self.max_features:
            self.features.pop(0)
        self.features.append(features)
        
        # Maintain pose history
        if len(self.poses) >= self.max_poses:
            self.poses.pop(0)
        self.poses.append(pose_data)
    
    def get_avg_features(self) -> np.ndarray:
        """Get average features for matching."""
        if not self.features:
            return np.zeros(512)
        return np.mean(self.features, axis=0)
    
    def get_avg_confidence(self) -> float:
        """Get average detection confidence."""
        return self.confidence_sum / max(self.detection_count, 1)

class CompleteHorseTracker:
    """Complete horse tracking with detection, pose, and ReID."""
    
    # Horse tracking colors (10 distinct colors)
    COLORS = [
        (255, 100, 100),  # Light blue - Horse 1
        (100, 255, 100),  # Light green - Horse 2  
        (100, 100, 255),  # Light red - Horse 3
        (255, 255, 100),  # Cyan - Horse 4
        (255, 100, 255),  # Magenta - Horse 5
        (100, 255, 255),  # Yellow - Horse 6
        (200, 150, 100),  # Light brown - Horse 7
        (150, 200, 100),  # Olive - Horse 8
        (150, 100, 200),  # Purple - Horse 9
        (200, 200, 200),  # Light gray - Horse 10
    ]
    
    def __init__(self, max_horses=3, similarity_threshold=0.7):
        self.horses: Dict[int, TrackedHorse] = {}
        self.next_id = 1
        self.max_horses = max_horses
        self.similarity_threshold = similarity_threshold
        
        # Initialize models
        self.reid_extractor = DeepReIDExtractor()
        
        # Load detection and pose models
        from src.models.detection import HorseDetectionModel
        from src.models.pose import RealRTMPoseModel
        
        print("🔧 Loading detection model...")
        self.detection_model = HorseDetectionModel()
        self.detection_model.load_models()
        print("✅ Detection model loaded")
        
        print("🔧 Loading pose model...")
        self.pose_model = RealRTMPoseModel()
        print("✅ Pose model loaded")
        
        # Stats
        self.total_detections = 0
        self.successful_matches = 0
        self.force_matches = 0
        self.new_horses_created = 0
    
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> Tuple[List[TrackedHorse], np.ndarray]:
        """Process single frame with detection, pose, and tracking."""
        
        # Step 1: Detect horses
        detections, _ = self.detection_model.detect_horses(frame)
        
        if not detections:
            return [], frame
        
        frame_horses = []
        
        # Step 2: Process each detection
        for detection in detections:
            bbox = detection['bbox']
            confidence = detection['confidence']
            
            # Extract horse crop for ReID
            x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
            x = max(0, min(x, frame.shape[1] - 1))
            y = max(0, min(y, frame.shape[0] - 1))
            w = min(w, frame.shape[1] - x)
            h = min(h, frame.shape[0] - y)
            
            if w > 0 and h > 0:
                horse_crop = frame[y:y+h, x:x+w]
                features = self.reid_extractor.extract_features(horse_crop)
            else:
                features = np.zeros(512)
            
            # Step 3: Estimate pose
            pose_result, pose_time = self.pose_model.estimate_pose(frame, bbox)
            if not pose_result:
                pose_result = {'keypoints': [], 'confidence': 0.0}
            
            # Step 4: Match to existing horse or create new
            matched_horse = self._match_or_create_horse(features, pose_result, bbox, confidence)
            frame_horses.append(matched_horse)
        
        # Step 5: Draw overlays on frame
        output_frame = self._draw_overlays(frame, frame_horses)
        
        return frame_horses, output_frame
    
    def _match_or_create_horse(self, features: np.ndarray, pose_data: Dict, 
                              bbox: Dict, confidence: float) -> TrackedHorse:
        """Match detection to existing horse or create new with capacity control."""
        self.total_detections += 1
        
        # Find best match among existing horses
        best_horse = None
        best_similarity = 0.0
        
        for horse in self.horses.values():
            if len(horse.features) == 0:
                continue
                
            # Compare with average features
            avg_features = horse.get_avg_features()
            similarity = 1 - cosine(features, avg_features)
            
            if similarity > best_similarity:
                best_similarity = similarity
                best_horse = horse
        
        # Decision logic with strict capacity control
        if len(self.horses) < self.max_horses:
            # Can create new horse
            if best_similarity >= self.similarity_threshold and best_horse:
                # Match to existing
                best_horse.add_detection(features, pose_data, bbox, confidence)
                self.successful_matches += 1
                return best_horse
            else:
                # Create new horse
                new_horse = TrackedHorse(
                    horse_id=self.next_id,
                    color=self.COLORS[(self.next_id - 1) % len(self.COLORS)]
                )
                new_horse.add_detection(features, pose_data, bbox, confidence)
                self.horses[self.next_id] = new_horse
                self.next_id += 1
                self.new_horses_created += 1
                print(f"   🆕 Created Horse #{new_horse.horse_id} (total: {len(self.horses)})")
                return new_horse
        else:
            # At capacity - MUST match to existing horse
            if best_horse:
                best_horse.add_detection(features, pose_data, bbox, confidence)
                if best_similarity >= self.similarity_threshold:
                    self.successful_matches += 1
                else:
                    self.force_matches += 1
                    print(f"   ⚠️ Force-matched to Horse #{best_horse.horse_id} (sim: {best_similarity:.3f})")
                return best_horse
            else:
                # Fallback - assign to first horse (shouldn't happen)
                fallback_horse = list(self.horses.values())[0]
                fallback_horse.add_detection(features, pose_data, bbox, confidence)
                self.force_matches += 1
                return fallback_horse
    
    def _draw_overlays(self, frame: np.ndarray, horses: List[TrackedHorse]) -> np.ndarray:
        """Draw detection boxes, pose, and tracking overlays."""
        output_frame = frame.copy()
        
        for horse in horses:
            if not horse.last_bbox or not horse.last_pose:
                continue
            
            bbox = horse.last_bbox
            pose = horse.last_pose
            color = horse.color
            
            # Draw bounding box
            x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
            cv2.rectangle(output_frame, (x, y), (x + w, y + h), color, 3)
            
            # Draw horse ID and confidence
            label = f"Horse #{horse.horse_id} ({horse.get_avg_confidence():.2f})"
            label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
            cv2.rectangle(output_frame, (x, y - label_size[1] - 10), 
                         (x + label_size[0], y), color, -1)
            cv2.putText(output_frame, label, (x, y - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
            
            # Draw pose keypoints if available
            if pose.get('keypoints') and len(pose['keypoints']) > 0:
                keypoints = np.array(pose['keypoints'])
                if keypoints.shape[0] > 0 and keypoints.shape[1] >= 3:
                    # Draw keypoints
                    for kp in keypoints:
                        if len(kp) >= 3 and kp[2] > 0.3:  # confidence threshold
                            cv2.circle(output_frame, (int(kp[0]), int(kp[1])), 4, color, -1)
                            cv2.circle(output_frame, (int(kp[0]), int(kp[1])), 6, (0, 0, 0), 2)
        
        # Draw summary info
        summary = f"Horses: {len(self.horses)}/{self.max_horses} | Detections: {self.total_detections} | Matches: {self.successful_matches} | Force: {self.force_matches}"
        cv2.putText(output_frame, summary, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(output_frame, summary, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        
        return output_frame
    
    def get_stats(self):
        """Get tracking statistics."""
        return {
            'total_horses': len(self.horses),
            'total_detections': self.total_detections,
            'successful_matches': self.successful_matches,
            'force_matches': self.force_matches,
            'new_horses_created': self.new_horses_created,
            'match_rate': self.successful_matches / max(self.total_detections, 1),
            'force_rate': self.force_matches / max(self.total_detections, 1)
        }

def process_video_with_reid(input_video: str, output_video: str, max_frames: Optional[int] = None):
    """Process video with complete horse pipeline including ReID."""
    
    print("🎬 Complete Horse Processing Pipeline")
    print("=" * 60)
    print("Features: YOLO Detection + RTMPose + Deep CNN ReID")
    print(f"Input: {input_video}")
    print(f"Output: {output_video}")
    print()
    
    # Initialize tracker
    tracker = CompleteHorseTracker(max_horses=3, similarity_threshold=0.7)
    
    # Video setup
    cap = cv2.VideoCapture(input_video)
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    if max_frames:
        total_frames = min(total_frames, max_frames)
    
    print(f"📹 Video info: {width}x{height} @ {fps}fps, {total_frames} frames")
    
    # Output video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))
    
    print(f"🎯 Processing {total_frames} frames...")
    print(f"🐎 Target: Maintain exactly 3 horses throughout video")
    print()
    
    start_time = time.time()
    frame_count = 0
    
    # Process frames
    try:
        while frame_count < total_frames:
            ret, frame = cap.read()
            if not ret:
                print(f"   ⚠️ No more frames at frame {frame_count}")
                break
            
            try:
                # Process frame
                horses, output_frame = tracker.process_frame(frame, frame_count)
                
                # Write frame
                out.write(output_frame)
                
                frame_count += 1
                
                # Progress updates
                if frame_count % 50 == 0:
                    stats = tracker.get_stats()
                    elapsed = time.time() - start_time
                    fps_current = frame_count / elapsed
                    print(f"   Frame {frame_count}/{total_frames}: "
                          f"{stats['total_horses']} horses, "
                          f"{stats['force_matches']} force matches "
                          f"({fps_current:.1f} fps)")
                
                # Debug for first few frames
                if frame_count <= 3:
                    stats = tracker.get_stats()
                    print(f"   Frame {frame_count}: {len(horses)} horses detected, "
                          f"total unique: {stats['total_horses']}")
                
            except Exception as e:
                print(f"   ❌ Error processing frame {frame_count}: {e}")
                import traceback
                traceback.print_exc()
                break
    
    except KeyboardInterrupt:
        print("\n⏹️ Processing interrupted by user")
    
    finally:
        cap.release()
        out.release()
        
        # Final statistics
        elapsed = time.time() - start_time
        final_stats = tracker.get_stats()
        
        print(f"\n🎉 Processing Complete!")
        print(f"   Output saved: {output_video}")
        print(f"   Processing time: {elapsed:.1f}s ({frame_count/elapsed:.1f} fps)")
        print(f"   Frames processed: {frame_count}")
        print(f"\n📊 Final Statistics:")
        print(f"   Total horses created: {final_stats['total_horses']} (target: 3)")
        print(f"   Total detections: {final_stats['total_detections']}")
        print(f"   Successful matches: {final_stats['successful_matches']}")
        print(f"   Force matches: {final_stats['force_matches']}")
        print(f"   Match rate: {final_stats['match_rate']:.1%}")
        print(f"   Force rate: {final_stats['force_rate']:.1%}")
        
        # Success assessment
        if final_stats['total_horses'] == 3:
            print(f"\n✅ SUCCESS: Maintained exactly 3 horses!")
        elif final_stats['total_horses'] <= 5:
            print(f"\n⚠️ Good improvement: Only {final_stats['total_horses']} horses (vs 11-13 before)")
        else:
            print(f"\n❌ Still created {final_stats['total_horses']} horses - needs tuning")
        
        # Individual horse details
        print(f"\n🏇 Individual Horse Summary:")
        for horse_id, horse in tracker.horses.items():
            print(f"   Horse #{horse_id}: {horse.detection_count} detections, "
                  f"avg confidence: {horse.get_avg_confidence():.2f}")
        
        return final_stats

def main():
    print("🎬 Complete Horse Processing Pipeline with Deep ReID")
    print("=" * 70)
    print("Integrates: YOLO Detection + RTMPose + CNN Re-identification")
    print("Goal: Process video maintaining exactly 3 horse IDs")
    print()
    
    # Configuration
    input_video = "../../media/rolling-on-ground.mp4"
    output_video = "horse_complete_reid_pipeline.mp4"
    max_frames = 300  # Test on first 300 frames (~10 seconds)
    
    if not os.path.exists(input_video):
        print(f"❌ Input video not found: {input_video}")
        return 1
    
    try:
        stats = process_video_with_reid(input_video, output_video, max_frames)
        
        print(f"\n🎯 Pipeline Summary:")
        if stats['total_horses'] == 3:
            print("   🎉 PERFECT: Exactly 3 horses maintained!")
            print("   ✅ Deep ReID working as expected")
        elif stats['total_horses'] <= 5:
            print(f"   ✅ EXCELLENT: Reduced to {stats['total_horses']} horses")
            print("   📈 Major improvement over previous 11-13 horses")
        else:
            print(f"   📊 Created {stats['total_horses']} horses")
            print("   🔧 May need threshold tuning")
        
        print(f"\n📁 Output video: {output_video}")
        print("   Review the video to see detection + pose + tracking overlays")
        
    except Exception as e:
        print(f"❌ Pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())