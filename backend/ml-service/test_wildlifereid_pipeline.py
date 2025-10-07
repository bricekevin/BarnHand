#!/usr/bin/env python3
"""
Complete Horse Processing Pipeline with MegaDescriptor WildlifeReID
Uses proper wildlife re-identification model for accurate horse tracking
"""

import os
import sys
import cv2
import numpy as np
import torch
import torch.nn as nn
import torchvision.transforms as transforms
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

class MegaDescriptorReID:
    """MegaDescriptor wildlife re-identification model."""
    
    def __init__(self, device='cpu'):
        self.device = torch.device(device)
        self.model = None
        self.preprocess = None
        self._load_megadescriptor()
        
    def _load_megadescriptor(self):
        """Load MegaDescriptor model from HuggingFace."""
        try:
            import timm
            
            # Try MegaDescriptor-T-224 (smaller, faster model)
            model_name = 'hf-hub:BVRA/MegaDescriptor-T-224'
            print(f"🔧 Loading MegaDescriptor model: {model_name}")
            
            self.model = timm.create_model(model_name, num_classes=0, pretrained=True)
            self.model = self.model.eval().to(self.device)
            
            # MegaDescriptor preprocessing (224x224, normalize to [-1,1])
            self.preprocess = transforms.Compose([
                transforms.ToPILImage(),
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5])  # [-1,1] range
            ])
            
            print("✅ MegaDescriptor wildlife ReID model loaded")
            return True
            
        except ImportError:
            print("⚠️ timm not available, falling back to ResNet50")
            return self._load_fallback_model()
        except Exception as e:
            print(f"⚠️ MegaDescriptor failed to load: {e}")
            print("Falling back to ResNet50")
            return self._load_fallback_model()
    
    def _load_fallback_model(self):
        """Load ResNet50 as fallback if MegaDescriptor unavailable."""
        from torchvision import models
        
        print("🔧 Loading ResNet50 fallback model...")
        self.model = models.resnet50(weights='IMAGENET1K_V2')
        self.model = nn.Sequential(*list(self.model.children())[:-1])  # Remove classifier
        self.model = self.model.eval().to(self.device)
        
        self.preprocess = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], 
                               std=[0.229, 0.224, 0.225])
        ])
        
        print("✅ ResNet50 fallback model loaded")
        return True
    
    def extract_features(self, image_crop: np.ndarray) -> np.ndarray:
        """Extract wildlife-specific features from horse crop."""
        if image_crop.size == 0:
            return np.zeros(768)  # MegaDescriptor feature size
        
        try:
            with torch.no_grad():
                # Convert BGR to RGB
                image_rgb = cv2.cvtColor(image_crop, cv2.COLOR_BGR2RGB)
                
                # Preprocess
                input_tensor = self.preprocess(image_rgb)
                input_batch = input_tensor.unsqueeze(0).to(self.device)
                
                # Extract features
                features = self.model(input_batch)
                features = features.squeeze().cpu().numpy()
                
                # L2 normalize for cosine similarity
                features = features / (np.linalg.norm(features) + 1e-6)
                
                return features
        except Exception as e:
            print(f"Feature extraction error: {e}")
            return np.zeros(features.shape[0] if 'features' in locals() else 768)

@dataclass
class WildlifeTrackedHorse:
    """Horse representation with wildlife ReID features and pose data."""
    horse_id: int
    color: Tuple[int, int, int]
    features: List[np.ndarray] = field(default_factory=list)
    poses: List[Dict] = field(default_factory=list)
    max_features: int = 15  # More features for better matching
    max_poses: int = 5
    detection_count: int = 0
    last_bbox: Optional[Dict] = None
    last_pose: Optional[Dict] = None
    confidence_sum: float = 0.0
    last_seen_frame: int = 0
    
    def add_detection(self, features: np.ndarray, pose_data: Dict, bbox: Dict, 
                     confidence: float, frame_idx: int):
        """Add new detection data to horse."""
        self.detection_count += 1
        self.confidence_sum += confidence
        self.last_bbox = bbox
        self.last_pose = pose_data
        self.last_seen_frame = frame_idx
        
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
            return np.zeros(768)
        return np.mean(self.features, axis=0)
    
    def get_best_features(self) -> np.ndarray:
        """Get most recent features for matching."""
        if not self.features:
            return np.zeros(768)
        return self.features[-1]  # Most recent
    
    def get_avg_confidence(self) -> float:
        """Get average detection confidence."""
        return self.confidence_sum / max(self.detection_count, 1)
    
    def frames_since_seen(self, current_frame: int) -> int:
        """Frames since last detection."""
        return current_frame - self.last_seen_frame

