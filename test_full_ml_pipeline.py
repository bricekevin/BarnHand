#!/usr/bin/env python3
"""
BarnHand ML Pipeline Test Script
Tests the complete horse detection → pose estimation → re-identification pipeline

This script validates:
1. YOLO horse detection with 70% confidence threshold
2. RTMPose AP10K pose estimation with 17 keypoints
3. Horse re-identification with feature vector matching
4. Overlay generation for processed video output

Requirements:
- Test video with horses (place in media/ folder)
- YOLO11/YOLOv5 models downloaded (./scripts/download_models.sh)
- RTMPose model downloaded
- Python dependencies: ultralytics, torch, opencv-python, numpy

Usage:
    python3 test_full_ml_pipeline.py --video media/horses.mp4 --output test_output/
    python3 test_full_ml_pipeline.py --camera 0 --duration 30
    python3 test_full_ml_pipeline.py --benchmark --iterations 100
"""

import argparse
import time
import sys
import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import cv2
import numpy as np
import json
from dataclasses import dataclass
from datetime import datetime

# Add the ML service to Python path
sys.path.insert(0, str(Path(__file__).parent / "backend/ml-service/src"))

from models.detection import HorseDetectionModel
from models.pose import HorsePoseModel  
from models.horse_reid import HorseReIDModel
from models.pose_analysis import PoseAnalyzer, PoseMetrics
from config.settings import settings

@dataclass
class ProcessingResult:
    """Container for complete processing results."""
    frame_number: int
    timestamp: float
    detections: List[Dict[str, Any]]
    poses: List[Dict[str, Any]]
    reid_matches: List[Dict[str, Any]]
    processing_times: Dict[str, float]
    total_processing_time: float

@dataclass
class PipelineStats:
    """Pipeline performance statistics."""
    total_frames: int = 0
    successful_detections: int = 0
    successful_poses: int = 0 
    successful_reid: int = 0
    avg_detection_time: float = 0.0
    avg_pose_time: float = 0.0
    avg_reid_time: float = 0.0
    avg_total_time: float = 0.0
    fps: float = 0.0
    detection_confidence_mean: float = 0.0
    pose_confidence_mean: float = 0.0


