#!/usr/bin/env python3
"""
Simple Horse State Detection Pipeline
Building on YOLO + RTMPose + ReID with basic state detection:
- standing, walking, running, lying_down (one per horse)
Focus on accuracy and minimal false positives
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

# Import the simple state detection system
from src.models.simple_state_detection import (
    SimpleStateDetector, SimpleStateResult, SimpleStateTracker, HorseState
)

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
class SimpleTrackedHorse:
    """Simple horse representation with ReID features, pose data, and basic state."""
    horse_id: int
    color: Tuple[int, int, int]
    features: List[np.ndarray] = field(default_factory=list)
    poses: List[Dict] = field(default_factory=list)
    
    max_features: int = 15  
    max_poses: int = 5
    detection_count: int = 0
    last_bbox: Optional[Dict] = None
    last_pose: Optional[Dict] = None
    last_state: Optional[SimpleStateResult] = None
    confidence_sum: float = 0.0
    last_seen_frame: int = 0
    
    def add_detection(self, features: np.ndarray, pose_data: Dict, state_result: SimpleStateResult,
                     bbox: Dict, confidence: float, frame_idx: int):
        """Add new detection data to horse."""
        self.detection_count += 1
        self.confidence_sum += confidence
        self.last_bbox = bbox
        self.last_pose = pose_data
        self.last_state = state_result
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

class SimpleHorseTracker:
    """Simple horse tracking with detection, pose, ReID, and basic state detection."""
    
    # Horse tracking colors
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
    
    def __init__(self, max_horses=3, similarity_threshold=0.6):
        self.horses: Dict[int, SimpleTrackedHorse] = {}
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
        self.pose_model.load_model()
        print("✅ Pose model loaded")
        
        # Initialize simple state tracker
        self.state_tracker = SimpleStateTracker()
        
        # Stats
        self.total_detections = 0
        self.successful_matches = 0
        self.force_matches = 0
        self.new_horses_created = 0
        self.rtmpose_available = False
        
        # State statistics
        self.state_detections = {
            'standing': 0,
            'walking': 0,  
            'running': 0,
            'lying_down': 0,
            'unknown': 0
        }
        
        # Test RTMPose availability
        self._test_rtmpose()
    
    def _test_rtmpose(self):
        """Test if RTMPose is available."""
        try:
            self.rtmpose_available = hasattr(self.pose_model, 'use_real_mmpose') and self.pose_model.use_real_mmpose
            
            if self.rtmpose_available:
                print("✅ RTMPose is available - simple state detection enabled")
                # Test with dummy data to ensure it works
                dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                dummy_bbox = {'x': 100, 'y': 100, 'width': 200, 'height': 200}
                try:
                    pose_result, _ = self.pose_model.estimate_pose(dummy_frame, dummy_bbox)
                    if pose_result and 'keypoints' in pose_result:
                        print("✅ RTMPose test successful - basic state analysis active")
                    else:
                        print("⚠️ RTMPose loaded but test failed - using ReID only")
                        self.rtmpose_available = False
                except Exception as test_e:
                    print(f"⚠️ RTMPose test failed: {test_e} - using ReID only")
                    self.rtmpose_available = False
            else:
                print("⚠️ RTMPose model not loaded - state detection disabled")
        except Exception as e:
            print(f"⚠️ RTMPose test failed: {e}")
            self.rtmpose_available = False
    
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> Tuple[List[SimpleTrackedHorse], np.ndarray]:
        """Process single frame with detection, pose, tracking, and simple state detection."""
        
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
            
            # Step 5: Simple state detection (if pose available and horse matched)
            state_result = None
            
            if matched_horse and self.rtmpose_available and pose_result.get('keypoints'):
                try:
                    # Perform simple state detection
                    state_result = self.state_tracker.update_horse_state(
                        matched_horse.horse_id, pose_result
                    )
                    
                    # Update state statistics
                    if state_result:
                        self.state_detections[state_result.state.value] += 1
                        
                        # Log state changes for debugging
                        if (matched_horse.last_state is None or 
                            matched_horse.last_state.state != state_result.state):
                            if frame_idx < 50:  # Log early frames
                                print(f"   Horse #{matched_horse.horse_id}: "
                                      f"{state_result.state.value} (conf: {state_result.confidence:.2f})")
                
                except Exception as e:
                    if frame_idx < 5:
                        print(f"   State detection failed for Horse #{matched_horse.horse_id}: {e}")
            
            # Step 6: Add detection data to horse
            if matched_horse:
                matched_horse.add_detection(features, pose_result, state_result, bbox, 
                                          confidence, frame_idx)
                frame_horses.append(matched_horse)
        
        # Step 7: Draw overlays on frame
        output_frame = self._draw_simple_overlays(frame, frame_horses, frame_idx)
        
        return frame_horses, output_frame
    
    def _match_or_create_horse(self, features: np.ndarray, pose_data: Dict, 
                              bbox: Dict, confidence: float, frame_idx: int) -> SimpleTrackedHorse:
        """Match detection to existing horse with wildlife ReID features."""
        self.total_detections += 1
        
        # Find best match among existing horses
        best_horse = None
        best_similarity = 0.0
        
        for horse in self.horses.values():
            if len(horse.features) == 0:
                continue
                
            # Use most recent features for better temporal consistency
            recent_features = horse.get_best_features()
            reid_similarity = 1 - cosine(features, recent_features)
            
            # Bonus for recently seen horses (temporal consistency)
            frames_since = horse.frames_since_seen(frame_idx)
            if frames_since < 10:  # Within 10 frames
                reid_similarity += 0.05
            
            if reid_similarity > best_similarity:
                best_similarity = reid_similarity
                best_horse = horse
        
        # Decision logic with strict capacity control
        if len(self.horses) < self.max_horses:
            # Can create new horse
            if best_similarity >= self.similarity_threshold and best_horse:
                # Match to existing
                self.successful_matches += 1
                return best_horse
            else:
                # Create new horse
                new_horse = SimpleTrackedHorse(
                    horse_id=self.next_id,
                    color=self.COLORS[(self.next_id - 1) % len(self.COLORS)]
                )
                self.horses[self.next_id] = new_horse
                self.next_id += 1
                self.new_horses_created += 1
                print(f"   🆕 Created Horse #{new_horse.horse_id} (total: {len(self.horses)})")
                return new_horse
        else:
            # At capacity - MUST match to existing horse
            if best_horse:
                if best_similarity >= self.similarity_threshold:
                    self.successful_matches += 1
                else:
                    self.force_matches += 1
                    if frame_idx % 100 == 0:  # Periodic logging
                        print(f"   ⚠️ Force-matched to Horse #{best_horse.horse_id} "
                              f"(sim: {best_similarity:.3f})")
                return best_horse
            else:
                # Fallback - assign to horse with oldest last detection
                oldest_horse = min(self.horses.values(), 
                                 key=lambda h: h.last_seen_frame)
                self.force_matches += 1
                return oldest_horse
    
    def _draw_simple_overlays(self, frame: np.ndarray, horses: List[SimpleTrackedHorse], 
                             frame_idx: int) -> np.ndarray:
        """Draw detection boxes, pose, and simple state information."""
        output_frame = frame.copy()
        
        for horse in horses:
            if not horse.last_bbox:
                continue
            
            bbox = horse.last_bbox
            pose = horse.last_pose
            state = horse.last_state
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
            
            # Draw simple state information if available
            if state and state.state != HorseState.UNKNOWN:
                state_text = state.state.value.upper()
                state_conf = f"({state.confidence:.2f})"
                
                # Color code based on state
                if state.state == HorseState.LYING_DOWN:
                    state_color = (0, 165, 255)  # Orange
                elif state.state == HorseState.RUNNING:
                    state_color = (0, 255, 0)    # Green
                elif state.state == HorseState.WALKING:
                    state_color = (255, 255, 0)  # Cyan
                else:  # STANDING
                    state_color = (255, 255, 255)  # White
                
                state_y = y - label_size[1] - 35
                full_state_text = f"{state_text} {state_conf}"
                
                cv2.putText(output_frame, full_state_text, (x, state_y), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, state_color, 2)
                cv2.putText(output_frame, full_state_text, (x, state_y), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
            
            # Draw pose keypoints and skeleton if available (simplified)
            if self.rtmpose_available and pose.get('keypoints') and len(pose['keypoints']) > 0:
                keypoints = pose['keypoints']
                
                # Create keypoint dictionary
                kp_dict = {}
                for kp in keypoints:
                    if isinstance(kp, dict) and 'name' in kp:
                        kp_dict[kp['name']] = kp
                
                # Draw only key skeleton connections (simplified)
                key_connections = [
                    ("Neck", "L_Shoulder"), ("Neck", "R_Shoulder"),  # Shoulders
                    ("L_Shoulder", "L_F_Paw"), ("R_Shoulder", "R_F_Paw"),  # Front legs (simplified)
                    ("Neck", "L_Hip"), ("Neck", "R_Hip"),  # Body (simplified connection)
                    ("L_Hip", "L_B_Paw"), ("R_Hip", "R_B_Paw")  # Back legs (simplified)
                ]
                
                # Draw key connections only
                for start_name, end_name in key_connections:
                    if (start_name in kp_dict and end_name in kp_dict and
                        kp_dict[start_name].get('confidence', 0) > 0.4 and 
                        kp_dict[end_name].get('confidence', 0) > 0.4):
                        
                        start_pt = (int(kp_dict[start_name]['x']), int(kp_dict[start_name]['y']))
                        end_pt = (int(kp_dict[end_name]['x']), int(kp_dict[end_name]['y']))
                        
                        # Check bounds
                        if (0 <= start_pt[0] < output_frame.shape[1] and 0 <= start_pt[1] < output_frame.shape[0] and
                            0 <= end_pt[0] < output_frame.shape[1] and 0 <= end_pt[1] < output_frame.shape[0]):
                            cv2.line(output_frame, start_pt, end_pt, color, 2)
                
                # Draw key keypoints only (shoulders, hips, paws)
                key_keypoints = ['L_Shoulder', 'R_Shoulder', 'L_Hip', 'R_Hip', 'L_F_Paw', 'R_F_Paw', 'L_B_Paw', 'R_B_Paw']
                for kp_name in key_keypoints:
                    if kp_name in kp_dict and kp_dict[kp_name].get('confidence', 0) > 0.4:
                        kp = kp_dict[kp_name]
                        kx, ky = int(kp['x']), int(kp['y'])
                        
                        if 0 <= kx < output_frame.shape[1] and 0 <= ky < output_frame.shape[0]:
                            cv2.circle(output_frame, (kx, ky), 4, (255, 255, 255), -1)
                            cv2.circle(output_frame, (kx, ky), 6, color, 2)
        
        # Draw summary info
        reid_model = "MegaDescriptor" if hasattr(self.reid_extractor, 'model') else "ResNet"
        pose_status = "RTMPose+SimpleStates" if self.rtmpose_available else "No Pose"
        
        summary = f"Horses: {len(self.horses)}/{self.max_horses} | {reid_model} | {pose_status} | Frame: {frame_idx}"
        cv2.putText(output_frame, summary, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(output_frame, summary, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        
        # Show current state distribution
        state_summary = self.state_tracker.get_state_summary()
        if state_summary['total_horses'] > 0:
            states_text = " | ".join([f"{state}: {count}" for state, count 
                                    in state_summary['state_distribution'].items() if count > 0])
            cv2.putText(output_frame, states_text, (10, 55), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
            cv2.putText(output_frame, states_text, (10, 55), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 255, 100), 1)
        
        return output_frame
    
    def get_simple_stats(self):
        """Get tracking and simple state statistics."""
        basic_stats = {
            'total_horses': len(self.horses),
            'total_detections': self.total_detections,
            'successful_matches': self.successful_matches,
            'force_matches': self.force_matches,
            'new_horses_created': self.new_horses_created,
            'match_rate': self.successful_matches / max(self.total_detections, 1),
            'force_rate': self.force_matches / max(self.total_detections, 1),
            'rtmpose_available': self.rtmpose_available
        }
        
        # Add state detection stats
        state_summary = self.state_tracker.get_state_summary()
        basic_stats['state_analysis'] = state_summary
        basic_stats['state_detections'] = self.state_detections
        
        return basic_stats

def process_video_with_simple_states(input_video: str, output_video: str, max_frames: Optional[int] = None):
    """Process video with simple state detection pipeline."""
    
    print("🐎 Simple Horse State Detection Pipeline")
    print("=" * 60)
    print("Features: YOLO Detection + RTMPose + MegaDescriptor ReID + Simple States")
    print("States: Standing, Walking, Running, Lying Down (one per horse)")
    print(f"Input: {input_video}")
    print(f"Output: {output_video}")
    print()
    
    # Initialize simple tracker
    tracker = SimpleHorseTracker(max_horses=3, similarity_threshold=0.6)
    
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
    print(f"🔍 Simple State Detection: Clear thresholds, minimal false positives")
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
                # Process frame with simple pipeline
                horses, output_frame = tracker.process_frame(frame, frame_count)
                
                # Write frame
                out.write(output_frame)
                
                frame_count += 1
                
                # Progress updates with state stats
                if frame_count % 100 == 0:
                    stats = tracker.get_simple_stats()
                    elapsed = time.time() - start_time
                    fps_current = frame_count / elapsed
                    
                    state_info = ""
                    if stats.get('state_analysis'):
                        state_dist = stats['state_analysis']['state_distribution']
                        if state_dist:
                            state_info = f", states: {dict(state_dist)}"
                    
                    print(f"   Frame {frame_count}/{total_frames}: "
                          f"{stats['total_horses']} horses{state_info} "
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
        final_stats = tracker.get_simple_stats()
        
        print(f"\n🎉 Simple State Detection Pipeline Complete!")
        print(f"   Output saved: {output_video}")
        print(f"   Processing time: {elapsed:.1f}s ({frame_count/elapsed:.1f} fps)")
        print(f"   Frames processed: {frame_count}")
        print(f"\n📊 Tracking Statistics:")
        print(f"   Total horses created: {final_stats['total_horses']} (target: 3)")
        print(f"   Total detections: {final_stats['total_detections']}")
        print(f"   Successful matches: {final_stats['successful_matches']}")
        print(f"   Match rate: {final_stats['match_rate']:.1%}")
        
        # Simple state analysis results
        if final_stats.get('state_analysis'):
            state_stats = final_stats['state_analysis']
            print(f"\n🎯 Simple State Analysis Results:")
            print(f"   Current horse states: {dict(state_stats['state_distribution'])}")
            print(f"   Average state confidence: {state_stats['average_confidence']:.2f}")
            print(f"   Total state detections: {dict(final_stats['state_detections'])}")
        
        # Individual horse summaries
        print(f"\n🏇 Individual Horse Summary:")
        for horse_id, horse in tracker.horses.items():
            state_info = "unknown"
            if horse.last_state:
                state_info = f"{horse.last_state.state.value} ({horse.last_state.confidence:.2f})"
            print(f"   Horse #{horse_id}: {horse.detection_count} detections, "
                  f"current state: {state_info}")
        
        return final_stats

def main():
    print("🐎 Simple Horse State Detection Pipeline")
    print("=" * 70)
    print("Integrates: YOLO + RTMPose + MegaDescriptor ReID + Simple State Detection")
    print("Focus: Reliable detection of Standing, Walking, Running, Lying Down")
    print("Approach: Clear thresholds, minimal false positives, one state per horse")
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
    output_video = "horse_simple_states_pipeline.mp4"
    max_frames = None  # Process full video
    
    if not os.path.exists(input_video):
        print(f"❌ Input video not found: {input_video}")
        return 1
    
    try:
        stats = process_video_with_simple_states(input_video, output_video, max_frames)
        
        print(f"\n🎯 Simple State Pipeline Summary:")
        if stats['total_horses'] == 3:
            print("   🎉 PERFECT: Exactly 3 horses with reliable state detection!")
        elif stats['total_horses'] <= 4:
            print(f"   ✅ EXCELLENT: Only {stats['total_horses']} horses with good tracking")
        else:
            print(f"   📊 Created {stats['total_horses']} horses - consider threshold tuning")
        
        if stats.get('state_analysis'):
            total_state_detections = sum(stats['state_detections'].values())
            print(f"   🎯 State Detection: {total_state_detections} total state classifications")
            print(f"   📈 Most detected: {max(stats['state_detections'], key=stats['state_detections'].get)}")
        
        print(f"\n📁 Output video: {output_video}")
        print("   Review video to see simplified state detection overlays")
        
    except Exception as e:
        print(f"❌ Simple pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())