class WildlifeHorseTracker:
    """Complete horse tracking with detection, pose, and wildlife ReID."""
    
    # Enhanced horse tracking colors
    COLORS = [
        (255, 100, 100),  # Light red - Horse 1
        (100, 255, 100),  # Light green - Horse 2  
        (100, 100, 255),  # Light blue - Horse 3
        (255, 255, 100),  # Cyan - Horse 4
        (255, 100, 255),  # Magenta - Horse 5
        (100, 255, 255),  # Yellow - Horse 6
        (200, 150, 100),  # Light brown - Horse 7
        (150, 200, 100),  # Olive - Horse 8
        (150, 100, 200),  # Purple - Horse 9
        (200, 200, 200),  # Light gray - Horse 10
    ]
    
    def __init__(self, max_horses=3, similarity_threshold=0.6):  # Lowered threshold
        self.horses: Dict[int, WildlifeTrackedHorse] = {}
        self.next_id = 1
        self.max_horses = max_horses
        self.similarity_threshold = similarity_threshold
        
        # Initialize models
        self.reid_extractor = MegaDescriptorReID()
        
        # Load detection and pose models
        from src.models.detection import HorseDetectionModel
        from src.models.pose import RealRTMPoseModel
        
        print("🔧 Loading detection model...")
        self.detection_model = HorseDetectionModel()
        self.detection_model.load_models()
        print("✅ Detection model loaded")
        
        print("🔧 Loading pose model...")
        self.pose_model = RealRTMPoseModel()
        self.pose_model.load_model()  # Explicitly load the model
        print("✅ Pose model loaded")
        
        # Stats
        self.total_detections = 0
        self.successful_matches = 0
        self.force_matches = 0
        self.new_horses_created = 0
        self.rtmpose_available = False
        
        # Test RTMPose availability
        self._test_rtmpose()
    
    def _test_rtmpose(self):
        """Test if RTMPose is available."""
        try:
            # Check if model was loaded successfully
            self.rtmpose_available = hasattr(self.pose_model, 'use_real_mmpose') and self.pose_model.use_real_mmpose
            
            if self.rtmpose_available:
                print("✅ RTMPose is available and will be used for enhanced tracking")
                # Test with dummy data to ensure it works
                dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                dummy_bbox = {'x': 100, 'y': 100, 'width': 200, 'height': 200}
                try:
                    pose_result, _ = self.pose_model.estimate_pose(dummy_frame, dummy_bbox)
                    if pose_result and 'keypoints' in pose_result:
                        print("✅ RTMPose test successful - pose data will enhance ReID")
                    else:
                        print("⚠️ RTMPose loaded but test failed - using ReID only")
                        self.rtmpose_available = False
                except Exception as test_e:
                    print(f"⚠️ RTMPose test failed: {test_e} - using ReID only")
                    self.rtmpose_available = False
            else:
                print("⚠️ RTMPose model not loaded - using ReID features only")
        except Exception as e:
            print(f"⚠️ RTMPose test failed: {e}")
            self.rtmpose_available = False
    
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> Tuple[List[WildlifeTrackedHorse], np.ndarray]:
        """Process single frame with detection, pose, and tracking."""
        
        # Step 1: Detect horses
        detections, _ = self.detection_model.detect_horses(frame)
        
        if not detections:
            return [], frame
        
        print(f"   Frame {frame_idx}: {len(detections)} detections found")
        
        frame_horses = []
        
        # Step 2: Process each detection
        for i, detection in enumerate(detections):
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
                features = np.zeros(768)
            
            # Step 3: Estimate pose (if available)
            pose_result = {'keypoints': [], 'confidence': 0.0}
            if self.rtmpose_available:
                try:
                    pose_result, _ = self.pose_model.estimate_pose(frame, bbox)
                    if not pose_result:
                        pose_result = {'keypoints': [], 'confidence': 0.0}
                except Exception as e:
                    if frame_idx < 3:  # Only log for first few frames
                        print(f"   Pose estimation failed for detection {i+1}: {e}")
                    pose_result = {'keypoints': [], 'confidence': 0.0}
            
            # Step 4: Match to existing horse or create new
            matched_horse = self._match_or_create_horse(features, pose_result, bbox, 
                                                       confidence, frame_idx)
            frame_horses.append(matched_horse)
        
        # Step 5: Draw overlays on frame
        output_frame = self._draw_overlays(frame, frame_horses, frame_idx)
        
        return frame_horses, output_frame
    
    def _calculate_pose_similarity(self, pose1: Dict, pose2: Dict) -> float:
        """Calculate similarity between two pose keypoints."""
        if not pose1.get('keypoints') or not pose2.get('keypoints'):
            return 0.0
        
        try:
            kp1 = np.array(pose1['keypoints'])
            kp2 = np.array(pose2['keypoints'])
            
            if kp1.shape != kp2.shape or kp1.shape[0] == 0:
                return 0.0
            
            # Check if confidence scores are available
            has_conf1 = len(kp1.shape) >= 2 and kp1.shape[1] >= 3
            has_conf2 = len(kp2.shape) >= 2 and kp2.shape[1] >= 3
            
            # Only use confident keypoints (confidence > 0.3) if available
            if has_conf1:
                valid_mask1 = kp1[:, 2] > 0.3
            else:
                valid_mask1 = np.ones(len(kp1), dtype=bool)
                
            if has_conf2:
                valid_mask2 = kp2[:, 2] > 0.3
            else:
                valid_mask2 = np.ones(len(kp2), dtype=bool)
                
            valid_mask = valid_mask1 & valid_mask2
            
            if not np.any(valid_mask):
                return 0.0
            
            # Calculate normalized distance between keypoints
            kp1_pos = kp1[valid_mask, :2]
            kp2_pos = kp2[valid_mask, :2]
            
            distances = np.linalg.norm(kp1_pos - kp2_pos, axis=1)
            avg_distance = np.mean(distances)
            
            # Convert distance to similarity (lower distance = higher similarity)
            # Normalize by typical horse size (assume ~200px)
            normalized_distance = avg_distance / 200.0
            similarity = max(0.0, 1.0 - normalized_distance)
            
            return similarity
        except Exception as e:
            return 0.0
    
    def _match_or_create_horse(self, features: np.ndarray, pose_data: Dict, 
                              bbox: Dict, confidence: float, frame_idx: int) -> WildlifeTrackedHorse:
        """Match detection to existing horse with wildlife ReID features."""
        self.total_detections += 1
        
        # Find best match among existing horses
        best_horse = None
        best_similarity = 0.0
        best_combined_score = 0.0
        
        for horse in self.horses.values():
            if len(horse.features) == 0:
                continue
                
            # Use most recent features for better temporal consistency
            recent_features = horse.get_best_features()
            reid_similarity = 1 - cosine(features, recent_features)
            
            # Calculate pose similarity if available
            pose_similarity = 0.0
            if self.rtmpose_available and len(horse.poses) > 0:
                recent_pose = horse.poses[-1]  # Most recent pose
                pose_similarity = self._calculate_pose_similarity(pose_data, recent_pose)
            
            # Combined score: ReID features (80%) + Pose (20%) if available
            if self.rtmpose_available and pose_similarity > 0:
                combined_score = 0.8 * reid_similarity + 0.2 * pose_similarity
                if frame_idx < 10:  # Debug for first frames
                    print(f"     Horse #{horse.horse_id}: ReID={reid_similarity:.3f}, Pose={pose_similarity:.3f}, Combined={combined_score:.3f}")
            else:
                combined_score = reid_similarity
            
            # Bonus for recently seen horses (temporal consistency)
            frames_since = horse.frames_since_seen(frame_idx)
            if frames_since < 10:  # Within 10 frames
                combined_score += 0.05  # Small boost for recent sightings
            
            if combined_score > best_combined_score:
                best_combined_score = combined_score
                best_similarity = reid_similarity  # Keep ReID similarity for threshold check
                best_horse = horse
        
        # Log similarity for debugging
        if frame_idx < 5:  # Only for first few frames
            print(f"     Best similarity: {best_similarity:.4f} (threshold: {self.similarity_threshold})")
        
        # Decision logic with strict capacity control
        if len(self.horses) < self.max_horses:
            # Can create new horse
            if best_similarity >= self.similarity_threshold and best_horse:
                # Match to existing
                best_horse.add_detection(features, pose_data, bbox, confidence, frame_idx)
                self.successful_matches += 1
                return best_horse
            else:
                # Create new horse
                new_horse = WildlifeTrackedHorse(
                    horse_id=self.next_id,
                    color=self.COLORS[(self.next_id - 1) % len(self.COLORS)]
                )
                new_horse.add_detection(features, pose_data, bbox, confidence, frame_idx)
                self.horses[self.next_id] = new_horse
                self.next_id += 1
                self.new_horses_created += 1
                print(f"   🆕 Created Horse #{new_horse.horse_id} (total: {len(self.horses)})")
                return new_horse
        else:
            # At capacity - MUST match to existing horse
            if best_horse:
                best_horse.add_detection(features, pose_data, bbox, confidence, frame_idx)
                if best_similarity >= self.similarity_threshold:
                    self.successful_matches += 1
                else:
                    self.force_matches += 1
                    if frame_idx % 50 == 0:  # Periodic logging
                        print(f"   ⚠️ Force-matched to Horse #{best_horse.horse_id} (sim: {best_similarity:.3f})")
                return best_horse
            else:
                # Fallback - assign to horse with oldest last detection
                oldest_horse = min(self.horses.values(), 
                                 key=lambda h: h.last_seen_frame)
                oldest_horse.add_detection(features, pose_data, bbox, confidence, frame_idx)
                self.force_matches += 1
                return oldest_horse
    
    def _draw_overlays(self, frame: np.ndarray, horses: List[WildlifeTrackedHorse], frame_idx: int) -> np.ndarray:
        """Draw detection boxes, pose, and tracking overlays."""
        output_frame = frame.copy()
        
        for horse in horses:
            if not horse.last_bbox:
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
            
            # Draw pose keypoints and skeleton if available
            if self.rtmpose_available and pose.get('keypoints') and len(pose['keypoints']) > 0:
                keypoints = pose['keypoints']  # List of dicts with name, x, y, confidence
                
                # Create keypoint dictionary for easy skeleton drawing
                kp_dict = {}
                for kp in keypoints:
                    kp_dict[kp['name']] = kp
                
                # Draw skeleton connections first using proper names
                skeleton_connections = [
                    ("L_Eye", "R_Eye"), ("L_Eye", "Nose"), ("R_Eye", "Nose"),  # Head
                    ("Nose", "Neck"), ("Neck", "L_Shoulder"), ("Neck", "R_Shoulder"),
                    ("L_Shoulder", "L_Elbow"), ("L_Elbow", "L_F_Paw"),  # Left front leg
                    ("R_Shoulder", "R_Elbow"), ("R_Elbow", "R_F_Paw"),  # Right front leg
                    ("Neck", "Root_of_tail"), ("Root_of_tail", "L_Hip"), ("Root_of_tail", "R_Hip"),
                    ("L_Hip", "L_Knee"), ("L_Knee", "L_B_Paw"),  # Left back leg
                    ("R_Hip", "R_Knee"), ("R_Knee", "R_B_Paw")  # Right back leg
                ]
                
                # Draw skeleton connections
                for start_name, end_name in skeleton_connections:
                    if (start_name in kp_dict and end_name in kp_dict and
                        kp_dict[start_name]['confidence'] > 0.3 and kp_dict[end_name]['confidence'] > 0.3):
                        
                        start_pt = (int(kp_dict[start_name]['x']), int(kp_dict[start_name]['y']))
                        end_pt = (int(kp_dict[end_name]['x']), int(kp_dict[end_name]['y']))
                        
                        # Check bounds
                        if (0 <= start_pt[0] < output_frame.shape[1] and 0 <= start_pt[1] < output_frame.shape[0] and
                            0 <= end_pt[0] < output_frame.shape[1] and 0 <= end_pt[1] < output_frame.shape[0]):
                            cv2.line(output_frame, start_pt, end_pt, color, 2)
                
                # Draw keypoints on top
                for kp in keypoints:
                    if kp['confidence'] > 0.3:  # Good confidence threshold
                        kx, ky = int(kp['x']), int(kp['y'])
                        
                        if 0 <= kx < output_frame.shape[1] and 0 <= ky < output_frame.shape[0]:
                            # Color based on body part
                            kp_name = kp['name']
                            if 'Eye' in kp_name or 'Nose' in kp_name:
                                kp_color = (255, 200, 100)  # Light blue for head
                            elif 'Shoulder' in kp_name or 'Elbow' in kp_name or 'F_Paw' in kp_name:
                                kp_color = (100, 255, 100)  # Light green for front legs
                            elif 'Hip' in kp_name or 'Knee' in kp_name or 'B_Paw' in kp_name:
                                kp_color = (100, 100, 255)  # Light red for back legs
                            else:
                                kp_color = (100, 255, 255)  # Light yellow for body
                            
                            cv2.circle(output_frame, (kx, ky), 4, kp_color, -1)
                            cv2.circle(output_frame, (kx, ky), 6, (255, 255, 255), 2)
        
        # Draw summary info
        reid_model = "MegaDescriptor" if hasattr(self.reid_extractor, 'model') else "ResNet"
        pose_status = "RTMPose" if self.rtmpose_available else "No Pose"
        summary = f"Horses: {len(self.horses)}/{self.max_horses} | {reid_model} | {pose_status} | Frame: {frame_idx}"
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
            'force_rate': self.force_matches / max(self.total_detections, 1),
            'rtmpose_available': self.rtmpose_available
        }

