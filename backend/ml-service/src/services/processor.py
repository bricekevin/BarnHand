"""ML processing service for horse detection, pose analysis, and tracking."""
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
import httpx
from loguru import logger

from ..config.settings import settings
from ..models.detection import HorseDetectionModel
from ..models.pose import HorsePoseModel
from ..models.horse_tracker import HorseTracker
from ..models.pose_analysis import PoseAnalyzer, PoseMetrics
from ..models.gait_classifier import GaitClassifier, GaitMetrics
from ..models.pose_validator import PoseValidator
from .horse_database import HorseDatabaseService


class ChunkProcessor:
    """Processor for analyzing video chunks with horse detection, pose estimation, and tracking."""

    def __init__(self) -> None:
        self.detection_model = HorseDetectionModel()
        self.pose_model = HorsePoseModel()
        # Note: horse_tracker will be initialized per-chunk with stream_id
        self.horse_tracker: Optional[HorseTracker] = None
        self.horse_db = HorseDatabaseService()

        # Pose analysis components
        self.pose_analyzers = {}  # Per-horse analyzers
        self.gait_classifiers = {}  # Per-horse gait classifiers
        self.pose_validator = PoseValidator()

        # Current stream context (set during chunk processing)
        self.current_stream_id: Optional[str] = None

        self.processing_stats = {
            "chunks_processed": 0,
            "total_detections": 0,
            "total_tracks": 0,
            "avg_processing_time": 0.0,
            "avg_fps": 0.0
        }
        
    async def initialize(self) -> None:
        """Initialize ML models and tracking system."""
        try:
            logger.info("Initializing ML models...")

            # Load detection models
            self.detection_model.load_models()

            # Load pose model
            self.pose_model.load_model()

            # Note: horse_tracker will be initialized per-chunk with stream-specific data

            # Initialize database service
            await self.horse_db.initialize()

            logger.info("ML models initialized successfully")

        except Exception as error:
            logger.error(f"Failed to initialize enhanced ML models: {error}")
            raise
            
    async def process_chunk(self, chunk_path: str, chunk_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a video chunk for horse detection, tracking, and pose analysis.

        Args:
            chunk_path: Path to video chunk file
            chunk_metadata: Metadata about the chunk (stream_id, start_time, etc.)

        Returns:
            Processing results with detections, poses, and overlays
        """
        start_time = time.time()
        # Use chunk_id from metadata if provided, otherwise generate new one
        chunk_id = chunk_metadata.get("chunk_id", str(uuid.uuid4()))

        # Set current stream context for database operations
        self.current_stream_id = chunk_metadata.get("stream_id", "default")

        logger.info(f"Processing chunk: {chunk_path}",
                   chunk_id=chunk_id,
                   stream_id=self.current_stream_id,
                   start_time=chunk_metadata.get("start_time"))

        try:
            # Load video chunk
            frames, fps = await self._load_video_chunk(chunk_path)
            if not frames:
                raise ValueError("No frames extracted from video chunk")
                
            # Process each frame for detections, tracking, and poses
            frame_results = []
            total_detections = 0
            total_tracks = 0

            logger.debug(f"Starting frame processing for {len(frames)} frames")
            
            for frame_idx, frame in enumerate(frames):
                frame_start = time.time()
                frame_timestamp = chunk_metadata.get("start_time", 0) + (frame_idx / fps if fps > 0 else frame_idx * 0.033)
                
                # Step 1: Detect horses in frame
                detections, detection_time = self.detection_model.detect_horses(frame)
                total_detections += len(detections)
                
                # Step 2: Update horse tracking with detections
                tracked_horses = self.horse_tracker.update_tracks(detections, frame, frame_timestamp)
                total_tracks = len(tracked_horses)

                # Step 3: Process poses for each horse
                frame_poses = []

                for track_info in tracked_horses:
                    horse_id = str(track_info.get("tracking_id", "unknown"))
                    bbox = track_info.get("bbox", {})

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

                    # Save horse to database if new or updated
                    if track_info["is_new"] or track_info["total_detections"] % 10 == 0:
                        await self._save_horse_to_database(track_info, frame_timestamp)
                        
                frame_time = (time.time() - frame_start) * 1000
                
                frame_result = {
                    "frame_index": frame_idx,
                    "timestamp": frame_timestamp,
                    "detections": detections,
                    "tracked_horses": tracked_horses,
                    "poses": frame_poses,
                    "processing_time_ms": frame_time
                }
                frame_results.append(frame_result)
                
            # Generate chunk summary
            processing_time = (time.time() - start_time) * 1000
            chunk_fps = len(frames) / (processing_time / 1000) if processing_time > 0 else 0

            # Update performance metrics
            self._update_stats(processing_time, chunk_fps, total_detections, total_tracks)

            # Generate overlay data
            overlay_data = self._generate_overlay_data(frame_results, chunk_metadata)
            
            # Create processed chunk metadata
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
                "unique_horses": self._count_unique_horses(frame_results),
                "tracking_stats": self.horse_tracker.get_tracking_stats(),
                "frame_results": frame_results,
                "overlay_data": overlay_data,
                "model_info": {
                    "detection_model": self.detection_model.get_model_info(),
                    "pose_model": self.pose_model.get_performance_info(),
                    "tracking_model": self.horse_tracker.reid_model.get_model_info()
                },
                "status": "completed",
                "processed_at": time.time()
            }

            logger.info(f"Chunk processing completed",
                       chunk_id=chunk_id,
                       processing_time_ms=round(processing_time, 1),
                       fps=round(chunk_fps, 1),
                       detections=total_detections,
                       frames=len(frames))
            
            return result
            
        except Exception as error:
            processing_time = (time.time() - start_time) * 1000
            import traceback
            logger.error(f"Chunk processing failed after {processing_time:.1f}ms: {error}",
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
        output_json_path: str,
        frame_interval: int = 1
    ) -> Dict[str, Any]:
        """
        Process chunk and output both processed video and detections JSON.

        Args:
            chunk_path: Path to input raw video chunk
            chunk_metadata: Metadata about the chunk (stream_id, chunk_id, etc.)
            output_video_path: Path where processed video should be saved
            output_json_path: Path where detections JSON should be saved
            frame_interval: Process every Nth frame (1 = all frames, 2 = every other frame, etc.)

        Returns:
            Processing results including paths to outputs
        """
        start_time = time.time()
        chunk_id = chunk_metadata.get("chunk_id", str(uuid.uuid4()))

        logger.info(f"Processing chunk with video output: {chunk_path}",
                   chunk_id=chunk_id,
                   chunk_id_from_metadata=chunk_metadata.get("chunk_id"),
                   output_video=output_video_path,
                   output_json=output_json_path,
                   frame_interval=frame_interval)

        try:
            # PHASE 3 INTEGRATION: Load known horses from previous chunks
            stream_id = chunk_metadata.get("stream_id", "default")

            # Set current stream context for database operations
            self.current_stream_id = stream_id

            # STREAM-SCOPED RE-ID: Load horses filtered by stream_id
            # This ensures Re-ID only matches horses within the same stream
            logger.info(f"Loading known horses for stream {stream_id} (stream-scoped Re-ID)")
            known_horses = await self.horse_db.load_stream_horse_registry(stream_id)
            logger.info(f"Loaded {len(known_horses)} known horses from stream {stream_id} registry")

            # Initialize tracker with stream_id and stream-specific known horses
            # Re-ID will only match against horses from this stream
            self.horse_tracker = HorseTracker(
                similarity_threshold=0.7,
                max_lost_frames=30,
                stream_id=stream_id,
                known_horses=known_horses
            )
            await self.horse_tracker.initialize()

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
            # Store last tracking/pose data to reuse overlays on skipped frames
            last_tracked_horses = []
            last_frame_poses = []

            # Initialize progress tracking in Redis
            if self.horse_db.redis_client:
                try:
                    progress_key = f"chunk:{chunk_id}:progress"
                    self.horse_db.redis_client.setex(
                        progress_key,
                        3600,  # 1 hour TTL
                        f"0/{total_frames}"
                    )
                    logger.info(f"✅ Initialized Redis progress: {progress_key} = 0/{total_frames}")
                except Exception as redis_error:
                    logger.warning(f"Failed to initialize progress in Redis: {redis_error}")

            frames_to_process = [i for i in range(total_frames) if i % frame_interval == 0]
            logger.info(f"Frame interval: {frame_interval}, will process {len(frames_to_process)} out of {total_frames} frames")

            while cap.isOpened() and frame_idx < total_frames:
                ret, frame = cap.read()
                if not ret:
                    break

                # Check if this frame should be processed based on interval
                should_process = (frame_idx % frame_interval == 0)

                frame_timestamp = chunk_metadata.get("start_time", 0) + (frame_idx / fps)

                if should_process:
                    # Step 1: Detect horses
                    detections, _ = self.detection_model.detect_horses(frame)
                    total_detections += len(detections)

                    # Step 2: Update tracking
                    tracked_horses = self.horse_tracker.update_tracks(detections, frame, frame_timestamp)
                    total_tracks = len(tracked_horses)
                else:
                    # Skip processing but keep empty placeholders
                    detections = []
                    tracked_horses = []

                # Step 3: Process poses in BATCH (MAJOR OPTIMIZATION) - only for processed frames
                frame_poses = []

                if should_process:
                    # Collect all valid bboxes for batch processing
                    valid_tracks = []
                    valid_bboxes = []
                    for track_info in tracked_horses:
                        horse_id = str(track_info.get("tracking_id", "unknown"))
                        bbox = track_info.get("bbox", {})

                        if bbox and bbox.get("width", 0) > 0 and bbox.get("height", 0) > 0:
                            valid_tracks.append(track_info)
                            valid_bboxes.append(bbox)

                    # Batch pose estimation for all horses at once
                    if valid_bboxes:
                        try:
                            batch_pose_results = self.pose_model.estimate_pose_batch(frame, valid_bboxes)

                            # Process batch results
                            for track_info, (pose_result, pose_time) in zip(valid_tracks, batch_pose_results):
                                horse_id = str(track_info.get("tracking_id", "unknown"))
                                bbox = track_info.get("bbox", {})

                                if pose_result:
                                    frame_poses.append({
                                        "horse_id": horse_id,
                                        "pose": pose_result,
                                        "confidence": pose_result.get("pose_confidence", 0.0),
                                        "bbox": bbox
                                    })

                        except Exception as batch_error:
                            logger.warning(f"Batch pose processing failed, falling back to sequential: {batch_error}")
                            # Fallback to sequential processing
                            for track_info in valid_tracks:
                                horse_id = str(track_info.get("tracking_id", "unknown"))
                                bbox = track_info.get("bbox", {})

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

                    # Draw overlays on processed frames
                    processed_frame = self._draw_overlays(
                        frame.copy(),
                        tracked_horses,
                        frame_poses
                    )
                    # Store tracking/pose data to reuse overlays on skipped frames
                    last_tracked_horses = tracked_horses
                    last_frame_poses = frame_poses
                else:
                    # For skipped frames: use current raw frame but draw last overlays
                    # This shows fresh video content with consistent overlays until next processed frame
                    if last_tracked_horses or last_frame_poses:
                        processed_frame = self._draw_overlays(
                            frame.copy(),
                            last_tracked_horses,
                            last_frame_poses
                        )
                    else:
                        # If no processed frame yet, use raw frame
                        processed_frame = frame.copy()

                # Save frame as PNG for FFmpeg (all frames for continuous video)
                frame_path = temp_frames_dir / f"frame_{frame_idx:04d}.png"
                cv2.imwrite(str(frame_path), processed_frame)
                processed_frames.append(frame_path)

                # Save frame results ONLY for processed frames (to reduce data size)
                if should_process:
                    frame_result = {
                        "frame_index": frame_idx,
                        "timestamp": frame_timestamp,
                        "detections": detections,
                        "tracked_horses": tracked_horses,
                        "poses": frame_poses,
                        "processed": True
                    }
                    frame_results.append(frame_result)

                # Update progress in Redis on EVERY frame for smoothest progress bar
                # Redis writes are extremely fast (<1ms) so this has no performance impact
                if True:  # Update every single frame
                    if self.horse_db.redis_client:
                        try:
                            progress_key = f"chunk:{chunk_id}:progress"
                            # Progress based on total frames read, not just processed
                            progress_value = f"{frame_idx + 1}/{total_frames}"
                            self.horse_db.redis_client.setex(
                                progress_key,
                                3600,  # 1 hour TTL
                                progress_value
                            )
                            if frame_idx % 30 == 0:  # Log every 30 frames to reduce noise
                                logger.info(f"📊 Redis progress update: {progress_key} = {progress_value} (interval={frame_interval})")
                        except Exception as redis_error:
                            logger.debug(f"Failed to update progress in Redis: {redis_error}")

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

            # PHASE 3 INTEGRATION: Save all horses to registry after chunk complete
            logger.info(f"Saving horses to registry for stream {stream_id}")
            all_horse_states = self.horse_tracker.get_all_horse_states()

            # Extract thumbnails for each horse
            for horse_id, horse_state in all_horse_states.items():
                thumbnail_bytes = self.horse_tracker.get_best_thumbnail(horse_id, quality=80)
                if thumbnail_bytes:
                    horse_state["thumbnail_bytes"] = thumbnail_bytes
                    logger.debug(f"Extracted thumbnail for {horse_id}: {len(thumbnail_bytes)} bytes")

            await self.horse_db.save_stream_horse_registry(stream_id, all_horse_states)
            logger.info(f"Saved {len(all_horse_states)} horses to registry")

            # Notify API Gateway about detected horses for WebSocket emission
            await self._notify_horses_detected(stream_id, all_horse_states)

            # Generate processing result
            processing_time = (time.time() - start_time) * 1000

            # Save detections JSON
            detections_data = {
                "video_metadata": {
                    "fps": fps,
                    "duration": total_frames / fps if fps > 0 else 0,
                    "resolution": f"{width}x{height}",
                    "total_frames": total_frames,
                    "frame_interval": frame_interval
                },
                "summary": {
                    "total_horses": self._count_unique_horses(frame_results),
                    "total_detections": total_detections,
                    "frames_analyzed": len(frame_results),
                    "total_frames": total_frames,
                    "frame_interval": frame_interval,
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

            # Mark progress as complete and cleanup after short delay
            if self.horse_db.redis_client:
                try:
                    self.horse_db.redis_client.setex(
                        f"chunk:{chunk_id}:progress",
                        10,  # Keep for 10 seconds then auto-delete
                        f"{total_frames}/{total_frames}"
                    )
                except Exception as redis_error:
                    logger.warning(f"Failed to mark progress complete in Redis: {redis_error}")

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

            # Cleanup progress tracking on error
            if self.horse_db.redis_client:
                try:
                    self.horse_db.redis_client.delete(f"chunk:{chunk_id}:progress")
                except Exception as redis_error:
                    logger.warning(f"Failed to cleanup progress in Redis: {redis_error}")

            return {
                "chunk_id": chunk_id,
                "stream_id": chunk_metadata.get("stream_id"),
                "status": "failed",
                "error": str(error),
                "processing_time_ms": processing_time,
                "processed_at": time.time()
            }

    # AP10K skeleton connections for horse pose visualization
    POSE_SKELETON = [
        (0, 1), (0, 2), (1, 2),  # Eyes and nose
        (2, 3), (3, 5), (3, 8),  # Nose to neck to shoulders
        (5, 6), (6, 7),  # Left front leg
        (8, 9), (9, 10),  # Right front leg
        (3, 4), (4, 11), (4, 14),  # Neck to tail to hips
        (11, 12), (12, 13),  # Left back leg
        (14, 15), (15, 16)  # Right back leg
    ]

    def _draw_overlays(
        self,
        frame: np.ndarray,
        tracked_horses: List[Dict],
        frame_poses: List[Dict]
    ) -> np.ndarray:
        """Draw detection, tracking, and pose overlays on frame."""

        # Create overlay map for poses
        pose_map = {pose["horse_id"]: pose for pose in frame_poses}

        # Draw each tracked horse
        for track in tracked_horses:
            horse_id = str(track.get("tracking_id", "unknown"))
            bbox = track.get("bbox", {})
            color = track.get("color", [255, 255, 255])

            # Convert hex color to BGR tuple if needed
            if isinstance(color, str) and color.startswith("#"):
                # Convert hex to BGR (OpenCV uses BGR, not RGB)
                hex_color = color.lstrip("#")
                r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
                color = (b, g, r)  # BGR order for OpenCV
            elif isinstance(color, list) and len(color) == 3:
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

            # Draw pose skeleton and keypoints if available
            if horse_id in pose_map:
                pose = pose_map[horse_id]
                keypoints = pose["pose"].get("keypoints", [])

                if keypoints and len(keypoints) > 0:
                    # First, draw skeleton connections
                    for (start_idx, end_idx) in self.POSE_SKELETON:
                        if start_idx < len(keypoints) and end_idx < len(keypoints):
                            start_kp = keypoints[start_idx]
                            end_kp = keypoints[end_idx]

                            if (isinstance(start_kp, dict) and 'x' in start_kp and 'y' in start_kp and
                                isinstance(end_kp, dict) and 'x' in end_kp and 'y' in end_kp):

                                start_x, start_y = int(start_kp['x']), int(start_kp['y'])
                                end_x, end_y = int(end_kp['x']), int(end_kp['y'])

                                # Only draw if both keypoints are valid
                                if (start_x > 0 and start_y > 0 and end_x > 0 and end_y > 0 and
                                    start_kp.get('confidence', 0) > 0.3 and end_kp.get('confidence', 0) > 0.3):
                                    # Draw line in horse's color
                                    cv2.line(frame, (start_x, start_y), (end_x, end_y), color, 2)

                    # Then, draw keypoints on top
                    for i, kp in enumerate(keypoints):
                        # Keypoints are dicts with 'x', 'y', 'confidence' keys
                        if isinstance(kp, dict) and 'x' in kp and 'y' in kp:
                            x, y = int(kp['x']), int(kp['y'])
                            if x > 0 and y > 0 and kp.get('confidence', 0) > 0.3:  # Valid keypoint
                                # Use horse's color for keypoints
                                cv2.circle(frame, (x, y), 4, color, -1)
                                cv2.circle(frame, (x, y), 4, (255, 255, 255), 1)

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
                        "first_frame": frame_idx,
                        "last_frame": frame_idx
                    }
                else:
                    # Update last frame
                    horse_data[horse_id]["last_frame"] = frame_idx

                horse_data[horse_id]["total_detections"] += 1
                horse_data[horse_id]["confidences"].append(track.get("confidence", 0.0))

        # Calculate averages and format output
        horse_summaries = []
        for horse_id, data in horse_data.items():
            avg_confidence = sum(data["confidences"]) / len(data["confidences"]) if data["confidences"] else 0.0

            horse_summaries.append({
                "id": horse_id,
                "color": data["color"],
                "first_detected_frame": data["first_frame"],
                "last_detected_frame": data["last_frame"],
                "total_detections": data["total_detections"],
                "avg_confidence": round(avg_confidence, 3)
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

    async def _save_horse_to_database(self, track_info: Dict, timestamp: float) -> None:
        """Save horse data to database."""
        try:
            horse_data = {
                "stream_id": self.current_stream_id or "default",
                "horse_id": str(track_info.get("tracking_id", "unknown")),
                "timestamp": timestamp,
                "bbox": track_info.get("bbox", {}),
                "confidence": track_info.get("confidence", 0.0),
                "features": track_info.get("features", []).tolist() if hasattr(track_info.get("features", []), "tolist") else [],
                "total_detections": track_info.get("total_detections", 0)
            }

            await self.horse_db.save_horse(horse_data)

        except Exception as e:
            logger.debug(f"Failed to save horse data: {e}")

    def _update_stats(self, processing_time: float, fps: float,
                      detections: int, tracks: int) -> None:
        """Update processing statistics."""
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

    async def _notify_horses_detected(self, stream_id: str, horse_states: Dict[str, Any]) -> None:
        """Notify API Gateway about detected horses for WebSocket emission.

        Args:
            stream_id: Stream ID
            horse_states: Dictionary of horse states from tracker
        """
        try:
            # Prepare horse data for WebSocket event
            horses_data = []
            for horse_id, state in horse_states.items():
                horses_data.append({
                    "id": state.get("id", horse_id),
                    "tracking_id": state.get("tracking_id", horse_id),
                    "assigned_color": state.get("color", "#06B6D4"),
                    "confidence_score": state.get("confidence", 0.0),
                    "first_detected": state.get("first_seen"),
                    "last_seen": state.get("last_seen"),
                    "total_detections": state.get("detection_count", 0),
                })

            # Send HTTP POST to API Gateway webhook endpoint
            async with httpx.AsyncClient(timeout=5.0) as client:
                webhook_url = f"{settings.api_gateway_url}/api/internal/webhooks/horses-detected"
                response = await client.post(
                    webhook_url,
                    json={"streamId": stream_id, "horses": horses_data}
                )

                if response.status_code == 200:
                    logger.debug(f"Notified API Gateway about {len(horses_data)} horses for stream {stream_id}")
                else:
                    logger.warning(f"API Gateway webhook returned status {response.status_code}")

        except httpx.TimeoutException:
            logger.warning(f"Timeout notifying API Gateway about horses for stream {stream_id}")
        except Exception as error:
            logger.error(f"Failed to notify API Gateway about horses: {error}")

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