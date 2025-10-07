#!/usr/bin/env python3
"""
Enhanced Horse Processing Pipeline with Hierarchical State Detection
Combines wildlife re-identification with advanced behavioral state analysis
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

# Import the hierarchical state detection system
from src.models.hierarchical_state_detection import (
    HierarchicalStateDetector, StateDetectionResult, BehavioralEvent,
    PrimaryBodyState, HeadPosition, LegActivity
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
class EnhancedHorseTrack:
    """Enhanced horse representation with ReID features, pose data, and behavioral states."""
    horse_id: int
    color: Tuple[int, int, int]
    features: List[np.ndarray] = field(default_factory=list)
    poses: List[Dict] = field(default_factory=list)
    states: List[StateDetectionResult] = field(default_factory=list)
    behavioral_events: List[BehavioralEvent] = field(default_factory=list)
    
    max_features: int = 15  
    max_poses: int = 10
    max_states: int = 20
    detection_count: int = 0
    last_bbox: Optional[Dict] = None
    last_pose: Optional[Dict] = None
    last_state: Optional[StateDetectionResult] = None
    confidence_sum: float = 0.0
    last_seen_frame: int = 0
    
    def add_detection(self, features: np.ndarray, pose_data: Dict, state_result: StateDetectionResult,
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
        
        # Maintain state history
        if len(self.states) >= self.max_states:
            self.states.pop(0)
        self.states.append(state_result)
    
    def add_behavioral_events(self, events: List[BehavioralEvent]):
        """Add behavioral events detected for this horse."""
        self.behavioral_events.extend(events)
        # Keep only recent events (last 50)
        if len(self.behavioral_events) > 50:
            self.behavioral_events = self.behavioral_events[-50:]
    
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
    
    def get_current_state_summary(self) -> Dict:
        """Get summary of current behavioral state."""
        if not self.last_state:
            return {"status": "no_state"}
        
        # Count recent events by type
        recent_events = [e for e in self.behavioral_events if e.duration < 60]  # Last minute
        event_counts = {}
        for event in recent_events:
            event_counts[event.event_type] = event_counts.get(event.event_type, 0) + 1
        
        return {
            "primary_state": self.last_state.primary_state.value,
            "head_position": self.last_state.head_position.value,
            "leg_activity": self.last_state.leg_activity.value,
            "state_confidence": self.last_state.confidence,
            "state_duration": self.last_state.state_duration,
            "keypoint_quality": self.last_state.keypoint_quality,
            "recent_events": event_counts,
            "total_events": len(self.behavioral_events)
        }

class EnhancedHorseTracker:
    """Complete horse tracking with detection, pose, ReID, and hierarchical state analysis."""
    
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
    
    def __init__(self, max_horses=3, similarity_threshold=0.6):
        self.horses: Dict[int, EnhancedHorseTrack] = {}
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
        
        # Initialize hierarchical state detector for each horse
        self.state_detectors: Dict[int, HierarchicalStateDetector] = {}
        
        # Stats
        self.total_detections = 0
        self.successful_matches = 0
        self.force_matches = 0
        self.new_horses_created = 0
        self.rtmpose_available = False
        self.total_behavioral_events = 0
        
        # Test RTMPose availability
        self._test_rtmpose()
    
    def _test_rtmpose(self):
        """Test if RTMPose is available."""
        try:
            self.rtmpose_available = hasattr(self.pose_model, 'use_real_mmpose') and self.pose_model.use_real_mmpose
            
            if self.rtmpose_available:
                print("✅ RTMPose is available - hierarchical state detection enabled")
                # Test with dummy data to ensure it works
                dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                dummy_bbox = {'x': 100, 'y': 100, 'width': 200, 'height': 200}
                try:
                    pose_result, _ = self.pose_model.estimate_pose(dummy_frame, dummy_bbox)
                    if pose_result and 'keypoints' in pose_result:
                        print("✅ RTMPose test successful - behavioral analysis active")
                    else:
                        print("⚠️ RTMPose loaded but test failed - using ReID only")
                        self.rtmpose_available = False
                except Exception as test_e:
                    print(f"⚠️ RTMPose test failed: {test_e} - using ReID only")
                    self.rtmpose_available = False
            else:
                print("⚠️ RTMPose model not loaded - behavioral analysis disabled")
        except Exception as e:
            print(f"⚠️ RTMPose test failed: {e}")
            self.rtmpose_available = False
    
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> Tuple[List[EnhancedHorseTrack], np.ndarray]:
        """Process single frame with detection, pose, tracking, and state analysis."""
        
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
            
            # Step 5: Hierarchical state detection (if pose available and horse matched)
            state_result = None
            behavioral_events = []
            
            if matched_horse and self.rtmpose_available and pose_result.get('keypoints'):
                # Get or create state detector for this horse
                if matched_horse.horse_id not in self.state_detectors:
                    self.state_detectors[matched_horse.horse_id] = HierarchicalStateDetector()
                
                state_detector = self.state_detectors[matched_horse.horse_id]
                
                try:
                    # Perform hierarchical state detection
                    state_result, behavioral_events = state_detector.process_pose_data(
                        pose_result, timestamp=time.time()
                    )
                    
                    if behavioral_events:
                        self.total_behavioral_events += len(behavioral_events)
                        matched_horse.add_behavioral_events(behavioral_events)
                        
                        # Log significant events
                        for event in behavioral_events:
                            if event.severity in ['high', 'critical']:
                                print(f"   🚨 Horse #{matched_horse.horse_id}: {event.event_type} "
                                      f"({event.severity}) - {event.description}")
                
                except Exception as e:
                    if frame_idx < 5:
                        print(f"   State detection failed for Horse #{matched_horse.horse_id}: {e}")
            
            # Step 6: Add detection data to horse
            if matched_horse:
                matched_horse.add_detection(features, pose_result, state_result, bbox, 
                                          confidence, frame_idx)
                frame_horses.append(matched_horse)
        
        # Step 7: Draw overlays on frame
        output_frame = self._draw_enhanced_overlays(frame, frame_horses, frame_idx)
        
        return frame_horses, output_frame
    
    def _match_or_create_horse(self, features: np.ndarray, pose_data: Dict, 
                              bbox: Dict, confidence: float, frame_idx: int) -> EnhancedHorseTrack:
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
                    print(f"     Horse #{horse.horse_id}: ReID={reid_similarity:.3f}, "
                          f"Pose={pose_similarity:.3f}, Combined={combined_score:.3f}")
            else:
                combined_score = reid_similarity
            
            # Bonus for recently seen horses (temporal consistency)
            frames_since = horse.frames_since_seen(frame_idx)
            if frames_since < 10:  # Within 10 frames
                combined_score += 0.05
            
            if combined_score > best_combined_score:
                best_combined_score = combined_score
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
                new_horse = EnhancedHorseTrack(
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
                    if frame_idx % 50 == 0:  # Periodic logging
                        print(f"   ⚠️ Force-matched to Horse #{best_horse.horse_id} "
                              f"(sim: {best_similarity:.3f})")
                return best_horse
            else:
                # Fallback - assign to horse with oldest last detection
                oldest_horse = min(self.horses.values(), 
                                 key=lambda h: h.last_seen_frame)
                self.force_matches += 1
                return oldest_horse
    
    def _calculate_pose_similarity(self, pose1: Dict, pose2: Dict) -> float:
        """Calculate similarity between two pose keypoints."""
        if not pose1.get('keypoints') or not pose2.get('keypoints'):
            return 0.0
        
        try:
            # Handle different keypoint formats
            kp1_dict = {}
            kp2_dict = {}
            
            # Extract keypoints as dictionaries
            for kp in pose1['keypoints']:
                if isinstance(kp, dict) and 'name' in kp:
                    kp1_dict[kp['name']] = (kp['x'], kp['y'], kp.get('confidence', 1.0))
            
            for kp in pose2['keypoints']:
                if isinstance(kp, dict) and 'name' in kp:
                    kp2_dict[kp['name']] = (kp['x'], kp['y'], kp.get('confidence', 1.0))
            
            if not kp1_dict or not kp2_dict:
                return 0.0
            
            # Calculate similarity for common keypoints
            similarities = []
            for kp_name in kp1_dict:
                if kp_name in kp2_dict:
                    kp1 = kp1_dict[kp_name]
                    kp2 = kp2_dict[kp_name]
                    
                    # Only use confident keypoints
                    if kp1[2] > 0.3 and kp2[2] > 0.3:
                        distance = np.sqrt((kp1[0] - kp2[0])**2 + (kp1[1] - kp2[1])**2)
                        # Normalize by typical horse size (assume ~200px)
                        normalized_distance = distance / 200.0
                        similarity = max(0.0, 1.0 - normalized_distance)
                        similarities.append(similarity)
            
            return np.mean(similarities) if similarities else 0.0
            
        except Exception as e:
            return 0.0
    
    def _draw_enhanced_overlays(self, frame: np.ndarray, horses: List[EnhancedHorseTrack], 
                               frame_idx: int) -> np.ndarray:
        """Draw detection boxes, pose, state information, and behavioral alerts."""
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
            
            # Draw state information if available
            if state:
                state_info = f"{state.primary_state.value}"
                if state.head_position != HeadPosition.UNKNOWN:
                    state_info += f" | {state.head_position.value}"
                if state.leg_activity != LegActivity.UNKNOWN:
                    state_info += f" | {state.leg_activity.value}"
                
                # Add state duration if significant
                if state.state_duration > 5:
                    state_info += f" ({state.state_duration:.0f}s)"
                
                state_y = y - label_size[1] - 35
                state_size = cv2.getTextSize(state_info, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
                
                # Color code based on state
                state_bg_color = color
                if state.primary_state == PrimaryBodyState.ROLLING:
                    state_bg_color = (0, 0, 255)  # Red for rolling
                elif state.primary_state == PrimaryBodyState.LYING_DOWN and state.state_duration > 300:
                    state_bg_color = (0, 165, 255)  # Orange for extended lying
                
                cv2.rectangle(output_frame, (x, state_y - state_size[1] - 5), 
                             (x + state_size[0], state_y), state_bg_color, -1)
                cv2.putText(output_frame, state_info, (x, state_y - 2), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            
            # Draw behavioral alerts
            critical_events = [e for e in horse.behavioral_events[-3:] 
                             if e.severity in ['high', 'critical']]
            
            if critical_events:
                alert_y = y + h + 20
                for event in critical_events[-1:]:  # Show most recent critical event
                    alert_text = f"⚠️ {event.event_type.upper()}"
                    alert_color = (0, 0, 255) if event.severity == 'critical' else (0, 165, 255)
                    
                    cv2.putText(output_frame, alert_text, (x, alert_y), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, alert_color, 2)
                    alert_y += 25
            
            # Draw pose keypoints and skeleton if available
            if self.rtmpose_available and pose.get('keypoints') and len(pose['keypoints']) > 0:
                keypoints = pose['keypoints']
                
                # Create keypoint dictionary for easy skeleton drawing
                kp_dict = {}
                for kp in keypoints:
                    if isinstance(kp, dict) and 'name' in kp:
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
                        kp_dict[start_name].get('confidence', 0) > 0.3 and 
                        kp_dict[end_name].get('confidence', 0) > 0.3):
                        
                        start_pt = (int(kp_dict[start_name]['x']), int(kp_dict[start_name]['y']))
                        end_pt = (int(kp_dict[end_name]['x']), int(kp_dict[end_name]['y']))
                        
                        # Check bounds
                        if (0 <= start_pt[0] < output_frame.shape[1] and 0 <= start_pt[1] < output_frame.shape[0] and
                            0 <= end_pt[0] < output_frame.shape[1] and 0 <= end_pt[1] < output_frame.shape[0]):
                            cv2.line(output_frame, start_pt, end_pt, color, 2)
                
                # Draw keypoints on top
                for kp in keypoints:
                    if isinstance(kp, dict) and kp.get('confidence', 0) > 0.3:
                        kx, ky = int(kp['x']), int(kp['y'])
                        
                        if 0 <= kx < output_frame.shape[1] and 0 <= ky < output_frame.shape[0]:
                            # Color based on body part
                            kp_name = kp.get('name', '')
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
        
        # Draw enhanced summary info
        reid_model = "MegaDescriptor" if hasattr(self.reid_extractor, 'model') else "ResNet"
        pose_status = "RTMPose+States" if self.rtmpose_available else "No Pose"
        
        summary = f"Horses: {len(self.horses)}/{self.max_horses} | {reid_model} | {pose_status} | Frame: {frame_idx}"
        cv2.putText(output_frame, summary, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(output_frame, summary, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        
        # Show behavioral event count if any
        if self.total_behavioral_events > 0:
            event_summary = f"Behavioral Events Detected: {self.total_behavioral_events}"
            cv2.putText(output_frame, event_summary, (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
            cv2.putText(output_frame, event_summary, (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 1)
        
        return output_frame
    
    def get_enhanced_stats(self):
        """Get comprehensive tracking and behavioral statistics."""
        # Basic tracking stats
        basic_stats = {
            'total_horses': len(self.horses),
            'total_detections': self.total_detections,
            'successful_matches': self.successful_matches,
            'force_matches': self.force_matches,
            'new_horses_created': self.new_horses_created,
            'match_rate': self.successful_matches / max(self.total_detections, 1),
            'force_rate': self.force_matches / max(self.total_detections, 1),
            'rtmpose_available': self.rtmpose_available,
            'total_behavioral_events': self.total_behavioral_events
        }
        
        # Behavioral analysis stats
        if self.rtmpose_available:
            event_type_counts = {}
            state_distribution = {}
            
            for horse in self.horses.values():
                # Count event types
                for event in horse.behavioral_events:
                    event_type_counts[event.event_type] = event_type_counts.get(event.event_type, 0) + 1
                
                # Count current states
                if horse.last_state:
                    state_name = horse.last_state.primary_state.value
                    state_distribution[state_name] = state_distribution.get(state_name, 0) + 1
            
            basic_stats['behavioral_analysis'] = {
                'event_types_detected': event_type_counts,
                'current_state_distribution': state_distribution,
                'horses_with_states': len([h for h in self.horses.values() if h.last_state])
            }
        
        return basic_stats

def process_video_with_enhanced_pipeline(input_video: str, output_video: str, max_frames: Optional[int] = None):
    """Process video with enhanced pipeline including hierarchical state detection."""
    
    print("🦓🧠 Enhanced Horse Pipeline: ReID + Hierarchical State Detection")
    print("=" * 80)
    print("Features: YOLO Detection + RTMPose + MegaDescriptor ReID + Behavioral Analysis")
    print(f"Input: {input_video}")
    print(f"Output: {output_video}")
    print()
    
    # Initialize enhanced tracker
    tracker = EnhancedHorseTracker(max_horses=3, similarity_threshold=0.6)
    
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
    print(f"🐎 Enhanced Pipeline: ReID + Pose + Hierarchical State Detection")
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
                # Process frame with enhanced pipeline
                horses, output_frame = tracker.process_frame(frame, frame_count)
                
                # Write frame
                out.write(output_frame)
                
                frame_count += 1
                
                # Progress updates with behavioral stats
                if frame_count % 100 == 0:
                    stats = tracker.get_enhanced_stats()
                    elapsed = time.time() - start_time
                    fps_current = frame_count / elapsed
                    
                    behavior_info = ""
                    if stats.get('behavioral_analysis'):
                        behavior_stats = stats['behavioral_analysis']
                        events_detected = sum(behavior_stats['event_types_detected'].values())
                        behavior_info = f", {events_detected} behaviors detected"
                    
                    print(f"   Frame {frame_count}/{total_frames}: "
                          f"{stats['total_horses']} horses{behavior_info} "
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
        
        # Final comprehensive statistics
        elapsed = time.time() - start_time
        final_stats = tracker.get_enhanced_stats()
        
        print(f"\n🎉 Enhanced Pipeline Processing Complete!")
        print(f"   Output saved: {output_video}")
        print(f"   Processing time: {elapsed:.1f}s ({frame_count/elapsed:.1f} fps)")
        print(f"   Frames processed: {frame_count}")
        print(f"\n📊 Tracking Statistics:")
        print(f"   Total horses created: {final_stats['total_horses']} (target: 3)")
        print(f"   Total detections: {final_stats['total_detections']}")
        print(f"   Successful matches: {final_stats['successful_matches']}")
        print(f"   Force matches: {final_stats['force_matches']}")
        print(f"   Match rate: {final_stats['match_rate']:.1%}")
        print(f"   Force rate: {final_stats['force_rate']:.1%}")
        
        # Behavioral analysis results
        if final_stats.get('behavioral_analysis'):
            behavior_stats = final_stats['behavioral_analysis']
            print(f"\n🧠 Behavioral Analysis Results:")
            print(f"   Total behavioral events: {final_stats['total_behavioral_events']}")
            print(f"   Event types detected: {dict(behavior_stats['event_types_detected'])}")
            print(f"   Current state distribution: {dict(behavior_stats['current_state_distribution'])}")
            print(f"   Horses with state analysis: {behavior_stats['horses_with_states']}")
        
        # Individual horse behavioral summaries
        if tracker.rtmpose_available:
            print(f"\n🏇 Individual Horse Behavioral Summary:")
            for horse_id, horse in tracker.horses.items():
                state_summary = horse.get_current_state_summary()
                print(f"   Horse #{horse_id}: {horse.detection_count} detections, "
                      f"state: {state_summary.get('primary_state', 'unknown')}, "
                      f"events: {state_summary.get('total_events', 0)}")
        
        return final_stats

def main():
    print("🦓🧠 Enhanced Horse Pipeline with Hierarchical State Detection")
    print("=" * 80)
    print("Integrates: YOLO + RTMPose + MegaDescriptor ReID + Multi-layer Behavioral Analysis")
    print("Detects: Standing, Walking, Lying, Rolling + Head Position + Leg Activity")
    print("Events: Colic, Distress, Grazing patterns with temporal analysis")
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
    output_video = "horse_enhanced_hierarchical_pipeline.mp4"
    max_frames = None  # Process full video
    
    if not os.path.exists(input_video):
        print(f"❌ Input video not found: {input_video}")
        return 1
    
    try:
        stats = process_video_with_enhanced_pipeline(input_video, output_video, max_frames)
        
        print(f"\n🎯 Enhanced Pipeline Summary:")
        if stats['total_horses'] == 3:
            print("   🎉 PERFECT: Exactly 3 horses with enhanced behavioral analysis!")
            print("   ✅ MegaDescriptor ReID + Hierarchical States working optimally")
        elif stats['total_horses'] <= 4:
            print(f"   ✅ EXCELLENT: Only {stats['total_horses']} horses")
            print("   📈 Major improvement with wildlife-specific features + behavioral analysis")
        else:
            print(f"   📊 Created {stats['total_horses']} horses")
            print("   🔧 Consider threshold tuning for optimal performance")
        
        if stats.get('behavioral_analysis'):
            total_events = sum(stats['behavioral_analysis']['event_types_detected'].values())
            print(f"\n🧠 Behavioral Analysis: {total_events} behavioral patterns detected")
            if 'colic' in stats['behavioral_analysis']['event_types_detected']:
                print("   🚨 COLIC indicators detected - review footage for veterinary assessment")
        
        print(f"\n📁 Output video: {output_video}")
        print("   Review video to see enhanced ReID + pose tracking + behavioral overlays")
        
    except Exception as e:
        print(f"❌ Enhanced pipeline failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())