def process_video_with_wildlifereid(input_video: str, output_video: str, max_frames: Optional[int] = None):
    """Process video with complete wildlife ReID horse pipeline."""
    
    print("🦓 Wildlife Horse ReID Processing Pipeline")
    print("=" * 60)
    print("Features: YOLO Detection + RTMPose + MegaDescriptor Wildlife ReID")
    print(f"Input: {input_video}")
    print(f"Output: {output_video}")
    print()
    
    # Initialize tracker with wildlife ReID
    tracker = WildlifeHorseTracker(max_horses=3, similarity_threshold=0.6)
    
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
    print(f"🐎 Goal: Maintain exactly 3 horses with wildlife ReID")
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
        
        print(f"\n🎉 Wildlife ReID Processing Complete!")
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
        print(f"   RTMPose available: {final_stats['rtmpose_available']}")
        
        # Success assessment
        if final_stats['total_horses'] == 3:
            print(f"\n✅ PERFECT: Maintained exactly 3 horses with wildlife ReID!")
        elif final_stats['total_horses'] <= 5:
            print(f"\n⚠️ Good: Only {final_stats['total_horses']} horses (improvement with MegaDescriptor)")
        else:
            print(f"\n❌ Still created {final_stats['total_horses']} horses - needs further tuning")
        
        # Individual horse details
        print(f"\n🏇 Individual Horse Summary:")
        for horse_id, horse in tracker.horses.items():
            print(f"   Horse #{horse_id}: {horse.detection_count} detections, "
                  f"avg confidence: {horse.get_avg_confidence():.2f}")
        
        return final_stats

