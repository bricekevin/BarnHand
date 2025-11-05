"""ML processing service for horse detection, pose analysis, and tracking."""
import asyncio
import time
import uuid
import json
import subprocess
import shutil
from datetime import datetime
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
from .frame_renderer import FrameRenderer


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

        # Frame rendering (shared with reprocessor)
        self.frame_renderer = FrameRenderer()

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

    # ============================================================================
    # OFFICIAL HORSES WORKFLOW - Helper Methods
    # ============================================================================

    def _calculate_quality_score(self, confidence: float, bbox: Dict[str, float], crop: np.ndarray) -> float:
        """
        Calculate composite quality score for a detection.

        Factors:
        - Detection confidence (40%): YOLO confidence score
        - Sharpness (30%): Laplacian variance
        - Size (20%): Bbox area normalized by image size
        - Aspect ratio (10%): Closeness to ideal horse aspect ratio

        Args:
            confidence: YOLO detection confidence (0.0-1.0)
            bbox: Bounding box {x, y, width, height}
            crop: Cropped horse image (numpy array)

        Returns:
            Quality score (0.0-1.0)
        """
        try:
            import cv2

            # 1. Detection confidence (0-1)
            conf_score = confidence

            # 2. Bbox size (normalize by typical image size)
            bbox_area = bbox.get("width", 0) * bbox.get("height", 0)
            # Assume typical image size of 1920x1080
            size_score = min(bbox_area / (1920 * 1080) * 100, 1.0)

            # 3. Image sharpness (Laplacian variance)
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            # 500 is considered good sharpness
            sharpness_score = min(laplacian_var / 500.0, 1.0)

            # 4. Aspect ratio (horses typically 1.3-1.7 width/height)
            width = bbox.get("width", 1)
            height = bbox.get("height", 1)
            aspect = width / max(height, 1)
            ideal_aspect = 1.5
            aspect_diff = abs(aspect - ideal_aspect) / ideal_aspect
            aspect_score = max(0.0, 1.0 - aspect_diff)

            # Weighted combination
            quality = (
                conf_score * 0.4 +
                sharpness_score * 0.3 +
                size_score * 0.2 +
                aspect_score * 0.1
            )

            return max(0.0, min(1.0, quality))

        except Exception as error:
            logger.error(f"Failed to calculate quality score: {error}")
            return confidence  # Fallback to just confidence

    def _calculate_iou(self, bbox1: Dict[str, float], bbox2: Dict[str, float]) -> float:
        """
        Calculate Intersection over Union (IoU) between two bounding boxes.

        Args:
            bbox1, bbox2: Bounding boxes {x, y, width, height}

        Returns:
            IoU score (0.0-1.0)
        """
        try:
            # Extract coordinates
            x1, y1, w1, h1 = bbox1["x"], bbox1["y"], bbox1["width"], bbox1["height"]
            x2, y2, w2, h2 = bbox2["x"], bbox2["y"], bbox2["width"], bbox2["height"]

            # Calculate intersection
            x_left = max(x1, x2)
            y_top = max(y1, y2)
            x_right = min(x1 + w1, x2 + w2)
            y_bottom = min(y1 + h1, y2 + h2)

            if x_right < x_left or y_bottom < y_top:
                return 0.0

            intersection = (x_right - x_left) * (y_bottom - y_top)

            # Calculate union
            area1 = w1 * h1
            area2 = w2 * h2
            union = area1 + area2 - intersection

            if union == 0:
                return 0.0

            return intersection / union

        except Exception as error:
            logger.error(f"Failed to calculate IoU: {error}")
            return 0.0

    def _match_to_chunk_tracks(
        self,
        bbox: Dict[str, float],
        chunk_tracks: Dict[int, Dict[str, Any]],
        iou_threshold: float = 0.3
    ) -> Optional[int]:
        """
        Match a detection to existing tracks in the chunk using IoU.

        Args:
            bbox: Detection bounding box
            chunk_tracks: Current tracks in this chunk
            iou_threshold: Minimum IoU to consider a match

        Returns:
            Matched track_id or None
        """
        best_iou = 0.0
        best_track_id = None

        for track_id, track_data in chunk_tracks.items():
            # Get last bbox from this track
            if not track_data["frames"]:
                continue

            last_frame = track_data["frames"][-1]
            last_bbox = last_frame["bbox"]

            iou = self._calculate_iou(bbox, last_bbox)

            if iou >= iou_threshold and iou > best_iou:
                best_iou = iou
                best_track_id = track_id

        return best_track_id

    def _aggregate_track_features(self, track_data: Dict[str, Any]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Get best quality frame from track for ReID matching and thumbnail.

        Args:
            track_data: Track data with frames list

        Returns:
            (features, crop_image) tuple
        """
        frames = track_data["frames"]

        if not frames:
            raise ValueError("Track has no frames")

        # Find frame with highest quality score
        best_frame = max(frames, key=lambda f: f["quality_score"])
        track_data["best_quality_frame_idx"] = best_frame["frame_idx"]

        logger.debug(
            f"Track {track_data['track_id']}: Using frame {best_frame['frame_idx']} "
            f"(quality: {best_frame['quality_score']:.2f}) out of {len(frames)} frames"
        )

        # Return features and crop for thumbnail
        return best_frame["features"], best_frame["crop"]

    def _match_to_official_horses(
        self,
        features: np.ndarray,
        official_horses: Dict[str, Dict[str, Any]],
        noise_threshold: float = 0.3
    ) -> Optional[Dict[str, Any]]:
        """
        Match aggregated features to official horses using closest-match strategy.

        Strategy:
        - Find CLOSEST official horse (highest cosine similarity)
        - Only reject if ALL similarities below noise_threshold (likely YOLO error)

        Args:
            features: Feature vector from detection
            official_horses: Dict of official horses
            noise_threshold: Minimum similarity to filter noise (default: 0.3)

        Returns:
            Best match dict {official_id, tracking_id, similarity} or None
        """
        best_match = None
        best_similarity = 0.0

        for official_id, official_data in official_horses.items():
            official_features = official_data.get("feature_vector")
            if official_features is None or len(official_features) == 0:
                continue

            # Ensure both are numpy arrays
            if not isinstance(official_features, np.ndarray):
                official_features = np.array(official_features)

            # Cosine similarity
            try:
                similarity = np.dot(features, official_features) / (
                    np.linalg.norm(features) * np.linalg.norm(official_features)
                )
            except Exception as e:
                logger.error(f"Failed to calculate similarity: {e}")
                continue

            if similarity > best_similarity:
                best_match = {
                    "official_id": official_id,
                    "tracking_id": official_data["tracking_id"],
                    "similarity": float(similarity)
                }
                best_similarity = similarity

        # Only reject if best match is below noise threshold
        if best_match and best_similarity >= noise_threshold:
            return best_match
        else:
            logger.debug(f"⚠️ Detection rejected as noise (best sim: {best_similarity:.2f} < {noise_threshold})")
            return None

    # ============================================================================
    # END OFFICIAL HORSES WORKFLOW - Helper Methods
    # ============================================================================

    async def process_chunk_with_official_tracking(
        self,
        chunk_path: str,
        chunk_metadata: Dict[str, Any],
        official_horses: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Process chunk with official-only tracking (no guest horses).

        This method:
        1. Processes all frames, accumulating detections into tracks
        2. Calculates quality scores for each detection
        3. At end of chunk: aggregates best features from each track
        4. Matches tracks to official horses (closest match wins)
        5. Saves thumbnails for matched horses
        6. Ignores unmatched detections (noise/false positives)

        Args:
            chunk_path: Path to video chunk
            chunk_metadata: Chunk metadata (stream_id, start_time, etc.)
            official_horses: Dict of official horses for this barn

        Returns:
            Processing results with matched horses only
        """
        import cv2

        start_time = time.time()
        chunk_id = chunk_metadata.get("chunk_id", str(uuid.uuid4()))
        stream_id = chunk_metadata.get("stream_id", "default")

        logger.info(f"🐴 Processing chunk with official-only tracking: {chunk_id}")
        logger.info(f"🐴 Tracking against {len(official_horses)} official horses")

        try:
            # Open video
            cap = cv2.VideoCapture(chunk_path)
            if not cap.isOpened():
                raise ValueError(f"Failed to open video: {chunk_path}")

            fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            # Initialize chunk-level tracking
            chunk_tracks = {}  # {track_id: TrackData}
            next_track_id = 1
            frame_idx = 0

            logger.info(f"📹 Video: {width}x{height} @ {fps}fps, {total_frames} frames")

            # Process frames
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                timestamp = chunk_metadata.get("start_time", 0) + (frame_idx / fps)

                # YOLO detection
                detections, _ = self.detection_model.detect_horses(frame)

                # Process each detection
                for det in detections:
                    bbox = det["bbox"]
                    confidence = det["confidence"]

                    # Extract crop and features
                    x, y, w, h = int(bbox["x"]), int(bbox["y"]), int(bbox["width"]), int(bbox["height"])
                    crop = frame[y:y+h, x:x+w]

                    if crop.size == 0:
                        continue

                    # Keep copy for thumbnail
                    crop_copy = crop.copy()

                    # Extract ReID features
                    from .horse_reid import HorseReIDModel
                    if not hasattr(self, 'reid_model'):
                        self.reid_model = HorseReIDModel()
                        self.reid_model.load_model()

                    features = self.reid_model.extract_features(crop)

                    # Calculate quality score
                    quality_score = self._calculate_quality_score(confidence, bbox, crop)

                    # Match to existing tracks in chunk (IoU-based)
                    matched_track_id = self._match_to_chunk_tracks(bbox, chunk_tracks, iou_threshold=0.3)

                    if matched_track_id:
                        # Add to existing track
                        chunk_tracks[matched_track_id]["frames"].append({
                            "frame_idx": frame_idx,
                            "timestamp": timestamp,
                            "bbox": bbox,
                            "confidence": confidence,
                            "features": features,
                            "quality_score": quality_score,
                            "crop": crop_copy
                        })
                    else:
                        # Create new track for this chunk
                        chunk_tracks[next_track_id] = {
                            "track_id": next_track_id,
                            "frames": [{
                                "frame_idx": frame_idx,
                                "timestamp": timestamp,
                                "bbox": bbox,
                                "confidence": confidence,
                                "features": features,
                                "quality_score": quality_score,
                                "crop": crop_copy
                            }],
                            "official_horse_id": None,
                            "best_quality_frame_idx": None
                        }
                        next_track_id += 1

                frame_idx += 1

            cap.release()

            logger.info(f"✅ Processed {frame_idx} frames, found {len(chunk_tracks)} tracks")

            # END OF CHUNK: Aggregate features and match to official horses
            matched_results = []
            ignored_tracks = 0

            for track_id, track_data in chunk_tracks.items():
                try:
                    # Get best quality features and thumbnail from this track
                    aggregated_features, thumbnail_crop = self._aggregate_track_features(track_data)

                    # Match against official horses (closest match wins)
                    best_match = self._match_to_official_horses(
                        aggregated_features,
                        official_horses,
                        noise_threshold=0.3
                    )

                    if best_match:
                        # Found official horse match
                        official_id = best_match["official_id"]
                        tracking_id = best_match["tracking_id"]
                        similarity = best_match["similarity"]

                        logger.info(f"✓ Track {track_id} → {tracking_id} (sim: {similarity:.2f})")

                        track_data["official_horse_id"] = official_id
                        track_data["tracking_id"] = tracking_id
                        track_data["similarity"] = similarity
                        track_data["thumbnail"] = thumbnail_crop
                        matched_results.append(track_data)

                        # Save thumbnail for this chunk
                        best_frame = track_data["frames"][track_data["best_quality_frame_idx"]]
                        await self.horse_db.save_chunk_thumbnail(
                            official_id,
                            chunk_id,
                            thumbnail_crop,
                            best_frame["quality_score"],
                            best_frame["timestamp"]
                        )

                    else:
                        # No match - ignore this track (likely noise)
                        ignored_tracks += 1
                        logger.debug(f"✗ Track {track_id} ignored (noise/no match)")

                except Exception as e:
                    logger.error(f"Failed to process track {track_id}: {e}")
                    ignored_tracks += 1
                    continue

            # Build response
            processing_time = time.time() - start_time

            logger.info(f"🎯 Chunk {chunk_id} complete: {len(matched_results)} horses matched, {ignored_tracks} tracks ignored")
            logger.info(f"⏱️ Processing time: {processing_time:.2f}s ({total_frames/processing_time:.1f} fps)")

            return {
                "chunk_id": chunk_id,
                "stream_id": stream_id,
                "matched_horses": len(matched_results),
                "ignored_tracks": ignored_tracks,
                "total_frames": frame_idx,
                "processing_time": processing_time,
                "horses": [
                    {
                        "tracking_id": r["tracking_id"],
                        "official_horse_id": r["official_horse_id"],
                        "similarity": r["similarity"],
                        "detections": len(r["frames"]),
                        "best_quality": r["frames"][r["best_quality_frame_idx"]]["quality_score"]
                    }
                    for r in matched_results
                ]
            }

        except Exception as error:
            logger.error(f"Failed to process chunk with official tracking: {error}")
            import traceback
            traceback.print_exc()
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

        # ============================================================================
        # OFFICIAL HORSES WORKFLOW - Mode Detection and Routing
        # ============================================================================

        # Check if barn has official horses configured
        try:
            # Get farm_id for this stream
            farm_id = await self.horse_db._get_farm_id_from_stream(self.current_stream_id)

            if farm_id:
                # Check if official horses exist for this barn
                chunk_timestamp = chunk_metadata.get("start_time", time.time())
                official_horses = await self.horse_db.load_official_horses_at_time(farm_id, chunk_timestamp)

                if official_horses:
                    # OFFICIAL TRACKING MODE: Use official-only tracking
                    logger.info(f"🔵 Mode: OFFICIAL TRACKING ({len(official_horses)} official horses)")
                    return await self.process_chunk_with_official_tracking(
                        chunk_path,
                        chunk_metadata,
                        official_horses
                    )
                else:
                    # DISCOVERY MODE: No official horses yet, use existing workflow
                    logger.info(f"🟢 Mode: DISCOVERY (no official horses configured)")
            else:
                logger.info(f"🟢 Mode: DISCOVERY (no farm_id)")

        except Exception as e:
            logger.warning(f"Failed to check official horses, falling back to discovery mode: {e}")

        # ============================================================================
        # DISCOVERY MODE - Existing Workflow
        # ============================================================================

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

        # Performance timing breakdown
        timings = {
            "db_load": 0,
            "tracker_init": 0,
            "video_load": 0,
            "frame_read": 0,
            "yolo_detection": 0,
            "tracking_update": 0,
            "reid_extraction": 0,
            "pose_estimation": 0,
            "overlay_drawing": 0,
            "frame_writing": 0,
            "video_assembly": 0,
            "json_export": 0,
            "db_save": 0,
            "total": 0
        }

        logger.info(f"⏱️ PERFORMANCE PROFILING: Processing chunk with video output: {chunk_path}",
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

            # BARN-SCOPED RE-ID: Load horses from ALL streams in the same barn/farm
            # This enables cross-stream horse re-identification within a barn
            db_start = time.time()
            logger.info(f"🐴 Loading known horses for stream {stream_id} (barn-scoped Re-ID)")
            known_horses = await self.horse_db.load_barn_horse_registry(stream_id)
            timings["db_load"] = (time.time() - db_start) * 1000
            logger.info(f"🐴 Loaded {len(known_horses)} known horses from barn registry for stream {stream_id} in {timings['db_load']:.1f}ms")

            # Log which streams contributed horses
            if known_horses:
                stream_sources = {}
                for horse_id, horse_state in known_horses.items():
                    source_stream = horse_state.get("stream_id", "unknown")
                    stream_sources[source_stream] = stream_sources.get(source_stream, 0) + 1
                logger.info(f"🐴 Horse sources by stream: {stream_sources}")

            # ============================================================================
            # OFFICIAL HORSES WORKFLOW - Mode Detection
            # ============================================================================

            # Initialize official_count to avoid UnboundLocalError
            official_count = 0

            # Check if barn has reached capacity with official horses
            try:
                farm_id = await self.horse_db._get_farm_id_from_stream(stream_id)

                if farm_id and known_horses:
                    # Get expected horse count for this barn
                    conn = self.horse_db.pool.getconn()
                    try:
                        cursor = conn.cursor()
                        cursor.execute("SELECT expected_horse_count FROM farms WHERE id = %s", (farm_id,))
                        result = cursor.fetchone()
                        expected_horse_count = result[0] if result else 0
                    finally:
                        self.horse_db.pool.putconn(conn)

                    # Count official horses
                    official_horses = {
                        h_id: h for h_id, h in known_horses.items()
                        if h.get("is_official") == True
                    }
                    official_count = len(official_horses)

                    # Determine mode: If we have ANY official horses, use official-only mode
                    if official_count > 0:
                        # OFFICIAL TRACKING MODE: We have official horses, only match to them
                        logger.info(f"🔵 Mode: OFFICIAL TRACKING ({official_count} official horses defined)")
                        if expected_horse_count > 0:
                            logger.info(f"🔵 Expected capacity: {expected_horse_count} horses")
                        logger.info(f"🔵 Filtering known horses to {official_count} official horses only")
                        known_horses = official_horses
                    else:
                        # DISCOVERY MODE: No official horses defined yet
                        logger.info(f"🟢 Mode: DISCOVERY (no official horses defined - accepting new horses)")

            except Exception as e:
                logger.warning(f"Failed to check barn capacity, using unrestricted mode: {e}")

            # ============================================================================
            # END OFFICIAL HORSES WORKFLOW - Mode Detection
            # ============================================================================

            # Initialize tracker with stream_id and barn-level known horses
            # Re-ID will match against horses from ALL streams in this barn (or just official if capacity reached)
            tracker_start = time.time()

            # Determine if we should allow new horse creation
            # If we have ANY official horses, force-match to them (no new guests)
            if official_count > 0:
                allow_new_horses = False
                logger.info(f"🔵 New horse creation DISABLED (official tracking mode)")
            else:
                allow_new_horses = True
                logger.info(f"🟢 New horse creation ENABLED (discovery mode)")

            self.horse_tracker = HorseTracker(
                similarity_threshold=0.7,
                max_lost_frames=30,
                stream_id=stream_id,
                known_horses=known_horses,
                allow_new_horses=allow_new_horses
            )
            await self.horse_tracker.initialize()
            timings["tracker_init"] = (time.time() - tracker_start) * 1000
            logger.info(f"⏱️ Tracker initialized in {timings['tracker_init']:.1f}ms")

            # Load video chunk
            video_start = time.time()
            cap = cv2.VideoCapture(chunk_path)
            if not cap.isOpened():
                raise ValueError(f"Failed to open video: {chunk_path}")

            # Get video properties
            fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            timings["video_load"] = (time.time() - video_start) * 1000

            logger.info(f"⏱️ Video loaded: {width}x{height} @ {fps}fps, {total_frames} frames in {timings['video_load']:.1f}ms")

            # Create output directories
            Path(output_video_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_json_path).parent.mkdir(parents=True, exist_ok=True)

            # Create frames directory for frame inspector (persistent storage)
            # Save frames next to the detections JSON file (in detections directory)
            detections_dir = Path(output_json_path).parent
            chunk_detections_dir = detections_dir / Path(output_json_path).stem  # e.g., chunk_xxx_detections
            frames_output_dir = chunk_detections_dir / "frames"
            frames_output_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Saving processed frames to: {frames_output_dir}")

            # Create temporary directory for FFmpeg video assembly
            temp_frames_dir = Path(f"/tmp/chunk_processing_{chunk_id}")
            temp_frames_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Temporary frames for video assembly: {temp_frames_dir}")

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
                read_start = time.time()
                ret, frame = cap.read()
                if not ret:
                    break
                timings["frame_read"] += (time.time() - read_start) * 1000

                # Check if this frame should be processed based on interval
                should_process = (frame_idx % frame_interval == 0)

                frame_timestamp = chunk_metadata.get("start_time", 0) + (frame_idx / fps)

                if should_process:
                    # Step 1: Detect horses
                    yolo_start = time.time()
                    detections, _ = self.detection_model.detect_horses(frame)
                    timings["yolo_detection"] += (time.time() - yolo_start) * 1000
                    total_detections += len(detections)

                    # Step 2: Update tracking (includes ReID feature extraction)
                    tracking_start = time.time()
                    tracked_horses = self.horse_tracker.update_tracks(detections, frame, frame_timestamp)
                    timings["tracking_update"] += (time.time() - tracking_start) * 1000
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
                        # Use global ID, not numeric counter
                        horse_id = str(track_info.get("id", "unknown"))
                        bbox = track_info.get("bbox", {})

                        if bbox and bbox.get("width", 0) > 0 and bbox.get("height", 0) > 0:
                            valid_tracks.append(track_info)
                            valid_bboxes.append(bbox)

                    # Batch pose estimation for all horses at once
                    if valid_bboxes:
                        try:
                            pose_start = time.time()
                            batch_pose_results = self.pose_model.estimate_pose_batch(frame, valid_bboxes)
                            timings["pose_estimation"] += (time.time() - pose_start) * 1000

                            # Process batch results
                            for track_info, (pose_result, pose_time) in zip(valid_tracks, batch_pose_results):
                                # Use global ID, not numeric counter
                                horse_id = str(track_info.get("id", "unknown"))
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
                                # Use global ID, not numeric counter
                                horse_id = str(track_info.get("id", "unknown"))
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
                    overlay_start = time.time()
                    processed_frame = self._draw_overlays(
                        frame.copy(),
                        tracked_horses,
                        frame_poses
                    )
                    timings["overlay_drawing"] += (time.time() - overlay_start) * 1000
                    # Store tracking/pose data to reuse overlays on skipped frames
                    last_tracked_horses = tracked_horses
                    last_frame_poses = frame_poses
                else:
                    # For skipped frames: use current raw frame but draw last overlays
                    # This shows fresh video content with consistent overlays until next processed frame
                    if last_tracked_horses or last_frame_poses:
                        overlay_start = time.time()
                        processed_frame = self._draw_overlays(
                            frame.copy(),
                            last_tracked_horses,
                            last_frame_poses
                        )
                        timings["overlay_drawing"] += (time.time() - overlay_start) * 1000
                    else:
                        # If no processed frame yet, use raw frame
                        processed_frame = frame.copy()

                # Save frame as PNG for FFmpeg (all frames for continuous video)
                write_start = time.time()
                frame_path = temp_frames_dir / f"frame_{frame_idx:04d}.png"
                cv2.imwrite(str(frame_path), processed_frame)
                timings["frame_writing"] += (time.time() - write_start) * 1000
                processed_frames.append(frame_path)

                # Save frame results ONLY for processed frames (to reduce data size)
                if should_process:
                    # Save processed frame to persistent storage for frame inspector
                    persistent_frame_path = frames_output_dir / f"frame_{frame_idx:04d}.jpg"
                    cv2.imwrite(str(persistent_frame_path), processed_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

                    # Enhanced frame metadata for frame-by-frame inspector
                    frame_result = {
                        "frame_index": frame_idx,
                        "timestamp": frame_timestamp,
                        "detections": detections,
                        "tracked_horses": tracked_horses,
                        "poses": frame_poses,
                        "processed": True,
                        "frame_path": f"frame_{frame_idx:04d}.jpg",  # Just filename, API route includes /frames/
                        "ml_settings": {
                            "model": "YOLO11",  # Primary model
                            "confidence_threshold": 0.5,
                            "frame_interval": frame_interval,
                            "allow_new_horses": allow_new_horses,
                            "mode": "official" if not allow_new_horses else "discovery"
                        },
                        "reid_details": {
                            "similarity_threshold": 0.7,
                            "known_horses_count": len(known_horses) if known_horses else 0
                        }
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
            ffmpeg_start = time.time()
            logger.info(f"Creating video with FFmpeg from {len(processed_frames)} frames...")
            self._create_video_with_ffmpeg(temp_frames_dir, output_video_path, fps)
            timings["video_assembly"] = (time.time() - ffmpeg_start) * 1000
            logger.info(f"⏱️ FFmpeg video assembly: {timings['video_assembly']:.1f}ms")

            # Cleanup temporary frames
            logger.info(f"Cleaning up temporary frames directory: {temp_frames_dir}")
            shutil.rmtree(temp_frames_dir, ignore_errors=True)

            # PHASE 3 INTEGRATION: Save all horses to registry after chunk complete
            db_save_start = time.time()
            logger.info(f"Saving horses to registry for stream {stream_id}")
            all_horse_states = self.horse_tracker.get_all_horse_states()

            # Extract thumbnails for each horse
            for horse_id, horse_state in all_horse_states.items():
                thumbnail_bytes = self.horse_tracker.get_best_thumbnail(horse_id, quality=80)
                if thumbnail_bytes:
                    horse_state["thumbnail_bytes"] = thumbnail_bytes
                    logger.debug(f"Extracted thumbnail for {horse_id}: {len(thumbnail_bytes)} bytes")

            await self.horse_db.save_stream_horse_registry(stream_id, all_horse_states)
            timings["db_save"] = (time.time() - db_save_start) * 1000
            logger.info(f"⏱️ Saved {len(all_horse_states)} horses to registry in {timings['db_save']:.1f}ms")

            # Notify API Gateway about detected horses for WebSocket emission
            await self._notify_horses_detected(stream_id, all_horse_states)

            # Generate processing result
            processing_time = (time.time() - start_time) * 1000

            # Save detections JSON
            json_start = time.time()
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
                "frames": frame_results,
                "performance_timing": timings
            }
            timings["json_export"] = (time.time() - json_start) * 1000

            with open(output_json_path, 'w') as f:
                json.dump(detections_data, f, indent=2, default=str)

            # Calculate final timings
            timings["total"] = processing_time

            # Log comprehensive performance breakdown
            logger.info(f"⏱️ ========== PERFORMANCE BREAKDOWN ==========")
            logger.info(f"⏱️ Total processing time: {timings['total']:.1f}ms ({timings['total']/1000:.2f}s)")
            logger.info(f"⏱️ ")
            logger.info(f"⏱️ Setup & Initialization:")
            logger.info(f"⏱️   DB Load (known horses):  {timings['db_load']:>8.1f}ms ({timings['db_load']/timings['total']*100:>5.1f}%)")
            logger.info(f"⏱️   Tracker Init (ReID):     {timings['tracker_init']:>8.1f}ms ({timings['tracker_init']/timings['total']*100:>5.1f}%)")
            logger.info(f"⏱️   Video Load:              {timings['video_load']:>8.1f}ms ({timings['video_load']/timings['total']*100:>5.1f}%)")
            logger.info(f"⏱️ ")
            logger.info(f"⏱️ Per-Frame Processing ({total_frames} total, {len(frames_to_process)} processed @ interval={frame_interval}):")
            logger.info(f"⏱️   Frame Reading:           {timings['frame_read']:>8.1f}ms ({timings['frame_read']/timings['total']*100:>5.1f}%) - {timings['frame_read']/total_frames:.2f}ms/frame")
            logger.info(f"⏱️   YOLO Detection:          {timings['yolo_detection']:>8.1f}ms ({timings['yolo_detection']/timings['total']*100:>5.1f}%) - {timings['yolo_detection']/len(frames_to_process) if len(frames_to_process) > 0 else 0:.2f}ms/processed-frame")
            logger.info(f"⏱️   Tracking Update (ReID):  {timings['tracking_update']:>8.1f}ms ({timings['tracking_update']/timings['total']*100:>5.1f}%) - {timings['tracking_update']/len(frames_to_process) if len(frames_to_process) > 0 else 0:.2f}ms/processed-frame")
            logger.info(f"⏱️   Pose Estimation (batch): {timings['pose_estimation']:>8.1f}ms ({timings['pose_estimation']/timings['total']*100:>5.1f}%) - {timings['pose_estimation']/len(frames_to_process) if len(frames_to_process) > 0 else 0:.2f}ms/processed-frame")
            logger.info(f"⏱️   Overlay Drawing:         {timings['overlay_drawing']:>8.1f}ms ({timings['overlay_drawing']/timings['total']*100:>5.1f}%) - {timings['overlay_drawing']/total_frames:.2f}ms/frame")
            logger.info(f"⏱️   Frame Writing (PNG):     {timings['frame_writing']:>8.1f}ms ({timings['frame_writing']/timings['total']*100:>5.1f}%) - {timings['frame_writing']/total_frames:.2f}ms/frame")
            logger.info(f"⏱️ ")
            logger.info(f"⏱️ Post-Processing:")
            logger.info(f"⏱️   FFmpeg Video Assembly:   {timings['video_assembly']:>8.1f}ms ({timings['video_assembly']/timings['total']*100:>5.1f}%)")
            logger.info(f"⏱️   JSON Export:             {timings['json_export']:>8.1f}ms ({timings['json_export']/timings['total']*100:>5.1f}%)")
            logger.info(f"⏱️   DB Save (horses):        {timings['db_save']:>8.1f}ms ({timings['db_save']/timings['total']*100:>5.1f}%)")
            logger.info(f"⏱️ ")
            logger.info(f"⏱️ Throughput:")
            logger.info(f"⏱️   Overall FPS: {total_frames / (timings['total']/1000):.1f} frames/sec")
            logger.info(f"⏱️   ML Processing FPS: {len(frames_to_process) / (timings['total']/1000) if timings['total'] > 0 else 0:.1f} processed-frames/sec")
            logger.info(f"⏱️ ============================================")

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

    def _draw_overlays(
        self,
        frame: np.ndarray,
        tracked_horses: List[Dict],
        frame_poses: List[Dict]
    ) -> np.ndarray:
        """
        Draw detection, tracking, and pose overlays on frame.
        Delegates to FrameRenderer for consistent overlay rendering.
        """
        return self.frame_renderer.draw_overlays(frame, tracked_horses, frame_poses)

    def _generate_horse_summary(self, frame_results: List[Dict]) -> List[Dict]:
        """Generate per-horse summary across all frames using global IDs."""
        horse_data = {}

        for frame_idx, frame_result in enumerate(frame_results):
            for track in frame_result["tracked_horses"]:
                # Use the global tracking ID (e.g., "1_horse_001"), not the numeric counter
                horse_id = str(track.get("id"))
                horse_name = track.get("horse_name")  # From ReID matching

                if horse_id not in horse_data:
                    horse_data[horse_id] = {
                        "id": horse_id,
                        "name": horse_name,  # Include horse name if available
                        "color": track.get("color", [255, 255, 255]),
                        "total_detections": 0,
                        "confidences": [],
                        "first_frame": frame_idx,
                        "last_frame": frame_idx,
                        "horse_type": track.get("horse_type", "guest"),
                        "is_official": track.get("is_official", False)
                    }
                else:
                    # Update last frame and name (in case it was updated mid-chunk)
                    horse_data[horse_id]["last_frame"] = frame_idx
                    if horse_name:
                        horse_data[horse_id]["name"] = horse_name

                horse_data[horse_id]["total_detections"] += 1
                horse_data[horse_id]["confidences"].append(track.get("confidence", 0.0))

        # Calculate averages and format output
        horse_summaries = []
        for horse_id, data in horse_data.items():
            avg_confidence = sum(data["confidences"]) / len(data["confidences"]) if data["confidences"] else 0.0

            horse_summaries.append({
                "id": horse_id,
                "name": data.get("name"),  # Include horse name
                "color": data["color"],
                "first_detected_frame": data["first_frame"],
                "last_detected_frame": data["last_frame"],
                "total_detections": data["total_detections"],
                "avg_confidence": round(avg_confidence, 3),
                "horse_type": data.get("horse_type", "guest"),
                "is_official": data.get("is_official", False)
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
                # Ensure timestamps are formatted as ISO strings
                last_seen = state.get("last_seen")
                if isinstance(last_seen, (int, float)):
                    last_seen = datetime.fromtimestamp(last_seen).isoformat()
                elif not last_seen:
                    # Required field - use current time if missing
                    last_seen = datetime.now().isoformat()

                first_detected = state.get("first_seen")
                if isinstance(first_detected, (int, float)):
                    first_detected = datetime.fromtimestamp(first_detected).isoformat()

                horses_data.append({
                    "id": state.get("id", horse_id),
                    "tracking_id": state.get("tracking_id", horse_id),
                    "assigned_color": state.get("color", "#06B6D4"),
                    "confidence_score": float(state.get("confidence", 0.0)),
                    "first_detected": first_detected,
                    "last_seen": last_seen,
                    "total_detections": int(state.get("detection_count", 0)),
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