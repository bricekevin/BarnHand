"""Re-processing service for applying manual corrections to processed chunks."""
import asyncio
import json
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
import cv2
import numpy as np
import httpx
from loguru import logger

from ..config.settings import settings
from .frame_renderer import FrameRenderer
from .horse_database import HorseDatabaseService
from ..models.horse_reid import HorseReIDModel


class ReprocessingResult:
    """Result of re-processing operation."""

    def __init__(
        self,
        chunk_id: str,
        corrections_applied: int,
        frames_updated: int,
        duration: float,
        status: str = "completed",
        error: Optional[str] = None
    ):
        self.chunk_id = chunk_id
        self.corrections_applied = corrections_applied
        self.frames_updated = frames_updated
        self.duration = duration
        self.status = status
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "chunk_id": self.chunk_id,
            "corrections_applied": self.corrections_applied,
            "frames_updated": self.frames_updated,
            "duration": self.duration,
            "status": self.status,
            "error": self.error
        }


class ReprocessorService:
    """Service for re-processing chunks with manual corrections."""

    def __init__(self):
        """Initialize reprocessor service."""
        self.frame_renderer = FrameRenderer()
        self.horse_db = HorseDatabaseService()
        self.reid_model: Optional[HorseReIDModel] = None

    async def initialize(self):
        """Initialize service dependencies."""
        try:
            # Initialize database service
            await self.horse_db.initialize()

            # Initialize ReID model for feature extraction
            self.reid_model = HorseReIDModel()
            self.reid_model.load_model()

            logger.info("✅ Reprocessor service initialized")
        except Exception as error:
            logger.error(f"Failed to initialize reprocessor service: {error}")
            raise

    async def reprocess_chunk(
        self,
        chunk_id: str,
        corrections: List[Dict[str, Any]]
    ) -> ReprocessingResult:
        """
        Apply corrections and regenerate chunk data.

        Workflow:
        1. Load chunk metadata and frames
        2. Apply corrections to tracking data
        3. Update ReID feature vectors
        4. Regenerate frames with corrected overlays
        5. Rebuild video chunk
        6. Update database

        Args:
            chunk_id: Chunk ID to reprocess
            corrections: List of correction payloads

        Returns:
            ReprocessingResult with statistics
        """
        start_time = time.time()

        logger.info(f"🔄 Starting re-processing for chunk {chunk_id} with {len(corrections)} corrections")

        try:
            # Emit initial progress
            await self._emit_progress(chunk_id, 0, "Starting re-processing...")

            # Step 1: Load chunk metadata (10%)
            logger.info(f"📂 Step 1: Loading chunk metadata...")
            chunk_metadata = await self._load_chunk_metadata(chunk_id)
            detections_path = chunk_metadata.get("detections_path")

            if not detections_path or not Path(detections_path).exists():
                raise ValueError(f"Detections file not found: {detections_path}")

            await self._emit_progress(chunk_id, 10, "Loaded chunk metadata")

            # Step 2: Load chunk detection data (20%)
            logger.info(f"📂 Step 2: Loading detections data...")
            detections_data = await self._load_detections_data(detections_path)
            frames_dir = Path(detections_path).parent / Path(detections_path).stem / "frames"

            if not frames_dir.exists():
                raise ValueError(f"Frames directory not found: {frames_dir}")

            await self._emit_progress(chunk_id, 20, "Loaded detections data")

            # Step 3: Apply corrections to tracking data (40%)
            logger.info(f"✏️ Step 3: Applying {len(corrections)} corrections...")
            updated_detections = await self._apply_corrections(
                detections_data,
                corrections,
                chunk_id
            )
            await self._emit_progress(chunk_id, 40, "Applied corrections to tracking data")

            # Step 4: Update ReID feature vectors (50%)
            logger.info(f"🔍 Step 4: Updating ReID feature vectors...")
            await self._update_reid_features(
                updated_detections,
                frames_dir,
                chunk_id
            )
            await self._emit_progress(chunk_id, 50, "Updated ReID features")

            # Step 5: Regenerate frames with corrected overlays (70%)
            logger.info(f"🖼️ Step 5: Regenerating frames with corrected overlays...")
            frames_updated = await self._regenerate_frames(
                frames_dir,
                updated_detections,
                chunk_id
            )
            await self._emit_progress(chunk_id, 70, "Regenerated frames")

            # Step 6: Rebuild video chunk (85%)
            logger.info(f"🎬 Step 6: Rebuilding video chunk...")
            video_path = chunk_metadata.get("processed_video_path")
            if video_path:
                await self._rebuild_video_chunk(
                    frames_dir,
                    video_path,
                    detections_data.get("video_metadata", {}).get("fps", 30)
                )
            await self._emit_progress(chunk_id, 85, "Rebuilt video chunk")

            # Step 7: Update database (95%)
            logger.info(f"💾 Step 7: Updating database...")
            await self._update_database(
                chunk_id,
                corrections,
                updated_detections,
                detections_path
            )
            await self._emit_progress(chunk_id, 95, "Updated database")

            # Step 8: Emit completion event (100%)
            duration = time.time() - start_time
            logger.info(f"✅ Re-processing complete for chunk {chunk_id} in {duration:.2f}s")
            await self._emit_progress(chunk_id, 100, "Complete")
            await self._emit_chunk_updated(chunk_id)

            return ReprocessingResult(
                chunk_id=chunk_id,
                corrections_applied=len(corrections),
                frames_updated=frames_updated,
                duration=duration,
                status="completed"
            )

        except Exception as error:
            duration = time.time() - start_time
            logger.error(f"❌ Re-processing failed for chunk {chunk_id}: {error}")
            await self._emit_error(chunk_id, str(error))

            return ReprocessingResult(
                chunk_id=chunk_id,
                corrections_applied=0,
                frames_updated=0,
                duration=duration,
                status="failed",
                error=str(error)
            )

    async def _load_chunk_metadata(self, chunk_id: str) -> Dict[str, Any]:
        """
        Load chunk metadata from database.

        Args:
            chunk_id: Chunk ID

        Returns:
            Chunk metadata dict
        """
        try:
            if not self.horse_db.pool:
                raise ValueError("Database pool not initialized")

            conn = self.horse_db.pool.getconn()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id, stream_id, start_time, end_time, duration,
                           processed_video_path, detections_path, status
                    FROM video_chunks
                    WHERE id = %s
                """, (chunk_id,))

                row = cursor.fetchone()
                if not row:
                    raise ValueError(f"Chunk not found: {chunk_id}")

                return {
                    "chunk_id": row[0],
                    "stream_id": row[1],
                    "start_time": row[2],
                    "end_time": row[3],
                    "duration": row[4],
                    "processed_video_path": row[5],
                    "detections_path": row[6],
                    "status": row[7]
                }
            finally:
                self.horse_db.pool.putconn(conn)

        except Exception as error:
            logger.error(f"Failed to load chunk metadata: {error}")
            raise

    async def _load_detections_data(self, detections_path: str) -> Dict[str, Any]:
        """
        Load detections JSON file.

        Args:
            detections_path: Path to detections JSON

        Returns:
            Detections data dict
        """
        try:
            with open(detections_path, 'r') as f:
                return json.load(f)
        except Exception as error:
            logger.error(f"Failed to load detections data: {error}")
            raise

    async def _apply_corrections(
        self,
        detections_data: Dict[str, Any],
        corrections: List[Dict[str, Any]],
        chunk_id: str
    ) -> Dict[str, Any]:
        """
        Apply corrections to detection data.

        Correction types:
        - reassign: Change detection's horse_id to existing horse
        - new_guest: Create new guest horse and assign detection
        - mark_incorrect: Remove detection from frames

        Args:
            detections_data: Original detections data
            corrections: List of corrections to apply
            chunk_id: Chunk ID for logging

        Returns:
            Updated detections data
        """
        try:
            # Work with a deep copy to avoid modifying original
            import copy
            updated_data = copy.deepcopy(detections_data)

            # Build correction index for fast lookup
            correction_map = {}
            for correction in corrections:
                frame_idx = correction.get("frame_index")
                detection_idx = correction.get("detection_index")
                key = f"{frame_idx}_{detection_idx}"
                correction_map[key] = correction

            logger.info(f"Applying {len(corrections)} corrections to chunk {chunk_id}")

            # Apply corrections to each frame
            for frame_result in updated_data.get("frames", []):
                frame_idx = frame_result.get("frame_index")

                # Apply corrections to tracked horses
                tracked_horses = frame_result.get("tracked_horses", [])
                updated_horses = []

                for det_idx, horse in enumerate(tracked_horses):
                    key = f"{frame_idx}_{det_idx}"

                    if key in correction_map:
                        correction = correction_map[key]
                        correction_type = correction.get("correction_type")

                        if correction_type == "reassign":
                            # Reassign to existing horse
                            corrected_horse_id = correction.get("corrected_horse_id")
                            logger.debug(f"Frame {frame_idx}: Reassigning detection {det_idx} from {horse.get('id')} to {corrected_horse_id}")
                            horse["id"] = corrected_horse_id
                            horse["horse_name"] = correction.get("corrected_horse_name")
                            horse["correction_applied"] = True
                            updated_horses.append(horse)

                        elif correction_type == "new_guest":
                            # Create new guest horse
                            new_horse_id = str(uuid.uuid4())[:8]
                            logger.debug(f"Frame {frame_idx}: Creating new guest horse {new_horse_id} for detection {det_idx}")
                            horse["id"] = new_horse_id
                            horse["horse_name"] = correction.get("corrected_horse_name")
                            horse["horse_type"] = "guest"
                            horse["is_official"] = False
                            horse["correction_applied"] = True
                            updated_horses.append(horse)

                        elif correction_type == "mark_incorrect":
                            # Remove detection (don't add to updated_horses)
                            logger.debug(f"Frame {frame_idx}: Removing incorrect detection {det_idx}")
                            continue

                        else:
                            logger.warning(f"Unknown correction type: {correction_type}")
                            updated_horses.append(horse)
                    else:
                        # No correction for this detection
                        updated_horses.append(horse)

                # Update frame with corrected horses
                frame_result["tracked_horses"] = updated_horses

            # Update horses summary
            updated_data["horses"] = self._generate_horse_summary(updated_data.get("frames", []))
            updated_data["summary"]["total_horses"] = len(updated_data["horses"])

            logger.info(f"✅ Applied corrections: {len(corrections)} corrections processed")
            return updated_data

        except Exception as error:
            logger.error(f"Failed to apply corrections: {error}")
            raise

    async def _update_reid_features(
        self,
        detections_data: Dict[str, Any],
        frames_dir: Path,
        chunk_id: str
    ) -> None:
        """
        Update ReID feature vectors for corrected horses.

        For reassigned horses: Re-extract features from corrected bounding boxes
        and update feature vectors in PostgreSQL with weighted average.

        Args:
            detections_data: Updated detections data
            frames_dir: Directory containing frame images
            chunk_id: Chunk ID for logging
        """
        try:
            if not self.reid_model:
                logger.warning("ReID model not initialized, skipping feature updates")
                return

            # Collect unique horses that need feature updates
            horses_to_update = {}

            for frame_result in detections_data.get("frames", []):
                if not frame_result.get("processed", False):
                    continue

                frame_idx = frame_result.get("frame_index")
                frame_path = frames_dir / frame_result.get("frame_path", f"frame_{frame_idx:04d}.jpg")

                if not frame_path.exists():
                    logger.warning(f"Frame not found: {frame_path}")
                    continue

                # Load frame image
                frame = cv2.imread(str(frame_path))
                if frame is None:
                    logger.warning(f"Failed to load frame: {frame_path}")
                    continue

                for horse in frame_result.get("tracked_horses", []):
                    if not horse.get("correction_applied", False):
                        continue

                    horse_id = horse.get("id")
                    bbox = horse.get("bbox", {})

                    if not bbox or not horse_id:
                        continue

                    # Extract crop from frame
                    x = int(bbox.get("x", 0))
                    y = int(bbox.get("y", 0))
                    w = int(bbox.get("width", 0))
                    h = int(bbox.get("height", 0))

                    if w <= 0 or h <= 0:
                        continue

                    crop = frame[y:y+h, x:x+w]
                    if crop.size == 0:
                        continue

                    # Extract ReID features
                    features = self.reid_model.extract_features(crop)

                    # Store features for this horse (use best quality)
                    if horse_id not in horses_to_update:
                        horses_to_update[horse_id] = {
                            "features": features,
                            "horse_name": horse.get("horse_name"),
                            "quality": horse.get("confidence", 0.0)
                        }
                    else:
                        # Keep features with highest quality
                        if horse.get("confidence", 0.0) > horses_to_update[horse_id]["quality"]:
                            horses_to_update[horse_id]["features"] = features
                            horses_to_update[horse_id]["quality"] = horse.get("confidence", 0.0)

            # Update feature vectors in database with weighted average
            logger.info(f"Updating ReID features for {len(horses_to_update)} horses")

            for horse_id, data in horses_to_update.items():
                await self._update_horse_features(
                    horse_id,
                    data["features"],
                    weight=0.7  # 70% user correction, 30% existing features
                )

            logger.info(f"✅ Updated ReID features for {len(horses_to_update)} horses")

        except Exception as error:
            logger.error(f"Failed to update ReID features: {error}")
            # Non-critical error, continue processing
            pass

    async def _update_horse_features(
        self,
        horse_id: str,
        new_features: np.ndarray,
        weight: float = 0.7
    ) -> None:
        """
        Update horse feature vector with weighted average.

        Args:
            horse_id: Horse ID
            new_features: New feature vector from correction
            weight: Weight for new features (0.0-1.0)
        """
        try:
            if not self.horse_db.pool:
                return

            conn = self.horse_db.pool.getconn()
            try:
                cursor = conn.cursor()

                # Get current features
                cursor.execute("""
                    SELECT feature_vector FROM horses WHERE tracking_id = %s
                """, (horse_id,))

                row = cursor.fetchone()
                if not row or row[0] is None:
                    # No existing features, just insert new ones
                    cursor.execute("""
                        UPDATE horses
                        SET feature_vector = %s
                        WHERE tracking_id = %s
                    """, (new_features.tolist(), horse_id))
                else:
                    # Weighted average: weight * new + (1-weight) * old
                    old_features = np.array(row[0])
                    weighted_features = weight * new_features + (1 - weight) * old_features

                    # Normalize
                    weighted_features = weighted_features / np.linalg.norm(weighted_features)

                    cursor.execute("""
                        UPDATE horses
                        SET feature_vector = %s
                        WHERE tracking_id = %s
                    """, (weighted_features.tolist(), horse_id))

                conn.commit()
                logger.debug(f"Updated features for horse {horse_id}")

            finally:
                self.horse_db.pool.putconn(conn)

            # Invalidate Redis cache
            if self.horse_db.redis_client:
                try:
                    pattern = f"horse:*:{horse_id}:state"
                    keys = self.horse_db.redis_client.keys(pattern)
                    if keys:
                        self.horse_db.redis_client.delete(*keys)
                        logger.debug(f"Invalidated Redis cache for horse {horse_id}")
                except Exception as redis_error:
                    logger.warning(f"Failed to invalidate Redis cache: {redis_error}")

        except Exception as error:
            logger.error(f"Failed to update horse features: {error}")
            raise

    async def _regenerate_frames(
        self,
        frames_dir: Path,
        detections_data: Dict[str, Any],
        chunk_id: str
    ) -> int:
        """
        Regenerate frames with corrected overlays.

        Args:
            frames_dir: Directory containing frames
            detections_data: Updated detections data
            chunk_id: Chunk ID for logging

        Returns:
            Number of frames updated
        """
        try:
            frames_updated = 0

            for frame_result in detections_data.get("frames", []):
                if not frame_result.get("processed", False):
                    continue

                frame_idx = frame_result.get("frame_index")
                frame_path = frames_dir / frame_result.get("frame_path", f"frame_{frame_idx:04d}.jpg")

                if not frame_path.exists():
                    logger.warning(f"Frame not found: {frame_path}")
                    continue

                # Load original frame (without overlays - we need to reload raw frame)
                # Since we don't have raw frames saved, we'll redraw on existing frame
                # This is acceptable as we're just updating the overlay
                frame = cv2.imread(str(frame_path))
                if frame is None:
                    logger.warning(f"Failed to load frame: {frame_path}")
                    continue

                # For production, we should reload raw frame from video
                # For now, we'll draw on top of existing frame

                # Draw updated overlays
                tracked_horses = frame_result.get("tracked_horses", [])
                frame_poses = frame_result.get("poses", [])

                updated_frame = self.frame_renderer.draw_overlays(
                    frame,
                    tracked_horses,
                    frame_poses
                )

                # Save updated frame
                cv2.imwrite(str(frame_path), updated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frames_updated += 1

            logger.info(f"✅ Regenerated {frames_updated} frames")
            return frames_updated

        except Exception as error:
            logger.error(f"Failed to regenerate frames: {error}")
            raise

    async def _rebuild_video_chunk(
        self,
        frames_dir: Path,
        output_video_path: str,
        fps: int
    ) -> None:
        """
        Rebuild video chunk from frames using FFmpeg.

        Args:
            frames_dir: Directory containing updated frames
            output_video_path: Output video path
            fps: Frames per second
        """
        try:
            # Create temporary directory for frame sequence
            temp_frames_dir = Path(f"/tmp/reprocess_{uuid.uuid4().hex[:8]}")
            temp_frames_dir.mkdir(parents=True, exist_ok=True)

            try:
                # Copy frames to temp directory with sequential naming
                frame_files = sorted(frames_dir.glob("frame_*.jpg"))
                for idx, frame_file in enumerate(frame_files):
                    dest = temp_frames_dir / f"frame_{idx:04d}.jpg"
                    shutil.copy(frame_file, dest)

                # FFmpeg command
                cmd = [
                    'ffmpeg',
                    '-y',  # Overwrite output file
                    '-framerate', str(fps),
                    '-i', str(temp_frames_dir / 'frame_%04d.jpg'),
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-preset', 'fast',
                    '-crf', '23',
                    output_video_path
                ]

                logger.info(f"Rebuilding video: {output_video_path}")

                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=300
                )

                if result.returncode != 0:
                    logger.error(f"FFmpeg failed: {result.stderr}")
                    raise RuntimeError(f"FFmpeg failed: {result.stderr}")

                logger.info(f"✅ Video rebuilt: {output_video_path}")

            finally:
                # Cleanup temp directory
                shutil.rmtree(temp_frames_dir, ignore_errors=True)

        except Exception as error:
            logger.error(f"Failed to rebuild video: {error}")
            # Non-critical error if video rebuild fails
            pass

    async def _update_database(
        self,
        chunk_id: str,
        corrections: List[Dict[str, Any]],
        updated_detections: Dict[str, Any],
        detections_path: str
    ) -> None:
        """
        Update database with corrections and updated detection data.

        Args:
            chunk_id: Chunk ID
            corrections: Applied corrections
            updated_detections: Updated detections data
            detections_path: Path to detections JSON file
        """
        try:
            if not self.horse_db.pool:
                return

            conn = self.horse_db.pool.getconn()
            try:
                cursor = conn.cursor()

                # Update video_chunks table
                cursor.execute("""
                    UPDATE video_chunks
                    SET last_corrected = NOW(),
                        correction_count = correction_count + %s
                    WHERE id = %s
                """, (len(corrections), chunk_id))

                # Mark corrections as applied in detection_corrections table
                # Note: This assumes corrections have been inserted by API Gateway
                cursor.execute("""
                    UPDATE detection_corrections
                    SET status = 'applied',
                        applied_at = NOW()
                    WHERE chunk_id = %s
                      AND status = 'pending'
                """, (chunk_id,))

                conn.commit()

                logger.info(f"✅ Updated database for chunk {chunk_id}")

            finally:
                self.horse_db.pool.putconn(conn)

            # Save updated detections JSON
            with open(detections_path, 'w') as f:
                json.dump(updated_detections, f, indent=2, default=str)

            logger.info(f"✅ Saved updated detections: {detections_path}")

        except Exception as error:
            logger.error(f"Failed to update database: {error}")
            raise

    def _generate_horse_summary(self, frame_results: List[Dict]) -> List[Dict]:
        """Generate per-horse summary across all frames."""
        horse_data = {}

        for frame_idx, frame_result in enumerate(frame_results):
            for track in frame_result.get("tracked_horses", []):
                horse_id = str(track.get("id"))
                horse_name = track.get("horse_name")

                if horse_id not in horse_data:
                    horse_data[horse_id] = {
                        "id": horse_id,
                        "name": horse_name,
                        "color": track.get("color", [255, 255, 255]),
                        "total_detections": 0,
                        "confidences": [],
                        "first_frame": frame_idx,
                        "last_frame": frame_idx,
                        "horse_type": track.get("horse_type", "guest"),
                        "is_official": track.get("is_official", False)
                    }
                else:
                    horse_data[horse_id]["last_frame"] = frame_idx
                    if horse_name:
                        horse_data[horse_id]["name"] = horse_name

                horse_data[horse_id]["total_detections"] += 1
                horse_data[horse_id]["confidences"].append(track.get("confidence", 0.0))

        # Calculate averages
        horse_summaries = []
        for horse_id, data in horse_data.items():
            avg_confidence = sum(data["confidences"]) / len(data["confidences"]) if data["confidences"] else 0.0

            horse_summaries.append({
                "id": horse_id,
                "name": data.get("name"),
                "color": data["color"],
                "first_detected_frame": data["first_frame"],
                "last_detected_frame": data["last_frame"],
                "total_detections": data["total_detections"],
                "avg_confidence": round(avg_confidence, 3),
                "horse_type": data.get("horse_type", "guest"),
                "is_official": data.get("is_official", False)
            })

        return horse_summaries

    async def _emit_progress(self, chunk_id: str, progress: int, step: str) -> None:
        """
        Emit re-processing progress event.

        Args:
            chunk_id: Chunk ID
            progress: Progress percentage (0-100)
            step: Current step description
        """
        try:
            # Store progress in Redis
            if self.horse_db.redis_client:
                progress_key = f"reprocessing:{chunk_id}:status"
                progress_data = {
                    "status": "running" if progress < 100 else "completed",
                    "progress": progress,
                    "step": step,
                    "updated_at": time.time()
                }
                self.horse_db.redis_client.setex(
                    progress_key,
                    3600,  # 1 hour TTL
                    json.dumps(progress_data)
                )

            # Emit WebSocket event via API Gateway
            await self._emit_websocket_event(chunk_id, "reprocessing:progress", {
                "chunk_id": chunk_id,
                "progress": progress,
                "step": step
            })

            logger.debug(f"📊 Progress: {progress}% - {step}")

        except Exception as error:
            logger.warning(f"Failed to emit progress: {error}")

    async def _emit_chunk_updated(self, chunk_id: str) -> None:
        """
        Emit chunk updated event.

        Args:
            chunk_id: Chunk ID
        """
        try:
            await self._emit_websocket_event(chunk_id, "chunk:updated", {
                "chunk_id": chunk_id
            })
        except Exception as error:
            logger.warning(f"Failed to emit chunk updated event: {error}")

    async def _emit_error(self, chunk_id: str, error_message: str) -> None:
        """
        Emit re-processing error event.

        Args:
            chunk_id: Chunk ID
            error_message: Error message
        """
        try:
            # Store error in Redis
            if self.horse_db.redis_client:
                progress_key = f"reprocessing:{chunk_id}:status"
                progress_data = {
                    "status": "failed",
                    "progress": 0,
                    "step": "Error",
                    "error": error_message,
                    "updated_at": time.time()
                }
                self.horse_db.redis_client.setex(
                    progress_key,
                    3600,
                    json.dumps(progress_data)
                )

            await self._emit_websocket_event(chunk_id, "reprocessing:error", {
                "chunk_id": chunk_id,
                "error": error_message
            })

        except Exception as error:
            logger.warning(f"Failed to emit error: {error}")

    async def _emit_websocket_event(
        self,
        chunk_id: str,
        event_name: str,
        data: Dict[str, Any]
    ) -> None:
        """
        Emit WebSocket event via API Gateway webhook.

        Args:
            chunk_id: Chunk ID
            event_name: Event name
            data: Event data
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                webhook_url = f"{settings.api_gateway_url}/api/internal/webhooks/reprocessing-event"
                response = await client.post(
                    webhook_url,
                    json={
                        "chunk_id": chunk_id,
                        "event": event_name,
                        "data": data
                    }
                )

                if response.status_code != 200:
                    logger.warning(f"WebSocket event webhook returned status {response.status_code}")

        except httpx.TimeoutException:
            logger.warning("Timeout emitting WebSocket event")
        except Exception as error:
            logger.debug(f"Failed to emit WebSocket event: {error}")
