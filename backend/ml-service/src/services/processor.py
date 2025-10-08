"""Enhanced ML processing service with integrated state detection."""
import asyncio
import time
import uuid
import json
import subprocess
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np
from loguru import logger

from ..config.settings import settings
from ..models.detection import HorseDetectionModel
from ..models.pose import HorsePoseModel
from ..models.horse_tracker import HorseTracker
from ..models.pose_analysis import PoseAnalyzer, PoseMetrics
from ..models.gait_classifier import GaitClassifier, GaitMetrics
from ..models.pose_validator import PoseValidator
from ..models.hierarchical_state_detection import HierarchicalStateDetector
from ..models.advanced_state_detection import AdvancedStateDetector
from .horse_database import HorseDatabaseService


class ChunkProcessor:
    """Enhanced processor for analyzing video chunks with integrated behavioral state detection."""
    
    def __init__(self) -> None:
        self.detection_model = HorseDetectionModel()
        self.pose_model = HorsePoseModel()
        self.horse_tracker = HorseTracker()
        self.horse_db = HorseDatabaseService()
        
        # Pose analysis components
        self.pose_analyzers = {}  # Per-horse analyzers
        self.gait_classifiers = {}  # Per-horse gait classifiers
        self.pose_validator = PoseValidator()
        
        # *** NEW: Behavioral state detection components ***
        self.hierarchical_state_detectors = {}  # Per-horse hierarchical state detectors
        self.advanced_state_detectors = {}      # Per-horse advanced state detectors
        
        self.processing_stats = {
            "chunks_processed": 0,
            "total_detections": 0,
            "total_tracks": 0,
            "total_behavioral_states": 0,  # NEW: Track behavioral analysis
            "avg_processing_time": 0.0,
            "avg_fps": 0.0
        }
        
    async def initialize(self) -> None:
        """Initialize ML models and tracking system."""
        try:
            logger.info("Initializing enhanced ML models with behavioral state detection...")
            
            # Load detection models
            self.detection_model.load_models()
            
            # Load pose model
            self.pose_model.load_model()
            
            # Initialize horse tracker
            await self.horse_tracker.initialize()
            
            # Initialize database service
            await self.horse_db.initialize()
            
            logger.info("Enhanced ML models and behavioral state detection initialized successfully")
            
        except Exception as error:
            logger.error(f"Failed to initialize enhanced ML models: {error}")
            raise
            
    async def process_chunk(self, chunk_path: str, chunk_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a video chunk for horse detection, tracking, and behavioral state analysis.
        
        Args:
            chunk_path: Path to video chunk file
            chunk_metadata: Metadata about the chunk (stream_id, start_time, etc.)
            
        Returns:
            Processing results with detections, overlays, and behavioral states
        """
        start_time = time.time()
        chunk_id = str(uuid.uuid4())
        
        logger.info(f"Processing chunk with behavioral analysis: {chunk_path}", 
                   chunk_id=chunk_id,
                   stream_id=chunk_metadata.get("stream_id"),
                   start_time=chunk_metadata.get("start_time"))
        
        try:
            # Load video chunk
            frames, fps = await self._load_video_chunk(chunk_path)
            if not frames:
                raise ValueError("No frames extracted from video chunk")
                
            # Process each frame for detections, tracking, poses, and behavioral states
            frame_results = []
            total_detections = 0
            total_tracks = 0
            total_behavioral_states = 0
            
            logger.debug(f"Starting enhanced frame processing for {len(frames)} frames")
            
            for frame_idx, frame in enumerate(frames):
                frame_start = time.time()
                frame_timestamp = chunk_metadata.get("start_time", 0) + (frame_idx / fps if fps > 0 else frame_idx * 0.033)
                
                # Step 1: Detect horses in frame
                detections, detection_time = self.detection_model.detect_horses(frame)
                total_detections += len(detections)
                
                # Step 2: Update horse tracking with detections
                tracked_horses = self.horse_tracker.update_tracks(detections, frame, frame_timestamp)
                total_tracks = len(tracked_horses)
                
                # Step 3: Process poses and behavioral states for each horse
                frame_poses = []
                frame_behavioral_states = []
                
                for track_info in tracked_horses:
                    horse_id = str(track_info.get("tracking_id", "unknown"))
                    bbox = track_info.get("bbox", {})
                    
                    # Initialize state detectors for new horses
                    self._ensure_horse_analyzers(horse_id)
                    
                    # Estimate pose for this horse
                    pose_result = None
                    if bbox and bbox.get("width", 0) > 0 and bbox.get("height", 0) > 0:
                        try:
                            pose_result, pose_confidence = self.pose_model.estimate_pose(frame, bbox)
                            if pose_result:
                                frame_poses.append({
                                    "horse_id": horse_id,
                                    "pose": pose_result,
                                    "confidence": pose_confidence,
                                    "bbox": bbox
                                })
                        except Exception as pose_error:
                            logger.debug(f"Pose estimation failed for horse {horse_id}: {pose_error}")
                    
                    # *** NEW: Behavioral state detection ***
                    behavioral_state = self._process_behavioral_state(
                        horse_id, pose_result, track_info, frame_timestamp
                    )
                    
                    if behavioral_state:
                        frame_behavioral_states.append(behavioral_state)
                        total_behavioral_states += 1
                    
                    # Save horse to database if new or updated
                    if track_info["is_new"] or track_info["total_detections"] % 10 == 0:
                        await self._save_horse_to_database_enhanced(
                            track_info, frame_timestamp, behavioral_state
                        )
                        
                frame_time = (time.time() - frame_start) * 1000
                
                frame_result = {
                    "frame_index": frame_idx,
                    "timestamp": frame_timestamp,
                    "detections": detections,
                    "tracked_horses": tracked_horses,
                    "poses": frame_poses,
                    "behavioral_states": frame_behavioral_states,  # NEW: Behavioral state data
                    "processing_time_ms": frame_time
                }
                frame_results.append(frame_result)
                
            # Generate chunk summary
            processing_time = (time.time() - start_time) * 1000
            chunk_fps = len(frames) / (processing_time / 1000) if processing_time > 0 else 0
            
            # Update performance metrics
            self._update_enhanced_stats(processing_time, chunk_fps, total_detections, total_tracks, total_behavioral_states)
            
            # Generate enhanced overlay data with behavioral states
            overlay_data = self._generate_enhanced_overlay_data(frame_results, chunk_metadata)
            
            # Create processed chunk metadata with behavioral analysis
            result = {
                "chunk_id": chunk_id,
                "stream_id": chunk_metadata.get("stream_id"),
                "start_time": chunk_metadata.get("start_time", 0),
                "duration": len(frames) / fps if fps > 0 else len(frames) * 0.033,
                "frame_count": len(frames),
                "fps": fps,
                "processing_time_ms": processing_time,
                "processing_fps": chunk_fps,
                "total_detections": total_detections,
                "total_tracks": total_tracks,
                "total_behavioral_states": total_behavioral_states,  # NEW: Behavioral state count
                "unique_horses": self._count_unique_horses(frame_results),
                "behavioral_summary": self._generate_behavioral_summary(frame_results),  # NEW: Behavioral summary
                "tracking_stats": self.horse_tracker.get_tracking_stats(),
                "frame_results": frame_results,
                "overlay_data": overlay_data,
                "model_info": {
                    "detection_model": self.detection_model.get_model_info(),
                    "pose_model": self.pose_model.get_performance_info(),
                    "tracking_model": self.horse_tracker.reid_model.get_model_info(),
                    "behavioral_models": self._get_behavioral_model_info()  # NEW: Behavioral model info
                },
                "status": "completed",
                "processed_at": time.time()
            }
            
            logger.info(f"Enhanced chunk processing completed", 
                       chunk_id=chunk_id,
                       processing_time_ms=round(processing_time, 1),
                       fps=round(chunk_fps, 1),
                       detections=total_detections,
                       behavioral_states=total_behavioral_states,
                       frames=len(frames))
            
            return result
            
        except Exception as error:
            processing_time = (time.time() - start_time) * 1000
            import traceback
            logger.error(f"Enhanced chunk processing failed after {processing_time:.1f}ms: {error}",
                        chunk_id=chunk_id,
                        chunk_path=chunk_path,
                        extra={"traceback": traceback.format_exc()})
            
            return {
                "chunk_id": chunk_id,
                "stream_id": chunk_metadata.get("stream_id"),
                "status": "failed",
                "error": str(error),
                "processing_time_ms": processing_time,
                "processed_at": time.time()
            }

    async def process_chunk_with_video_output(
        self,
        chunk_path: str,
        chunk_metadata: Dict[str, Any],
        output_video_path: str,
        output_json_path: str
    ) -> Dict[str, Any]:
        """
        Process chunk and output both processed video and detections JSON.

        Args:
            chunk_path: Path to input raw video chunk
            chunk_metadata: Metadata about the chunk (stream_id, chunk_id, etc.)
            output_video_path: Path where processed video should be saved
            output_json_path: Path where detections JSON should be saved

        Returns:
            Processing results including paths to outputs
        """
        start_time = time.time()
        chunk_id = chunk_metadata.get("chunk_id", str(uuid.uuid4()))

        logger.info(f"Processing chunk with video output: {chunk_path}",
                   chunk_id=chunk_id,
                   output_video=output_video_path,
                   output_json=output_json_path)

        try:
            # Load video chunk
            cap = cv2.VideoCapture(chunk_path)
            if not cap.isOpened():
                raise ValueError(f"Failed to open video: {chunk_path}")

            # Get video properties
            fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            logger.info(f"Video properties: {width}x{height} @ {fps}fps, {total_frames} frames")

            # Create output directories
            Path(output_video_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_json_path).parent.mkdir(parents=True, exist_ok=True)

            # Create temporary directory for frames (FFmpeg workaround for Docker codec issues)
            temp_frames_dir = Path(f"/tmp/chunk_processing_{chunk_id}")
            temp_frames_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Saving frames to temporary directory: {temp_frames_dir}")

            # Process frames
            frame_idx = 0
            frame_results = []
            total_detections = 0
            total_tracks = 0
            processed_frames = []  # Store frames for FFmpeg writing

            while cap.isOpened() and frame_idx < total_frames:
                ret, frame = cap.read()
                if not ret:
                    break

                frame_timestamp = chunk_metadata.get("start_time", 0) + (frame_idx / fps)

                # Step 1: Detect horses
                detections, _ = self.detection_model.detect_horses(frame)
                total_detections += len(detections)

                # Step 2: Update tracking
                tracked_horses = self.horse_tracker.update_tracks(detections, frame, frame_timestamp)
                total_tracks = len(tracked_horses)

                # Step 3: Process poses and states
                frame_poses = []
                frame_behavioral_states = []

                for track_info in tracked_horses:
                    horse_id = str(track_info.get("tracking_id", "unknown"))
                    bbox = track_info.get("bbox", {})

                    # Initialize state detectors for new horses
                    self._ensure_horse_analyzers(horse_id)

                    # Estimate pose
                    pose_result = None
                    if bbox and bbox.get("width", 0) > 0 and bbox.get("height", 0) > 0:
                        try:
                            pose_result, pose_confidence = self.pose_model.estimate_pose(frame, bbox)
                            if pose_result:
                                frame_poses.append({
                                    "horse_id": horse_id,
                                    "pose": pose_result,
                                    "confidence": pose_confidence,
                                    "bbox": bbox
                                })
                        except Exception as pose_error:
                            logger.debug(f"Pose estimation failed for horse {horse_id}: {pose_error}")

                    # Process behavioral state
                    behavioral_state = self._process_behavioral_state(
                        horse_id, pose_result, track_info, frame_timestamp
                    )

                    if behavioral_state:
                        frame_behavioral_states.append(behavioral_state)

                # Draw overlays on frame
                processed_frame = self._draw_overlays(
                    frame.copy(),
                    tracked_horses,
                    frame_poses,
                    frame_behavioral_states
                )

                # Save frame as PNG for FFmpeg
                frame_path = temp_frames_dir / f"frame_{frame_idx:04d}.png"
                cv2.imwrite(str(frame_path), processed_frame)
                processed_frames.append(frame_path)

                # Save frame results
                frame_result = {
                    "frame_index": frame_idx,
                    "timestamp": frame_timestamp,
                    "detections": detections,
                    "tracked_horses": tracked_horses,
                    "poses": frame_poses,
                    "behavioral_states": frame_behavioral_states
                }
                frame_results.append(frame_result)

                # Progress logging
                if frame_idx % 30 == 0 and frame_idx > 0:
                    progress = (frame_idx / total_frames) * 100
                    logger.info(f"Processing progress: {progress:.1f}% ({frame_idx}/{total_frames})")

                frame_idx += 1

            # Cleanup video capture
            cap.release()

            # Use FFmpeg to create video from frames
            logger.info(f"Creating video with FFmpeg from {len(processed_frames)} frames...")
            self._create_video_with_ffmpeg(temp_frames_dir, output_video_path, fps)

            # Cleanup temporary frames
            logger.info(f"Cleaning up temporary frames directory: {temp_frames_dir}")
            shutil.rmtree(temp_frames_dir, ignore_errors=True)

            # Generate processing result
            processing_time = (time.time() - start_time) * 1000

            # Save detections JSON
            detections_data = {
                "video_metadata": {
                    "fps": fps,
                    "duration": total_frames / fps if fps > 0 else 0,
                    "resolution": f"{width}x{height}",
                    "total_frames": total_frames
                },
                "summary": {
                    "total_horses": self._count_unique_horses(frame_results),
                    "total_detections": total_detections,
                    "total_frames": len(frame_results),
                    "processing_time_ms": processing_time,
                    "processing_fps": len(frame_results) / (processing_time / 1000) if processing_time > 0 else 0
                },
                "horses": self._generate_horse_summary(frame_results),
                "frames": frame_results
            }

            with open(output_json_path, 'w') as f:
                json.dump(detections_data, f, indent=2, default=str)

            logger.info(f"Chunk processing completed",
                       chunk_id=chunk_id,
                       processing_time_ms=round(processing_time, 1),
                       output_video=output_video_path,
                       output_json=output_json_path)

            return {
                "chunk_id": chunk_id,
                "stream_id": chunk_metadata.get("stream_id"),
                "status": "completed",
                "processed_video_path": output_video_path,
                "detections_path": output_json_path,
                "processing_time_ms": processing_time,
                "summary": detections_data["summary"],
                "processed_at": time.time()
            }

        except Exception as error:
            import traceback
            processing_time = (time.time() - start_time) * 1000

            # Log with full traceback
            logger.exception(f"Chunk processing with video output failed: {error}",
                           chunk_id=chunk_id,
                           error=str(error))

            # Also print traceback to stdout for debugging
            print(f"=== CHUNK PROCESSING ERROR ===")
            print(f"Chunk ID: {chunk_id}")
            print(f"Error: {error}")
            print(f"Traceback:")
            traceback.print_exc()

            return {
                "chunk_id": chunk_id,
                "stream_id": chunk_metadata.get("stream_id"),
                "status": "failed",
                "error": str(error),
                "processing_time_ms": processing_time,
                "processed_at": time.time()
            }

    def _draw_overlays(
        self,
        frame: np.ndarray,
        tracked_horses: List[Dict],
        frame_poses: List[Dict],
        frame_behavioral_states: List[Dict]
    ) -> np.ndarray:
        """Draw detection, tracking, and pose overlays on frame."""

        # Create overlay map for behavioral states
        state_map = {state["horse_id"]: state for state in frame_behavioral_states}
        pose_map = {pose["horse_id"]: pose for pose in frame_poses}

        # Draw each tracked horse
        for track in tracked_horses:
            horse_id = str(track.get("tracking_id", "unknown"))
            bbox = track.get("bbox", {})
            color = track.get("color", [255, 255, 255])

            # Convert BGR color if needed
            if isinstance(color, list) and len(color) == 3:
                color = tuple(color)
            else:
                color = (255, 255, 255)

            # Draw bounding box
            if bbox:
                x = int(bbox.get("x", 0))
                y = int(bbox.get("y", 0))
                w = int(bbox.get("width", 0))
                h = int(bbox.get("height", 0))

                # Draw bbox rectangle
                cv2.rectangle(frame, (x, y), (x + w, y + h), color, 3)

                # Draw horse ID
                cv2.putText(frame, f"#{horse_id}", (x, y - 10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

                # Draw behavioral state if available
                if horse_id in state_map:
                    state = state_map[horse_id]
                    hierarchical = state.get("hierarchical_analysis", {})
                    primary_state = hierarchical.get("primary_state", "unknown")

                    # Draw state label
                    state_text = primary_state.upper() if primary_state else "UNKNOWN"
                    cv2.putText(frame, state_text, (x, y + h + 25),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # Draw pose keypoints if available
            if horse_id in pose_map:
                pose = pose_map[horse_id]
                keypoints = pose["pose"].get("keypoints", [])

                if keypoints and len(keypoints) > 0:
                    for i, kp in enumerate(keypoints):
                        # Keypoints are dicts with 'x', 'y', 'confidence' keys
                        if isinstance(kp, dict) and 'x' in kp and 'y' in kp:
                            x, y = int(kp['x']), int(kp['y'])
                            if x > 0 and y > 0:  # Valid keypoint
                                # Color code by body part
                                if i < 5:  # Head/neck
                                    kp_color = (0, 255, 255)  # Yellow
                                elif i < 11:  # Front legs
                                    kp_color = (255, 0, 0)  # Blue
                                else:  # Back legs/body
                                    kp_color = (0, 255, 0)  # Green

                                cv2.circle(frame, (x, y), 4, kp_color, -1)
                                cv2.circle(frame, (x, y), 4, (255, 255, 255), 1)

        # Draw header info
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 60), (0, 0, 0), -1)
        cv2.putText(frame, f"BarnHand ML Processing - Horses: {len(tracked_horses)}",
                   (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(frame, f"Detections: {len(tracked_horses)} | Poses: {len(frame_poses)}",
                   (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)

        return frame

    def _generate_horse_summary(self, frame_results: List[Dict]) -> List[Dict]:
        """Generate per-horse summary across all frames."""
        horse_data = {}

        for frame_idx, frame_result in enumerate(frame_results):
            for track in frame_result["tracked_horses"]:
                horse_id = str(track.get("tracking_id"))

                if horse_id not in horse_data:
                    horse_data[horse_id] = {
                        "id": horse_id,
                        "color": track.get("color", [255, 255, 255]),
                        "total_detections": 0,
                        "confidences": [],
                        "states": [],
                        "first_frame": frame_idx,
                        "last_frame": frame_idx
                    }
                else:
                    # Update last frame
                    horse_data[horse_id]["last_frame"] = frame_idx

                horse_data[horse_id]["total_detections"] += 1
                horse_data[horse_id]["confidences"].append(track.get("confidence", 0.0))

            # Add behavioral states
            for state in frame_result.get("behavioral_states", []):
                horse_id = state.get("horse_id")
                if horse_id in horse_data:
                    hierarchical = state.get("hierarchical_analysis", {})
                    primary_state = hierarchical.get("primary_state")
                    if primary_state:
                        horse_data[horse_id]["states"].append(primary_state)

        # Calculate averages and format output
        horse_summaries = []
        for horse_id, data in horse_data.items():
            avg_confidence = sum(data["confidences"]) / len(data["confidences"]) if data["confidences"] else 0.0

            # Count state distribution
            state_counts = {}
            for state in data["states"]:
                state_counts[state] = state_counts.get(state, 0) + 1

            horse_summaries.append({
                "id": horse_id,
                "color": data["color"],
                "first_detected_frame": data["first_frame"],
                "last_detected_frame": data["last_frame"],
                "total_detections": data["total_detections"],
                "avg_confidence": round(avg_confidence, 3),
                "state_distribution": state_counts
            })

        return horse_summaries

    def _create_video_with_ffmpeg(self, frames_dir: Path, output_path: str, fps: int) -> None:
        """
        Create video from PNG frames using FFmpeg subprocess.
        This is a workaround for OpenCV VideoWriter codec issues in Docker.
        """
        try:
            # FFmpeg command to create video from frame sequence
            cmd = [
                'ffmpeg',
                '-y',  # Overwrite output file
                '-framerate', str(fps),
                '-i', str(frames_dir / 'frame_%04d.png'),
                '-c:v', 'libx264',  # H.264 codec
                '-pix_fmt', 'yuv420p',  # Pixel format for compatibility
                '-preset', 'fast',  # Encoding speed preset
                '-crf', '23',  # Quality (0-51, lower is better, 23 is default)
                output_path
            ]

            logger.info(f"FFmpeg command: {' '.join(cmd)}")

            # Run FFmpeg
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode != 0:
                logger.error(f"FFmpeg failed with return code {result.returncode}")
                logger.error(f"FFmpeg stderr: {result.stderr}")
                raise RuntimeError(f"FFmpeg video creation failed: {result.stderr}")

            logger.info(f"Video created successfully: {output_path}")

        except subprocess.TimeoutExpired:
            logger.error("FFmpeg timeout - video creation took too long")
            raise RuntimeError("FFmpeg timeout during video creation")
        except Exception as error:
            logger.error(f"FFmpeg video creation error: {error}")
            raise

    def _ensure_horse_analyzers(self, horse_id: str) -> None:
        """Ensure behavioral state analyzers exist for a horse."""
        if horse_id not in self.hierarchical_state_detectors:
            self.hierarchical_state_detectors[horse_id] = HierarchicalStateDetector()
            logger.debug(f"Created hierarchical state detector for horse {horse_id}")
            
        if horse_id not in self.advanced_state_detectors:
            self.advanced_state_detectors[horse_id] = AdvancedStateDetector()
            logger.debug(f"Created advanced state detector for horse {horse_id}")
    
    def _process_behavioral_state(self, horse_id: str, pose_result: Optional[Dict], 
                                 track_info: Dict, timestamp: float) -> Optional[Dict]:
        """Process behavioral state for a single horse."""
        try:
            if not pose_result or not pose_result.get("keypoints"):
                return None
                
            # Get state detectors for this horse
            hierarchical_detector = self.hierarchical_state_detectors.get(horse_id)
            advanced_detector = self.advanced_state_detectors.get(horse_id)
            
            if not hierarchical_detector or not advanced_detector:
                return None
            
            # Process pose data through hierarchical detector
            hierarchical_detector.process_pose_data(pose_result, timestamp)
            
            # Get hierarchical state analysis
            primary_state = hierarchical_detector.detect_primary_body_state()
            head_position = hierarchical_detector.detect_head_position()
            leg_activity = hierarchical_detector.detect_leg_activity()
            behavioral_events = hierarchical_detector.detect_behavioral_events()
            
            # Process through advanced detector
            advanced_state = advanced_detector.detect_state(pose_result, timestamp)
            
            # Combine results
            behavioral_state = {
                "horse_id": horse_id,
                "timestamp": timestamp,
                "hierarchical_analysis": {
                    "primary_state": primary_state,
                    "head_position": head_position,
                    "leg_activity": leg_activity,
                    "behavioral_events": behavioral_events
                },
                "advanced_analysis": advanced_state,
                "confidence": pose_result.get("confidence", 0.0),
                "bbox": track_info.get("bbox", {})
            }
            
            return behavioral_state
            
        except Exception as e:
            logger.debug(f"Behavioral state processing failed for horse {horse_id}: {e}")
            return None
    
    def _generate_behavioral_summary(self, frame_results: List[Dict]) -> Dict[str, Any]:
        """Generate summary of behavioral states across all frames."""
        state_counts = {}
        horse_states = {}
        
        for frame_result in frame_results:
            for behavioral_state in frame_result.get("behavioral_states", []):
                horse_id = behavioral_state["horse_id"]
                
                # Count primary states
                hierarchical = behavioral_state.get("hierarchical_analysis", {})
                primary_state = hierarchical.get("primary_state", "unknown")
                
                if primary_state not in state_counts:
                    state_counts[primary_state] = 0
                state_counts[primary_state] += 1
                
                # Track per-horse state
                if horse_id not in horse_states:
                    horse_states[horse_id] = []
                horse_states[horse_id].append(primary_state)
        
        return {
            "total_behavioral_frames": sum(state_counts.values()),
            "state_distribution": state_counts,
            "horses_analyzed": len(horse_states),
            "dominant_states": sorted(state_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        }
    
    def _get_behavioral_model_info(self) -> Dict[str, Any]:
        """Get information about behavioral analysis models."""
        return {
            "hierarchical_detectors": len(self.hierarchical_state_detectors),
            "advanced_detectors": len(self.advanced_state_detectors),
            "state_types": [
                "standing", "lying", "grazing", "walking", "trotting", 
                "cantering", "galloping", "head_up", "head_down", "alert"
            ]
        }
    
    async def _save_horse_to_database_enhanced(self, track_info: Dict, timestamp: float, 
                                              behavioral_state: Optional[Dict]) -> None:
        """Save horse data with behavioral state information to database."""
        try:
            # Original horse data
            horse_data = {
                "stream_id": "default",  # TODO: Get from chunk metadata
                "horse_id": str(track_info.get("tracking_id", "unknown")),
                "timestamp": timestamp,
                "bbox": track_info.get("bbox", {}),
                "confidence": track_info.get("confidence", 0.0),
                "features": track_info.get("features", []).tolist() if hasattr(track_info.get("features", []), "tolist") else [],
                "total_detections": track_info.get("total_detections", 0)
            }
            
            # Add behavioral state data if available
            if behavioral_state:
                horse_data["behavioral_state"] = behavioral_state
            
            await self.horse_db.save_horse(horse_data)
            
        except Exception as e:
            logger.debug(f"Failed to save enhanced horse data: {e}")
    
    def _generate_enhanced_overlay_data(self, frame_results: List[Dict], chunk_metadata: Dict) -> Dict[str, Any]:
        """Generate overlay data including behavioral state visualizations."""
        overlay_data = self._generate_overlay_data(frame_results, chunk_metadata)
        
        # Add behavioral state overlays
        behavioral_overlays = []
        
        for frame_result in frame_results:
            frame_overlays = []
            
            for behavioral_state in frame_result.get("behavioral_states", []):
                hierarchical = behavioral_state.get("hierarchical_analysis", {})
                primary_state = hierarchical.get("primary_state", "unknown")
                head_position = hierarchical.get("head_position", "unknown")
                
                bbox = behavioral_state.get("bbox", {})
                if bbox and bbox.get("width", 0) > 0:
                    frame_overlays.append({
                        "type": "behavioral_state",
                        "horse_id": behavioral_state["horse_id"],
                        "bbox": bbox,
                        "state": primary_state,
                        "head_position": head_position,
                        "confidence": behavioral_state.get("confidence", 0.0)
                    })
            
            behavioral_overlays.append(frame_overlays)
        
        overlay_data["behavioral_overlays"] = behavioral_overlays
        return overlay_data
    
    def _update_enhanced_stats(self, processing_time: float, fps: float, 
                              detections: int, tracks: int, behavioral_states: int) -> None:
        """Update processing statistics including behavioral analysis."""
        self.processing_stats["chunks_processed"] += 1
        
        # Update averages with exponential moving average
        alpha = 0.1
        if self.processing_stats["avg_processing_time"] == 0:
            self.processing_stats["avg_processing_time"] = processing_time
            self.processing_stats["avg_fps"] = fps
        else:
            self.processing_stats["avg_processing_time"] = (
                (1 - alpha) * self.processing_stats["avg_processing_time"] + alpha * processing_time
            )
            self.processing_stats["avg_fps"] = (
                (1 - alpha) * self.processing_stats["avg_fps"] + alpha * fps
            )
        
        # Update totals
        self.processing_stats["total_detections"] += detections
        self.processing_stats["total_tracks"] += tracks
        self.processing_stats["total_behavioral_states"] += behavioral_states

    # Keep all the existing methods from the original processor
    async def _load_video_chunk(self, chunk_path: str) -> Tuple[List[np.ndarray], float]:
        """Load video chunk and extract frames."""
        frames = []
        fps = 0.0
        
        try:
            cap = cv2.VideoCapture(chunk_path)
            if not cap.isOpened():
                raise ValueError(f"Could not open video file: {chunk_path}")
                
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps <= 0:
                fps = 30.0  # Default fallback FPS
                
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frames.append(frame)
                
            cap.release()
            logger.debug(f"Loaded {len(frames)} frames at {fps} FPS from {chunk_path}")
            
        except Exception as error:
            logger.error(f"Failed to load video chunk {chunk_path}: {error}")
            raise
            
        return frames, fps
    
    def _generate_overlay_data(self, frame_results: List[Dict], chunk_metadata: Dict) -> Dict[str, Any]:
        """Generate overlay data for frontend visualization."""
        overlay_frames = []
        
        for frame_result in frame_results:
            frame_overlays = {
                "timestamp": frame_result["timestamp"],
                "detections": [],
                "tracks": [],
                "poses": []
            }
            
            # Add detection overlays
            for detection in frame_result["detections"]:
                bbox = detection["bbox"]
                frame_overlays["detections"].append({
                    "bbox": bbox,
                    "confidence": detection["confidence"],
                    "type": "horse"
                })
            
            # Add tracking overlays
            for track in frame_result["tracked_horses"]:
                bbox = track["bbox"]
                frame_overlays["tracks"].append({
                    "id": track["tracking_id"],
                    "bbox": bbox,
                    "confidence": track["confidence"],
                    "color": track.get("color", [255, 255, 255])
                })
            
            # Add pose overlays
            for pose_info in frame_result["poses"]:
                if pose_info["pose"] and "keypoints" in pose_info["pose"]:
                    frame_overlays["poses"].append({
                        "horse_id": pose_info["horse_id"],
                        "keypoints": pose_info["pose"]["keypoints"],
                        "confidence": pose_info["confidence"]
                    })
            
            overlay_frames.append(frame_overlays)
        
        return {
            "chunk_id": chunk_metadata.get("chunk_id", "unknown"),
            "frame_count": len(overlay_frames),
            "overlay_frames": overlay_frames
        }
    
    def _count_unique_horses(self, frame_results: List[Dict]) -> int:
        """Count unique horses across all frames."""
        unique_horses = set()
        
        for frame_result in frame_results:
            for track in frame_result["tracked_horses"]:
                unique_horses.add(track["tracking_id"])
                
        return len(unique_horses)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current processing statistics."""
        return self.processing_stats.copy()
    
    async def merge_horses(self, horse_id_1: str, horse_id_2: str, stream_id: str) -> bool:
        """Merge two horse identities."""
        try:
            return await self.horse_tracker.merge_horses(horse_id_1, horse_id_2, stream_id)
        except Exception as error:
            logger.error(f"Failed to merge horses {horse_id_1} and {horse_id_2}: {error}")
            return False
    
    async def split_horse(self, horse_id: str, split_timestamp: float, stream_id: str) -> Optional[str]:
        """Split horse identity at specified timestamp."""
        try:
            return await self.horse_tracker.split_horse(horse_id, split_timestamp, stream_id)
        except Exception as error:
            logger.error(f"Failed to split horse {horse_id}: {error}")
            return None
    
    def update_similarity_threshold(self, new_threshold: float) -> None:
        """Update the similarity threshold for horse re-identification."""
        try:
            self.horse_tracker.update_similarity_threshold(new_threshold)
            logger.info(f"Updated similarity threshold to {new_threshold}")
        except Exception as error:
            logger.error(f"Failed to update similarity threshold: {error}")
    
    async def batch_process_chunks(self, chunk_paths: List[str], chunk_metadata_list: List[Dict]) -> List[Dict]:
        """Process multiple chunks in batch."""
        results = []
        
        for chunk_path, metadata in zip(chunk_paths, chunk_metadata_list):
            try:
                result = await self.process_chunk(chunk_path, metadata)
                results.append(result)
            except Exception as error:
                logger.error(f"Failed to process chunk {chunk_path}: {error}")
                results.append({
                    "chunk_path": chunk_path,
                    "status": "failed",
                    "error": str(error)
                })
        
        return results