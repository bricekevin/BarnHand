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
import psycopg2
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
                chunk_id,
                chunk_metadata.get("stream_id"),
                chunk_metadata.get("farm_id")
            )
            await self._emit_progress(chunk_id, 40, "Applied corrections to tracking data")

            # Step 4: Update ReID feature vectors (50%)
            logger.info(f"🔍 Step 4: Updating ReID feature vectors...")
            try:
                await self._update_reid_features(
                    updated_detections,
                    frames_dir,
                    chunk_id
                )
            except Exception as reid_error:
                logger.warning(f"⚠️ Failed to update ReID features (non-critical): {reid_error}")
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
                    detections_data.get("video_metadata", {}).get("fps", 30),
                    detections_data.get("video_metadata", {}).get("frame_interval", 1)
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
        Load chunk metadata from filesystem structure.

        Chunks are stored on filesystem with the following structure:
        /app/storage/chunks/{farm_id}/{stream_id}/
            - chunk_{stream_id}_{chunk_id}.mp4
            - detections/chunk_{stream_id}_{chunk_id}_detections.json
            - processed/chunk_{stream_id}_{chunk_id}_processed.mp4

        Args:
            chunk_id: Chunk ID

        Returns:
            Chunk metadata dict with paths and identifiers
        """
        try:
            # Define storage base path
            storage_base = Path("/app/storage/chunks")

            # Search for detections JSON matching chunk_id
            pattern = f"**/detections/chunk_*_{chunk_id}_detections.json"
            matches = list(storage_base.glob(pattern))

            if not matches:
                raise ValueError(f"Chunk not found in filesystem: {chunk_id}")

            if len(matches) > 1:
                logger.warning(f"Multiple chunks found for {chunk_id}, using first match")

            detections_path = matches[0]

            # Extract stream_id from filename
            # Format: chunk_STREAM-ID_CHUNK-ID_detections.json
            filename = detections_path.name
            parts = filename.replace("chunk_", "").replace("_detections.json", "").split("_", 1)

            if len(parts) < 2:
                raise ValueError(f"Invalid chunk filename format: {filename}")

            stream_id = parts[0]

            # Construct all required paths
            chunk_dir = detections_path.parent.parent  # Go up from detections/ to chunk root
            processed_video_path = chunk_dir / "processed" / f"chunk_{stream_id}_{chunk_id}_processed.mp4"

            # Extract farm_id from directory structure
            # Path format: /app/storage/chunks/{farm_id}/{stream_id}/detections/...
            farm_id = chunk_dir.parent.name  # Get farm_id from parent directory

            # Verify critical files exist
            if not detections_path.exists():
                raise ValueError(f"Detections file not found: {detections_path}")

            logger.info(f"Loaded chunk metadata from filesystem", extra={
                "chunk_id": chunk_id,
                "stream_id": stream_id,
                "farm_id": farm_id,
                "detections_path": str(detections_path),
                "processed_video_path": str(processed_video_path)
            })

            return {
                "chunk_id": chunk_id,
                "stream_id": stream_id,
                "farm_id": farm_id,
                "detections_path": str(detections_path),
                "processed_video_path": str(processed_video_path),
                "status": "completed"  # Assume completed if files exist
            }

        except Exception as error:
            logger.error(f"Failed to load chunk metadata from filesystem: {error}")
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
        chunk_id: str,
        stream_id: str,
        farm_id: str
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
            stream_id: Stream ID for horse creation
            farm_id: Farm ID for horse creation

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
                logger.info(f"📥 Correction received: frame={frame_idx}, det={detection_idx}, type={correction.get('correction_type')}, key='{key}'")

            logger.info(f"Applying {len(corrections)} corrections to chunk {chunk_id}")
            logger.info(f"Correction map keys: {list(correction_map.keys())}")

            # Track created guest horses to avoid duplicates
            # Map: guest_horse_name -> horse_id
            created_guest_horses = {}

            # Apply corrections to each frame
            for frame_result in updated_data.get("frames", []):
                frame_idx = frame_result.get("frame_index")

                # Track horse ID changes for pose data updates
                horse_id_changes = {}  # old_id -> new_id

                # Apply corrections to tracked horses
                tracked_horses = frame_result.get("tracked_horses", [])
                updated_horses = []

                for det_idx, horse in enumerate(tracked_horses):
                    key = f"{frame_idx}_{det_idx}"
                    logger.debug(f"Checking frame {frame_idx}, detection {det_idx}, key='{key}', horse_id={horse.get('id')}")

                    if key in correction_map:
                        correction = correction_map[key]
                        correction_type = correction.get("correction_type")

                        logger.info(f"🔧 Processing correction at frame {frame_idx}, detection {det_idx}: type={correction_type}, data={correction}")

                        old_horse_id = horse.get("id")

                        if correction_type == "reassign":
                            # Reassign to existing horse
                            corrected_horse_id = correction.get("corrected_horse_id")
                            logger.debug(f"Frame {frame_idx}: Reassigning detection {det_idx} from {horse.get('id')} to {corrected_horse_id}")

                            # Fetch horse name from database
                            horse_name = await self._get_horse_name(corrected_horse_id)

                            horse["id"] = corrected_horse_id
                            horse["horse_name"] = horse_name
                            horse["correction_applied"] = True
                            updated_horses.append(horse)

                            # Track horse ID change for pose updates
                            horse_id_changes[old_horse_id] = corrected_horse_id

                        elif correction_type == "new_guest":
                            # Check if we've already created a guest horse with this name
                            guest_name = correction.get("corrected_horse_name")

                            if guest_name in created_guest_horses:
                                # Reuse existing guest horse
                                new_horse_id = created_guest_horses[guest_name]
                                logger.debug(f"Frame {frame_idx}: Reusing guest horse {new_horse_id} ('{guest_name}') for detection {det_idx}")
                            else:
                                # Create new guest horse in database
                                new_horse_id = await self._create_guest_horse(
                                    name=guest_name,
                                    farm_id=farm_id,
                                    stream_id=stream_id,
                                    bbox=horse.get("bbox"),
                                    confidence=horse.get("confidence", 0.0)
                                )
                                created_guest_horses[guest_name] = new_horse_id
                                logger.info(f"Frame {frame_idx}: Created new guest horse {new_horse_id} ('{guest_name}') in database for detection {det_idx}")

                            horse["id"] = new_horse_id
                            horse["horse_name"] = guest_name
                            horse["horse_type"] = "guest"
                            horse["is_official"] = False
                            horse["correction_applied"] = True
                            updated_horses.append(horse)

                            # Track horse ID change for pose updates
                            horse_id_changes[old_horse_id] = new_horse_id

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

                # Update pose data to match corrected horse IDs
                if horse_id_changes:
                    updated_poses = []
                    for pose_data in frame_result.get("poses", []):
                        old_id = pose_data.get("horse_id")
                        if old_id in horse_id_changes:
                            # Update pose horse_id to match corrected horse
                            pose_data["horse_id"] = horse_id_changes[old_id]
                            logger.debug(f"Frame {frame_idx}: Updated pose horse_id from {old_id} to {horse_id_changes[old_id]}")
                        updated_poses.append(pose_data)
                    frame_result["poses"] = updated_poses

            # Update horses summary
            updated_data["horses"] = self._generate_horse_summary(updated_data.get("frames", []))
            updated_data["summary"]["total_horses"] = len(updated_data["horses"])

            logger.info(f"✅ Applied corrections: {len(corrections)} corrections processed")
            if created_guest_horses:
                logger.info(f"🐴 Created {len(created_guest_horses)} new guest horse(s): {list(created_guest_horses.keys())}")

            return updated_data

        except Exception as error:
            logger.error(f"Failed to apply corrections: {error}")
            raise

    async def _get_horse_name(self, horse_id: str) -> str:
        """
        Fetch horse name from database.

        Args:
            horse_id: Horse ID (UUID or tracking_id)

        Returns:
            Horse name or horse_id if not found
        """
        try:
            if not self.horse_db.pool:
                logger.warning("Database pool not initialized, cannot fetch horse name")
                return horse_id

            conn = self.horse_db.pool.getconn()
            try:
                cursor = conn.cursor()

                # Try to find horse by ID or tracking_id
                cursor.execute("""
                    SELECT name FROM horses
                    WHERE id::text = %s OR tracking_id = %s
                    LIMIT 1
                """, (horse_id, horse_id))

                row = cursor.fetchone()
                if row and row[0]:
                    return row[0]

                logger.debug(f"Horse name not found for ID: {horse_id}")
                return horse_id

            finally:
                self.horse_db.pool.putconn(conn)

        except Exception as error:
            logger.error(f"Failed to fetch horse name: {error}")
            return horse_id

    async def _create_guest_horse(
        self,
        name: str,
        farm_id: str,
        stream_id: str,
        bbox: Dict[str, Any],
        confidence: float
    ) -> str:
        """
        Create a new guest horse record in the database.

        Args:
            name: Horse name
            farm_id: Farm ID
            stream_id: Stream ID
            bbox: Bounding box for initial detection
            confidence: Detection confidence

        Returns:
            New horse ID (UUID)
        """
        try:
            if not self.horse_db.pool:
                raise ValueError("Database pool not initialized")

            # Generate color for the horse (cycling through tracking colors)
            tracking_colors = [
                "#4ecdc4", "#ff6b6b", "#95e1d3", "#f38181",
                "#aa96da", "#fcbad3", "#a8e6cf", "#ffd3b6",
                "#ffaaa5", "#ff8b94"
            ]

            conn = self.horse_db.pool.getconn()
            try:
                cursor = conn.cursor()

                # Get count of existing horses to assign next color
                cursor.execute("SELECT COUNT(*) FROM horses WHERE farm_id = %s", (farm_id,))
                horse_count = cursor.fetchone()[0]
                ui_color = tracking_colors[horse_count % len(tracking_colors)]

                # Generate tracking_id in the format: {stream_id}_guest_{uuid_prefix}
                import uuid as uuid_module
                guest_uuid = str(uuid_module.uuid4())[:8]  # Use first 8 chars of UUID
                tracking_id = f"{stream_id.replace('-', '_')}_guest_{guest_uuid}"

                # Insert new guest horse
                cursor.execute("""
                    INSERT INTO horses (
                        farm_id, stream_id, name, tracking_id, is_official, status,
                        ui_color, first_detected, last_seen,
                        confidence_score, total_detections, metadata
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, %s, %s)
                    RETURNING id
                """, (
                    farm_id,
                    stream_id,
                    name,
                    tracking_id,  # Set tracking_id
                    False,  # is_official
                    'active',
                    ui_color,
                    confidence,
                    1,  # total_detections
                    json.dumps({"created_via": "correction", "bbox": bbox})
                ))

                new_horse_id = cursor.fetchone()[0]
                conn.commit()

                logger.info(f"✅ Created guest horse in database: {new_horse_id} ({name}, tracking_id: {tracking_id})")
                return str(new_horse_id)

            finally:
                self.horse_db.pool.putconn(conn)

        except Exception as error:
            logger.error(f"Failed to create guest horse: {error}")
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

            # Find original raw video chunk
            chunk_video_path = self._find_original_chunk_video(frames_dir)
            if not chunk_video_path or not chunk_video_path.exists():
                logger.warning(f"Original chunk video not found, cannot update thumbnails from raw frames")
                return

            logger.info(f"Loading raw frames from: {chunk_video_path}")

            # Open video file for raw frame extraction
            cap = cv2.VideoCapture(str(chunk_video_path))
            if not cap.isOpened():
                logger.error(f"Failed to open video: {chunk_video_path}")
                return

            # Collect unique horses that need feature updates
            horses_to_update = {}

            try:
                for frame_result in detections_data.get("frames", []):
                    if not frame_result.get("processed", False):
                        continue

                    frame_idx = frame_result.get("frame_index")

                    # Seek to the correct frame in raw video
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                    ret, raw_frame = cap.read()

                    if not ret or raw_frame is None:
                        logger.warning(f"Failed to read frame {frame_idx} from raw video")
                        continue

                    for horse in frame_result.get("tracked_horses", []):
                        if not horse.get("correction_applied", False):
                            continue

                        horse_id = horse.get("id")
                        bbox = horse.get("bbox", {})

                        if not bbox or not horse_id:
                            continue

                        # Extract crop from RAW frame (no overlays) with padding
                        thumbnail_crop = self._extract_thumbnail_crop(raw_frame, bbox)
                        if thumbnail_crop is None or thumbnail_crop.size == 0:
                            continue

                        # Extract ReID features from thumbnail crop
                        features = self.reid_model.extract_features(thumbnail_crop)

                        # Store features for this horse (use best quality)
                        if horse_id not in horses_to_update:
                            horses_to_update[horse_id] = {
                                "features": features,
                                "horse_name": horse.get("horse_name"),
                                "quality": horse.get("confidence", 0.0),
                                "crop": thumbnail_crop.copy()  # Save best crop for thumbnail
                            }
                        else:
                            # Keep features with highest quality
                            if horse.get("confidence", 0.0) > horses_to_update[horse_id]["quality"]:
                                horses_to_update[horse_id]["features"] = features
                                horses_to_update[horse_id]["quality"] = horse.get("confidence", 0.0)
                                horses_to_update[horse_id]["crop"] = thumbnail_crop.copy()

            finally:
                cap.release()

            # Update feature vectors and thumbnails in database
            logger.info(f"Updating ReID features and thumbnails for {len(horses_to_update)} horses")

            for horse_id, data in horses_to_update.items():
                # Update features with weighted average
                await self._update_horse_features(
                    horse_id,
                    data["features"],
                    weight=0.7  # 70% user correction, 30% existing features
                )

                # Generate and update thumbnail
                await self._update_horse_thumbnail(
                    horse_id,
                    data["crop"]
                )

            logger.info(f"✅ Updated ReID features and thumbnails for {len(horses_to_update)} horses")

        except Exception as error:
            logger.error(f"Failed to update ReID features: {error}")
            # Non-critical error, continue processing
            pass

    async def _update_horse_thumbnail(
        self,
        horse_id: str,
        crop: np.ndarray
    ) -> None:
        """
        Generate and update horse thumbnail from best quality crop.

        Args:
            horse_id: Horse ID
            crop: Cropped horse image
        """
        try:
            if not self.horse_db.pool:
                return

            # Resize crop to thumbnail size (maintaining aspect ratio)
            max_size = 200
            h, w = crop.shape[:2]
            if h > w:
                new_h = max_size
                new_w = int(w * (max_size / h))
            else:
                new_w = max_size
                new_h = int(h * (max_size / w))

            thumbnail = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA)

            # Encode as JPEG with 80% quality
            _, encoded = cv2.imencode('.jpg', thumbnail, [cv2.IMWRITE_JPEG_QUALITY, 80])
            thumbnail_bytes = encoded.tobytes()

            conn = self.horse_db.pool.getconn()
            try:
                cursor = conn.cursor()

                # Update thumbnail (try id first, then tracking_id for backwards compatibility)
                cursor.execute("""
                    UPDATE horses
                    SET avatar_thumbnail = %s
                    WHERE id::text = %s OR tracking_id = %s
                """, (psycopg2.Binary(thumbnail_bytes), horse_id, horse_id))

                conn.commit()
                logger.debug(f"Updated thumbnail for horse {horse_id} ({len(thumbnail_bytes)} bytes)")

            finally:
                self.horse_db.pool.putconn(conn)

        except Exception as error:
            logger.error(f"Failed to update horse thumbnail: {error}")
            # Non-critical error, continue

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

                # Get current features (try id first, then tracking_id for backwards compatibility)
                cursor.execute("""
                    SELECT feature_vector FROM horses WHERE id::text = %s OR tracking_id = %s
                """, (horse_id, horse_id))

                row = cursor.fetchone()
                if not row or row[0] is None:
                    # No existing features, just insert new ones
                    cursor.execute("""
                        UPDATE horses
                        SET feature_vector = %s
                        WHERE id::text = %s OR tracking_id = %s
                    """, (new_features.tolist(), horse_id, horse_id))
                else:
                    # Weighted average: weight * new + (1-weight) * old
                    old_feature_data = row[0]

                    # Handle different data types from database
                    if isinstance(old_feature_data, str):
                        # Parse JSON string
                        try:
                            old_features = np.array(json.loads(old_feature_data))
                        except (json.JSONDecodeError, ValueError) as e:
                            logger.warning(f"Failed to parse feature vector for horse {horse_id}, using new features only: {e}")
                            old_features = new_features
                    elif isinstance(old_feature_data, list):
                        old_features = np.array(old_feature_data)
                    elif isinstance(old_feature_data, np.ndarray):
                        old_features = old_feature_data
                    else:
                        logger.warning(f"Unexpected feature vector type {type(old_feature_data)} for horse {horse_id}, using new features only")
                        old_features = new_features

                    # Ensure both arrays have the same shape
                    if old_features.shape != new_features.shape:
                        logger.warning(f"Feature vector shape mismatch for horse {horse_id}: old={old_features.shape}, new={new_features.shape}, using new features only")
                        weighted_features = new_features
                    else:
                        weighted_features = weight * new_features + (1 - weight) * old_features

                    # Normalize
                    norm = np.linalg.norm(weighted_features)
                    if norm > 0:
                        weighted_features = weighted_features / norm

                    cursor.execute("""
                        UPDATE horses
                        SET feature_vector = %s
                        WHERE id::text = %s OR tracking_id = %s
                    """, (weighted_features.tolist(), horse_id, horse_id))

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

        This function extracts raw frames from the original video chunk,
        then redraws the overlays with corrected tracking data.

        Args:
            frames_dir: Directory containing frames
            detections_data: Updated detections data
            chunk_id: Chunk ID for logging

        Returns:
            Number of frames updated
        """
        try:
            frames_updated = 0

            # Find original raw video chunk
            chunk_video_path = self._find_original_chunk_video(frames_dir)
            if not chunk_video_path or not chunk_video_path.exists():
                logger.warning(f"Original chunk video not found, skipping frame regeneration")
                return 0

            logger.info(f"Loading raw frames from: {chunk_video_path}")

            # Open video file
            cap = cv2.VideoCapture(str(chunk_video_path))
            if not cap.isOpened():
                logger.error(f"Failed to open video: {chunk_video_path}")
                return 0

            try:
                fps = detections_data.get("video_metadata", {}).get("fps", 30)
                frame_interval = detections_data.get("video_metadata", {}).get("frame_interval", 1)

                frames_to_process = [f for f in detections_data.get("frames", []) if f.get("processed", False)]
                total_frames = len(frames_to_process)

                for idx, frame_result in enumerate(frames_to_process):
                    frame_idx = frame_result.get("frame_index")
                    frame_path = frames_dir / frame_result.get("frame_path", f"frame_{frame_idx:04d}.jpg")

                    # Seek to the correct frame in video
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                    ret, raw_frame = cap.read()

                    if not ret or raw_frame is None:
                        logger.warning(f"Failed to read frame {frame_idx} from video")
                        continue

                    # Draw updated overlays on the raw frame
                    tracked_horses = frame_result.get("tracked_horses", [])
                    frame_poses = frame_result.get("poses", [])

                    updated_frame = self.frame_renderer.draw_overlays(
                        raw_frame,
                        tracked_horses,
                        frame_poses
                    )

                    # Save updated frame
                    cv2.imwrite(str(frame_path), updated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    frames_updated += 1

                    # Emit progress every 10 frames
                    if (idx + 1) % 10 == 0 or (idx + 1) == total_frames:
                        progress_pct = 70 + int((idx + 1) / total_frames * 15)  # 70-85%
                        await self._emit_progress(
                            chunk_id,
                            progress_pct,
                            f"Regenerating frames ({idx + 1}/{total_frames})"
                        )
                        logger.info(f"🖼️ Regenerated {idx + 1}/{total_frames} frames")

            finally:
                cap.release()

            logger.info(f"✅ Regenerated {frames_updated} frames from raw video")
            return frames_updated

        except Exception as error:
            logger.error(f"Failed to regenerate frames: {error}")
            raise

    def _extract_thumbnail_crop(self, frame: np.ndarray, bbox: Dict[str, Any]) -> Optional[np.ndarray]:
        """
        Extract thumbnail crop from frame with padding (matches horse_tracker logic).

        Creates square crop with 10% padding, centered on bbox.
        Handles edge cases where crop extends beyond frame boundaries.

        Args:
            frame: Raw frame image
            bbox: Bounding box dict with x, y, width, height

        Returns:
            200x200 thumbnail crop or None if invalid
        """
        try:
            # Get frame dimensions
            frame_h, frame_w = frame.shape[:2]

            # Get bounding box coordinates
            bbox_x, bbox_y = int(bbox.get("x", 0)), int(bbox.get("y", 0))
            bbox_w, bbox_h = int(bbox.get("width", 0)), int(bbox.get("height", 0))

            if bbox_w <= 0 or bbox_h <= 0:
                return None

            # Calculate square crop size (larger dimension + 10% padding)
            max_dim = max(bbox_w, bbox_h)
            square_size = int(max_dim * 1.1)  # 10% padding

            # Calculate center of bbox
            center_x = bbox_x + bbox_w // 2
            center_y = bbox_y + bbox_h // 2

            # Calculate square crop coordinates centered on bbox
            crop_x1 = center_x - square_size // 2
            crop_y1 = center_y - square_size // 2
            crop_x2 = crop_x1 + square_size
            crop_y2 = crop_y1 + square_size

            # Handle cases where crop extends beyond frame boundaries
            # Calculate padding needed for each side
            pad_left = max(0, -crop_x1)
            pad_right = max(0, crop_x2 - frame_w)
            pad_top = max(0, -crop_y1)
            pad_bottom = max(0, crop_y2 - frame_h)

            # Adjust crop coordinates to frame boundaries
            crop_x1 = max(0, crop_x1)
            crop_y1 = max(0, crop_y1)
            crop_x2 = min(frame_w, crop_x2)
            crop_y2 = min(frame_h, crop_y2)

            # Extract the crop
            if crop_x2 > crop_x1 and crop_y2 > crop_y1:
                horse_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2].copy()

                # Add black padding if crop extended beyond frame
                if pad_left > 0 or pad_right > 0 or pad_top > 0 or pad_bottom > 0:
                    horse_crop = cv2.copyMakeBorder(
                        horse_crop,
                        pad_top, pad_bottom, pad_left, pad_right,
                        cv2.BORDER_CONSTANT,
                        value=[0, 0, 0]  # Black padding
                    )

                # Resize to 200x200 for consistent thumbnail size
                thumbnail = cv2.resize(horse_crop, (200, 200), interpolation=cv2.INTER_AREA)
                return thumbnail

            return None

        except Exception as error:
            logger.error(f"Failed to extract thumbnail crop: {error}")
            return None

    def _find_original_chunk_video(self, frames_dir: Path) -> Optional[Path]:
        """
        Find the original raw chunk video file.

        Args:
            frames_dir: Directory containing processed frames

        Returns:
            Path to original chunk video, or None if not found
        """
        try:
            # frames_dir structure: /app/storage/chunks/{farm_id}/{stream_id}/detections/chunk_{stream_id}_{chunk_id}_detections/frames
            # Original video: /app/storage/chunks/{farm_id}/{stream_id}/chunk_{stream_id}_{chunk_id}.mp4

            detections_dir = frames_dir.parent  # Go up from frames/ to detections/chunk_..._detections/
            chunk_root = detections_dir.parent.parent  # Go up to stream directory

            # Extract chunk filename from detections directory name
            # Format: chunk_{stream_id}_{chunk_id}_detections
            detections_dirname = detections_dir.name
            chunk_filename = detections_dirname.replace("_detections", ".mp4")

            # Look for the original chunk video
            original_video = chunk_root / chunk_filename

            if original_video.exists():
                return original_video

            logger.warning(f"Original chunk video not found at: {original_video}")
            return None

        except Exception as error:
            logger.error(f"Failed to find original chunk video: {error}")
            return None

    async def _rebuild_video_chunk(
        self,
        frames_dir: Path,
        output_video_path: str,
        fps: int,
        frame_interval: int = 1
    ) -> None:
        """
        Rebuild video chunk from frames using FFmpeg.

        Args:
            frames_dir: Directory containing updated frames
            output_video_path: Output video path
            fps: Frames per second
            frame_interval: Frame processing interval (1 = all frames, 2 = every other frame)
        """
        try:
            # Create temporary directory for frame sequence
            temp_frames_dir = Path(f"/tmp/reprocess_{uuid.uuid4().hex[:8]}")
            temp_frames_dir.mkdir(parents=True, exist_ok=True)

            try:
                # Copy frames to temp directory with SEQUENTIAL numbering for FFmpeg
                frame_files = sorted(frames_dir.glob("frame_*.jpg"))

                # FFmpeg requires sequential frame numbering (0, 1, 2, 3...)
                # We renumber the processed frames sequentially, then use frame duplication
                # to fill gaps and match the original video duration
                for idx, frame_file in enumerate(frame_files):
                    dest = temp_frames_dir / f"frame_{idx:04d}.jpg"
                    shutil.copy(frame_file, dest)

                logger.info(f"Copied {len(frame_files)} processed frames for video rebuild")

                # Calculate input framerate based on frame_interval
                # If we processed every Nth frame, the effective input rate is fps/N
                input_fps = fps / frame_interval if frame_interval > 1 else fps

                logger.info(f"Rebuilding video: original_fps={fps}, frame_interval={frame_interval}, input_fps={input_fps}")

                # FFmpeg command - duplicate frames to match original FPS
                cmd = [
                    'ffmpeg',
                    '-y',  # Overwrite output file
                    '-framerate', str(input_fps),  # Input framerate (accounts for frame_interval)
                    '-i', str(temp_frames_dir / 'frame_%04d.jpg'),
                    '-r', str(fps),  # Output framerate (original video FPS)
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