class HorseTrackingPipeline:
    """Complete horse detection, pose estimation, and re-identification pipeline."""
    
    def __init__(self):
        self.detection_model = HorseDetectionModel()
        self.pose_model = HorsePoseModel()
        self.reid_model = HorseReIDModel()
        self.pose_analyzer = PoseAnalyzer(confidence_threshold=0.3)
        
        # Horse tracking state
        self.known_horses: Dict[str, Dict[str, Any]] = {}
        self.next_horse_id = 1
        
        # 10 distinctive colors for horse tracking visualization
        self.track_colors = [
            (255, 100, 100),  # Light Red
            (100, 255, 100),  # Light Green  
            (100, 100, 255),  # Light Blue
            (255, 255, 100),  # Yellow
            (255, 100, 255),  # Magenta
            (100, 255, 255),  # Cyan
            (255, 150, 100),  # Orange
            (150, 100, 255),  # Purple
            (100, 255, 150),  # Light Green
            (255, 200, 150)   # Peach
        ]
        
        # Performance tracking
        self.stats = PipelineStats()
        self.results_history: List[ProcessingResult] = []
        
    def initialize_models(self) -> bool:
        """Initialize all ML models."""
        try:
            print("🔧 Initializing ML models...")
            
            # Load detection model
            print("  Loading YOLO detection models...")
            self.detection_model.load_models()
            
            # Load pose estimation model
            print("  Loading RTMPose pose estimation model...")
            self.pose_model.load_model()
            
            # Load ReID model
            print("  Loading horse re-identification model...")
            self.reid_model.load_model()
            
            print("✅ All models loaded successfully")
            
            # Print model info
            self._print_model_info()
            
            return True
            
        except Exception as error:
            print(f"❌ Failed to initialize models: {error}")
            return False
            
    def _print_model_info(self) -> None:
        """Print information about loaded models."""
        print("\n📋 Model Information:")
        print("=" * 50)
        
        # Detection model info
        detection_info = self.detection_model.get_model_info()
        print(f"Detection Model:")
        print(f"  Current: {detection_info['current_model']}")
        print(f"  Device: {detection_info['device']}")
        print(f"  Confidence Threshold: {detection_info['configuration']['confidence_threshold']}")
        
        # Pose model info
        pose_info = self.pose_model.get_performance_info()
        print(f"\nPose Model:")
        print(f"  Loaded: {pose_info['model_loaded']}")
        print(f"  Device: {pose_info['device']}")
        print(f"  Keypoints: {pose_info['keypoint_count']}")
        
        # ReID model info
        reid_info = self.reid_model.get_model_info()
        print(f"\nReID Model:")
        print(f"  Loaded: {reid_info['model_loaded']}")
        print(f"  Device: {reid_info['device']}")
        print(f"  Feature Dimension: {reid_info['feature_dimension']}")
        print(f"  Horses in Index: {reid_info['horses_in_index']}")
        
    def process_frame(self, frame: np.ndarray, frame_number: int, timestamp: float) -> ProcessingResult:
        """Process a single frame through the complete pipeline."""
        start_time = time.time()
        processing_times = {}
        
        # Step 1: Horse Detection
        detection_start = time.time()
        detections, detection_time = self.detection_model.detect_horses(frame)
        processing_times["detection"] = detection_time
        
        poses = []
        reid_matches = []
        
        # Step 2: Process each detected horse
        for detection in detections:
            horse_bbox = detection["bbox"]
            
            # Step 2a: Pose Estimation
            pose_start = time.time()
            pose_data, pose_time = self.pose_model.estimate_pose(frame, horse_bbox)
            processing_times["pose"] = processing_times.get("pose", 0) + pose_time
            
            if pose_data:
                poses.append(pose_data)
                
            # Step 2b: Horse Re-identification
            reid_start = time.time()
            horse_crop = self._extract_horse_crop(frame, horse_bbox)
            if horse_crop is not None:
                features = self.reid_model.extract_features(horse_crop)
                reid_time = (time.time() - reid_start) * 1000
                processing_times["reid"] = processing_times.get("reid", 0) + reid_time
                
                # Find matching horse or create new track
                match = self._match_or_create_horse(detection, features)
                reid_matches.append(match)
            
        total_time = (time.time() - start_time) * 1000
        
        # Update statistics
        self._update_stats(detections, poses, reid_matches, processing_times, total_time)
        
        return ProcessingResult(
            frame_number=frame_number,
            timestamp=timestamp,
            detections=detections,
            poses=poses,
            reid_matches=reid_matches,
            processing_times=processing_times,
            total_processing_time=total_time
        )
        
    def _extract_horse_crop(self, frame: np.ndarray, bbox: Dict[str, float]) -> Optional[np.ndarray]:
        """Extract horse crop from frame using bounding box."""
        try:
            x, y, w, h = int(bbox["x"]), int(bbox["y"]), int(bbox["width"]), int(bbox["height"])
            
            # Add padding around bounding box
            padding = 0.1
            x_pad = int(w * padding)
            y_pad = int(h * padding)
            
            x1 = max(0, x - x_pad)
            y1 = max(0, y - y_pad)
            x2 = min(frame.shape[1], x + w + x_pad)
            y2 = min(frame.shape[0], y + h + y_pad)
            
            crop = frame[y1:y2, x1:x2]
            
            if crop.size == 0:
                return None
                
            return crop
            
        except Exception as error:
            print(f"⚠️  Failed to extract horse crop: {error}")
            return None
            
    def _match_or_create_horse(self, detection: Dict[str, Any], features: np.ndarray) -> Dict[str, Any]:
        """Match detected horse to existing track or create new track."""
        
        # Find similar horses
        similar_horses = self.reid_model.find_similar_horses(features, k=1, threshold=0.7)
        
        if similar_horses:
            # Match found
            horse_id, similarity = similar_horses[0]
            
            # Update horse tracking info
            if horse_id in self.known_horses:
                self.known_horses[horse_id]["last_seen"] = time.time()
                self.known_horses[horse_id]["detection_count"] += 1
                self.known_horses[horse_id]["confidence"] = detection["confidence"]
                
                # Update features with exponential moving average
                self.reid_model.update_horse_features(horse_id, features, alpha=0.8)
                
            return {
                "horse_id": horse_id,
                "similarity": similarity,
                "status": "matched",
                "color": self.known_horses[horse_id]["color"],
                "detection_count": self.known_horses[horse_id]["detection_count"]
            }
        else:
            # Create new horse track
            horse_id = f"horse_{self.next_horse_id:03d}"
            color_index = (self.next_horse_id - 1) % len(self.track_colors)
            color = self.track_colors[color_index]
            
            self.known_horses[horse_id] = {
                "id": horse_id,
                "first_seen": time.time(),
                "last_seen": time.time(),
                "detection_count": 1,
                "confidence": detection["confidence"],
                "color": color,
                "features": features.copy()
            }
            
            # Add to ReID index
            self.reid_model.add_horse_to_index(horse_id, features)
            
            self.next_horse_id += 1
            
            return {
                "horse_id": horse_id,
                "similarity": 1.0,
                "status": "new",
                "color": color,
                "detection_count": 1
            }
            
    def _update_stats(self, detections: List[Dict], poses: List[Dict], 
                     reid_matches: List[Dict], processing_times: Dict[str, float], 
                     total_time: float) -> None:
        """Update pipeline performance statistics."""
        self.stats.total_frames += 1
        
        if detections:
            self.stats.successful_detections += 1
            confidences = [d["confidence"] for d in detections]
            self.stats.detection_confidence_mean = (
                (self.stats.detection_confidence_mean * (self.stats.total_frames - 1) + 
                 np.mean(confidences)) / self.stats.total_frames
            )
            
        if poses:
            self.stats.successful_poses += 1
            pose_confidences = [p.get("pose_confidence", 0.0) for p in poses]
            self.stats.pose_confidence_mean = (
                (self.stats.pose_confidence_mean * (self.stats.total_frames - 1) + 
                 np.mean(pose_confidences)) / self.stats.total_frames
            )
            
        if reid_matches:
            self.stats.successful_reid += 1
            
        # Update timing averages
        alpha = 0.1  # EMA smoothing factor
        
        if "detection" in processing_times:
            if self.stats.avg_detection_time == 0:
                self.stats.avg_detection_time = processing_times["detection"]
            else:
                self.stats.avg_detection_time = (
                    (1 - alpha) * self.stats.avg_detection_time + 
                    alpha * processing_times["detection"]
                )
                
        if "pose" in processing_times:
            if self.stats.avg_pose_time == 0:
                self.stats.avg_pose_time = processing_times["pose"]
            else:
                self.stats.avg_pose_time = (
                    (1 - alpha) * self.stats.avg_pose_time + 
                    alpha * processing_times["pose"]
                )
                
        if "reid" in processing_times:
            if self.stats.avg_reid_time == 0:
                self.stats.avg_reid_time = processing_times["reid"]
            else:
                self.stats.avg_reid_time = (
                    (1 - alpha) * self.stats.avg_reid_time + 
                    alpha * processing_times["reid"]
                )
                
        if self.stats.avg_total_time == 0:
            self.stats.avg_total_time = total_time
        else:
            self.stats.avg_total_time = (
                (1 - alpha) * self.stats.avg_total_time + 
                alpha * total_time
            )
            
        # Calculate FPS
        if self.stats.avg_total_time > 0:
            self.stats.fps = 1000.0 / self.stats.avg_total_time
            
    def draw_overlays(self, frame: np.ndarray, result: ProcessingResult) -> np.ndarray:
        """Draw detection, pose, and tracking overlays on frame."""
        output_frame = frame.copy()
        
        # Draw detections and poses
        for i, detection in enumerate(result.detections):
            bbox = detection["bbox"]
            x, y, w, h = int(bbox["x"]), int(bbox["y"]), int(bbox["width"]), int(bbox["height"])
            confidence = detection["confidence"]
            
            # Get horse color if matched
            color = (0, 255, 0)  # Default green
            horse_info = ""
            
            if i < len(result.reid_matches):
                reid_match = result.reid_matches[i]
                color = reid_match["color"]
                horse_info = f" | {reid_match['horse_id']} ({reid_match['status']}) [{reid_match['detection_count']}]"
                
            # Draw bounding box
            cv2.rectangle(output_frame, (x, y), (x + w, y + h), color, 3)
            
            # Draw confidence and horse info
            label = f"Horse {confidence:.1%}{horse_info}"
            label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
            cv2.rectangle(output_frame, (x, y - label_size[1] - 10), 
                         (x + label_size[0], y), color, -1)
            cv2.putText(output_frame, label, (x, y - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            # Draw pose if available
            if i < len(result.poses):
                pose_data = result.poses[i]
                self._draw_pose_overlay(output_frame, pose_data, color)
                
        # Draw performance info
        self._draw_performance_overlay(output_frame, result)
        
        return output_frame
        
    def _draw_pose_overlay(self, frame: np.ndarray, pose_data: Dict[str, Any], color: Tuple[int, int, int]) -> None:
        """Draw pose keypoints and skeleton on frame."""
        keypoints = pose_data["keypoints"]
        
        # Draw keypoints
        for kp in keypoints:
            if kp["confidence"] > 0.3:  # Only draw confident keypoints
                x, y = int(kp["x"]), int(kp["y"])
                cv2.circle(frame, (x, y), 4, color, -1)
                cv2.circle(frame, (x, y), 6, (255, 255, 255), 2)
                
        # Draw skeleton connections (simplified)
        skeleton_connections = [
            ("nose", "neck"), ("neck", "back"),
            ("neck", "left_shoulder"), ("neck", "right_shoulder"),
            ("left_shoulder", "left_elbow"), ("right_shoulder", "right_elbow"),
            ("back", "left_hip"), ("back", "right_hip"),
            ("left_hip", "left_knee"), ("right_hip", "right_knee")
        ]
        
        kp_dict = {kp["name"]: kp for kp in keypoints}
        
        for start_name, end_name in skeleton_connections:
            if (start_name in kp_dict and end_name in kp_dict and
                kp_dict[start_name]["confidence"] > 0.3 and 
                kp_dict[end_name]["confidence"] > 0.3):
                
                start_pt = (int(kp_dict[start_name]["x"]), int(kp_dict[start_name]["y"]))
                end_pt = (int(kp_dict[end_name]["x"]), int(kp_dict[end_name]["y"]))
                cv2.line(frame, start_pt, end_pt, color, 2)
                
    def _draw_performance_overlay(self, frame: np.ndarray, result: ProcessingResult) -> None:
        """Draw performance metrics on frame."""
        # Performance info box
        info_lines = [
            f"Frame: {result.frame_number}",
            f"Horses: {len(result.detections)}",
            f"Total: {result.total_processing_time:.1f}ms",
            f"FPS: {self.stats.fps:.1f}",
            f"Known: {len(self.known_horses)}"
        ]
        
        y_offset = 30
        for line in info_lines:
            cv2.putText(frame, line, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 
                       0.6, (255, 255, 255), 2)
            cv2.putText(frame, line, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 
                       0.6, (0, 0, 0), 1)
            y_offset += 25
            
    def print_final_stats(self) -> None:
        """Print final pipeline performance statistics."""
        print("\n📊 Pipeline Performance Statistics:")
        print("=" * 50)
        print(f"Total Frames Processed: {self.stats.total_frames}")
        print(f"Successful Detections: {self.stats.successful_detections} ({self.stats.successful_detections/max(1,self.stats.total_frames)*100:.1f}%)")
        print(f"Successful Poses: {self.stats.successful_poses} ({self.stats.successful_poses/max(1,self.stats.total_frames)*100:.1f}%)")
        print(f"Successful ReID: {self.stats.successful_reid} ({self.stats.successful_reid/max(1,self.stats.total_frames)*100:.1f}%)")
        print(f"\nTiming Performance:")
        print(f"  Detection: {self.stats.avg_detection_time:.1f}ms avg")
        print(f"  Pose Est.: {self.stats.avg_pose_time:.1f}ms avg")  
        print(f"  ReID: {self.stats.avg_reid_time:.1f}ms avg")
        print(f"  Total: {self.stats.avg_total_time:.1f}ms avg")
        print(f"  FPS: {self.stats.fps:.1f}")
        print(f"\nQuality Metrics:")
        print(f"  Avg Detection Confidence: {self.stats.detection_confidence_mean:.1%}")
        print(f"  Avg Pose Confidence: {self.stats.pose_confidence_mean:.1%}")
        print(f"  Unique Horses Tracked: {len(self.known_horses)}")
        
        # Horse tracking summary
        if self.known_horses:
            print(f"\n🐎 Horse Tracking Summary:")
            for horse_id, info in self.known_horses.items():
                duration = info["last_seen"] - info["first_seen"]
                print(f"  {horse_id}: {info['detection_count']} detections over {duration:.1f}s")
                

def test_video_file(pipeline: HorseTrackingPipeline, video_path: str, output_dir: str) -> bool:
    """Test pipeline on video file."""
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"❌ Could not open video: {video_path}")
            return False
            
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        print(f"📹 Processing video: {Path(video_path).name}")
        print(f"   Resolution: {width}x{height}, FPS: {fps}, Frames: {frame_count}")
        
        # Setup output video writer
        output_path = Path(output_dir) / f"processed_{Path(video_path).stem}.mp4"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        
        frame_number = 0
        start_time = time.time()
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            # Process frame
            timestamp = frame_number / fps
            result = pipeline.process_frame(frame, frame_number, timestamp)
            
            # Draw overlays
            output_frame = pipeline.draw_overlays(frame, result)
            
            # Write to output video
            out.write(output_frame)
            
            # Progress update
            if frame_number % 30 == 0:  # Every 30 frames
                elapsed = time.time() - start_time
                progress = frame_number / frame_count * 100
                eta = (elapsed / max(frame_number, 1)) * (frame_count - frame_number)
                print(f"  Progress: {progress:.1f}% ({frame_number}/{frame_count}) | ETA: {eta:.1f}s | FPS: {pipeline.stats.fps:.1f}")
                
            frame_number += 1
            
        # Cleanup
        cap.release()
        out.release()
        
        elapsed_time = time.time() - start_time
        print(f"✅ Video processing completed in {elapsed_time:.1f}s")
        print(f"📁 Output saved to: {output_path}")
        
        return True
        
    except Exception as error:
        print(f"❌ Video processing failed: {error}")
        return False


def test_camera_feed(pipeline: HorseTrackingPipeline, camera_id: int, duration: int) -> bool:
    """Test pipeline on live camera feed."""
    try:
        cap = cv2.VideoCapture(camera_id)
        if not cap.isOpened():
            print(f"❌ Could not open camera: {camera_id}")
            return False
            
        print(f"📷 Testing live camera feed (Camera {camera_id}) for {duration}s")
        print("Press 'q' to quit early")
        
        frame_number = 0
        start_time = time.time()
        
        while True:
            ret, frame = cap.read()
            if not ret:
                print("❌ Failed to read from camera")
                break
                
            # Process frame
            timestamp = time.time() - start_time
            result = pipeline.process_frame(frame, frame_number, timestamp)
            
            # Draw overlays
            output_frame = pipeline.draw_overlays(frame, result)
            
            # Display frame
            cv2.imshow('BarnHand ML Pipeline Test', output_frame)
            
            # Check for quit or duration limit
            if cv2.waitKey(1) & 0xFF == ord('q') or timestamp >= duration:
                break
                
            frame_number += 1
            
        # Cleanup
        cap.release()
        cv2.destroyAllWindows()
        
        elapsed_time = time.time() - start_time
        print(f"✅ Camera test completed in {elapsed_time:.1f}s")
        
        return True
        
    except Exception as error:
        print(f"❌ Camera test failed: {error}")
        return False


def run_benchmark(pipeline: HorseTrackingPipeline, iterations: int) -> bool:
    """Run benchmark test with synthetic data."""
    try:
        print(f"🏃 Running benchmark test ({iterations} iterations)")
        
        # Create synthetic test frame
        test_frame = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
        
        results = []
        start_time = time.time()
        
        for i in range(iterations):
            timestamp = time.time()
            result = pipeline.process_frame(test_frame, i, timestamp)
            results.append(result.total_processing_time)
            
            if i % 20 == 0:
                avg_time = np.mean(results[-20:]) if results else 0
                fps = 1000.0 / avg_time if avg_time > 0 else 0
                print(f"  Iteration {i}/{iterations} | Avg: {avg_time:.1f}ms | FPS: {fps:.1f}")
                
        elapsed_time = time.time() - start_time
        
        # Benchmark statistics
        print(f"\n🏆 Benchmark Results:")
        print(f"  Total Time: {elapsed_time:.1f}s")
        print(f"  Iterations: {iterations}")
        print(f"  Min Time: {min(results):.1f}ms")
        print(f"  Max Time: {max(results):.1f}ms")
        print(f"  Mean Time: {np.mean(results):.1f}ms")
        print(f"  Std Dev: {np.std(results):.1f}ms")
        print(f"  Throughput: {iterations/elapsed_time:.1f} fps")
        
        return True
        
    except Exception as error:
        print(f"❌ Benchmark failed: {error}")
        return False


def main():
    parser = argparse.ArgumentParser(description="BarnHand ML Pipeline Test")
    parser.add_argument("--video", help="Test video file path")
    parser.add_argument("--camera", type=int, help="Camera ID for live test")
    parser.add_argument("--duration", type=int, default=30, help="Test duration in seconds")
    parser.add_argument("--output", default="test_output", help="Output directory")
    parser.add_argument("--benchmark", action="store_true", help="Run benchmark test")
    parser.add_argument("--iterations", type=int, default=100, help="Benchmark iterations")
    
    args = parser.parse_args()
    
    # Header
    print("🐎 BarnHand ML Pipeline Test")
    print("=" * 50)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Settings: Confidence={settings.confidence_threshold}, Device={settings.ml_device}")
    print()
    
    # Initialize pipeline
    pipeline = HorseTrackingPipeline()
    if not pipeline.initialize_models():
        print("❌ Pipeline initialization failed")
        return 1
        
    success = True
    
    try:
        if args.benchmark:
            success = run_benchmark(pipeline, args.iterations)
        elif args.video:
            success = test_video_file(pipeline, args.video, args.output)
        elif args.camera is not None:
            success = test_camera_feed(pipeline, args.camera, args.duration)
        else:
            print("❌ No test mode specified. Use --video, --camera, or --benchmark")
            return 1
            
        # Print final statistics
        pipeline.print_final_stats()
        
        if success:
            print("\n🎉 Pipeline test completed successfully!")
            return 0
        else:
            print("\n❌ Pipeline test failed!")
            return 1
            
    except KeyboardInterrupt:
        print("\n⏹️  Test interrupted by user")
        pipeline.print_final_stats()
        return 1
    except Exception as error:
        print(f"\n❌ Unexpected error: {error}")
        return 1


if __name__ == "__main__":
    exit(main())