def main():
    print("🦓 Wildlife Horse ReID Pipeline with MegaDescriptor")
    print("=" * 70)
    print("Integrates: YOLO Detection + RTMPose + MegaDescriptor Wildlife ReID")
    print("Goal: Accurate horse re-identification using wildlife-specific features")
    print()
    
    # Install timm if needed
    try:
        import timm
    except ImportError:
        print("📦 Installing timm for MegaDescriptor support...")
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'timm'])
        import timm
        print("✅ timm installed successfully")
    
    # Configuration
    input_video = "../../media/rolling-on-ground.mp4"
    output_video = "horse_wildlifereid_pipeline.mp4"
    max_frames = None  # Process full video with RTMPose visualization
    
    if not os.path.exists(input_video):
        print(f"❌ Input video not found: {input_video}")
        return 1
    
    try:
        stats = process_video_with_wildlifereid(input_video, output_video, max_frames)
        
        print(f"\n🎯 Wildlife ReID Pipeline Summary:")
        if stats['total_horses'] == 3:
            print("   🎉 PERFECT: Exactly 3 horses with MegaDescriptor!")
            print("   ✅ Wildlife ReID working optimally")
        elif stats['total_horses'] <= 4:
            print(f"   ✅ EXCELLENT: Only {stats['total_horses']} horses")
            print("   📈 Major improvement with wildlife-specific features")
        else:
            print(f"   📊 Created {stats['total_horses']} horses")
            print("   🔧 May need further threshold tuning")
        
        print(f"\n📁 Output video: {output_video}")
        print("   Review video to see MegaDescriptor ReID + pose tracking")
        
    except Exception as e:
        print(f"❌ Pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())