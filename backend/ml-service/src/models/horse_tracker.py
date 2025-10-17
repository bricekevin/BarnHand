"""DeepSort-style horse tracking with re-identification."""
import time
import math
from collections import deque
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple, Set
import numpy as np
import cv2
from scipy.optimize import linear_sum_assignment
from loguru import logger

from .horse_reid import HorseReIDModel


@dataclass
class HorseTrack:
    """Represents a tracked horse across multiple frames."""
    id: str
    tracking_id: int
    color: str
    feature_vector: np.ndarray
    last_bbox: Dict[str, float]
    last_seen: float
    confidence: float
    appearance_history: deque = field(default_factory=lambda: deque(maxlen=100))
    pose_history: deque = field(default_factory=lambda: deque(maxlen=50))
    velocity_history: deque = field(default_factory=lambda: deque(maxlen=10))

    # Track state
    state: str = "active"  # active, lost, merged, split
    frames_since_seen: int = 0
    total_detections: int = 0
    track_confidence: float = 1.0

    # Appearance features
    feature_update_count: int = 0
    first_appearance_features: Optional[np.ndarray] = None

    # Thumbnail tracking (for Phase 3)
    best_thumbnail_score: float = 0.0  # confidence * bbox_area
    best_thumbnail_frame: Optional[np.ndarray] = None
    best_thumbnail_bbox: Optional[Dict[str, float]] = None
    

class HorseTracker:
    """DeepSort-inspired multi-horse tracking with re-identification."""
    
    # Color palette for visual distinction (10 horses max)
    TRACKING_COLORS = [
        "#ff6b6b",  # Red
        "#4ecdc4",  # Teal  
        "#45b7d1",  # Blue
        "#96ceb4",  # Mint
        "#feca57",  # Yellow
        "#ff9ff3",  # Pink
        "#54a0ff",  # Light Blue
        "#5f27cd",  # Purple
        "#00d2d3",  # Cyan
        "#ff9f43"   # Orange
    ]
    
    def __init__(self, similarity_threshold: float = 0.7, max_lost_frames: int = 30,
                 stream_id: Optional[str] = None, known_horses: Optional[Dict[str, Dict[str, Any]]] = None):
        self.reid_model = HorseReIDModel()
        self.similarity_threshold = similarity_threshold
        self.max_lost_frames = max_lost_frames
        self.stream_id = stream_id or "default"

        # Active tracks
        self.tracks: Dict[str, HorseTrack] = {}
        self.next_track_id = 1
        self.color_index = 0

        # Track management
        self.lost_tracks: Dict[str, HorseTrack] = {}
        self.track_history: List[HorseTrack] = []

        # Load known horses from previous chunks (cross-chunk continuity)
        if known_horses:
            self._load_known_horses(known_horses)

        # Performance metrics
        self.tracking_stats = {
            "total_tracks_created": 0,
            "successful_reidentifications": 0,
            "track_merges": 0,
            "track_splits": 0,
            "avg_track_lifetime": 0.0
        }
        
    async def initialize(self) -> None:
        """Initialize the tracking system."""
        try:
            self.reid_model.load_model()

            # Add any pre-loaded lost tracks to the ReID index (now that it's initialized)
            if self.lost_tracks:
                logger.info(f"Adding {len(self.lost_tracks)} pre-loaded horses to ReID index")
                for horse_id, track in self.lost_tracks.items():
                    self.reid_model.add_horse_to_index(horse_id, track.feature_vector)

            logger.info("Horse tracker initialized successfully")

        except Exception as error:
            logger.error(f"Failed to initialize horse tracker: {error}")
            raise
            
    def update_tracks(self, detections: List[Dict[str, Any]], frame: np.ndarray, timestamp: float) -> List[Dict[str, Any]]:
        """
        Update tracks with new detections using DeepSort algorithm.

        Args:
            detections: List of horse detections from current frame
            frame: Current video frame for feature extraction
            timestamp: Frame timestamp

        Returns:
            List of updated track information
        """
        try:
            # OPTIMIZATION: Only extract features when needed (not for all detections every frame)
            # Extract features lazily during association

            # Predict track positions (Kalman filter would go here)
            self._predict_track_positions(timestamp)

            # Associate detections with existing tracks using IoU (no ReID needed for close matches)
            matched_pairs, unmatched_detections, unmatched_tracks = self._associate_detections_optimized(
                detections, timestamp
            )

            # Update matched tracks
            updated_tracks = []
            for det_idx, track_id in matched_pairs:
                # Only extract features for matched tracks occasionally (every 10 frames)
                features = None
                if self.tracks[track_id].total_detections % 10 == 0:
                    features = self._extract_single_detection_features(detections[det_idx], frame)

                track = self._update_track(
                    self.tracks[track_id],
                    detections[det_idx],
                    features,  # None for most frames
                    timestamp,
                    frame  # Pass frame for thumbnail extraction
                )
                updated_tracks.append(self._track_to_output(track))

            # Handle unmatched detections - NOW extract features for ReID
            for det_idx in unmatched_detections:
                detection = detections[det_idx]
                features = self._extract_single_detection_features(detection, frame)

                # Try to reidentify from lost tracks
                reidentified_track = self._try_reidentification(features, detection, timestamp)

                if reidentified_track:
                    # Reactivate lost track
                    track = self._reactivate_track(reidentified_track, detection, features, timestamp, frame)
                    updated_tracks.append(self._track_to_output(track))
                    self.tracking_stats["successful_reidentifications"] += 1
                else:
                    # Create new track
                    new_track = self._create_new_track(detection, features, timestamp, frame)
                    updated_tracks.append(self._track_to_output(new_track))

            # Handle unmatched tracks (mark as lost)
            for track_id in unmatched_tracks:
                self._mark_track_lost(track_id, timestamp)

            # Clean up old tracks
            self._cleanup_old_tracks(timestamp)

            logger.debug(f"Track update: {len(updated_tracks)} active, {len(self.lost_tracks)} lost")
            return updated_tracks

        except Exception as error:
            logger.error(f"Track update failed: {error}")
            return []

    def _associate_detections_optimized(self, detections: List[Dict[str, Any]], timestamp: float) -> Tuple[List[Tuple[int, str]], List[int], List[str]]:
        """
        Associate detections with tracks using IoU first (fast), then ReID if needed.
        OPTIMIZATION: Avoid expensive ReID feature extraction for obvious matches.
        """
        if not detections or not self.tracks:
            # No associations possible
            unmatched_dets = list(range(len(detections)))
            unmatched_tracks = list(self.tracks.keys())
            return [], unmatched_dets, unmatched_tracks

        # Build IoU cost matrix (fast)
        n_detections = len(detections)
        n_tracks = len(self.tracks)
        iou_matrix = np.zeros((n_detections, n_tracks))

        track_ids = list(self.tracks.keys())
        for i, detection in enumerate(detections):
            det_bbox = detection["bbox"]
            for j, track_id in enumerate(track_ids):
                track = self.tracks[track_id]
                iou = self._calculate_iou(det_bbox, track.last_bbox)
                iou_matrix[i, j] = iou

        # Use Hungarian algorithm with IoU (inverted for cost)
        cost_matrix = 1.0 - iou_matrix  # Convert IoU to cost
        row_indices, col_indices = linear_sum_assignment(cost_matrix)

        # Filter matches by IoU threshold
        iou_threshold = 0.3  # Accept matches with >30% IoU
        matched_pairs = []
        unmatched_detections = set(range(n_detections))
        unmatched_tracks = set(track_ids)

        for row_idx, col_idx in zip(row_indices, col_indices):
            if iou_matrix[row_idx, col_idx] > iou_threshold:
                track_id = track_ids[col_idx]
                matched_pairs.append((row_idx, track_id))
                unmatched_detections.discard(row_idx)
                unmatched_tracks.discard(track_id)

        return matched_pairs, list(unmatched_detections), list(unmatched_tracks)

    def _calculate_iou(self, bbox1: Dict[str, float], bbox2: Dict[str, float]) -> float:
        """Calculate Intersection over Union between two bounding boxes."""
        x1_min = bbox1["x"]
        y1_min = bbox1["y"]
        x1_max = x1_min + bbox1["width"]
        y1_max = y1_min + bbox1["height"]

        x2_min = bbox2["x"]
        y2_min = bbox2["y"]
        x2_max = x2_min + bbox2["width"]
        y2_max = y2_min + bbox2["height"]

        # Calculate intersection
        x_inter_min = max(x1_min, x2_min)
        y_inter_min = max(y1_min, y2_min)
        x_inter_max = min(x1_max, x2_max)
        y_inter_max = min(y1_max, y2_max)

        if x_inter_max < x_inter_min or y_inter_max < y_inter_min:
            return 0.0

        intersection = (x_inter_max - x_inter_min) * (y_inter_max - y_inter_min)

        # Calculate union
        area1 = bbox1["width"] * bbox1["height"]
        area2 = bbox2["width"] * bbox2["height"]
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0.0

    def _extract_single_detection_features(self, detection: Dict[str, Any], frame: np.ndarray) -> np.ndarray:
        """Extract ReID features for a single detection."""
        try:
            bbox = detection["bbox"]
            x1, y1 = int(bbox["x"]), int(bbox["y"])
            x2, y2 = x1 + int(bbox["width"]), y1 + int(bbox["height"])

            # Extract horse crop
            horse_crop = frame[y1:y2, x1:x2]

            if horse_crop.size > 0:
                # Extract features using ReID model
                return self.reid_model.extract_features(horse_crop)
            else:
                # Fallback to random features
                return np.random.randn(512).astype(np.float32)

        except Exception as error:
            logger.warning(f"Feature extraction failed: {error}")
            return np.random.randn(512).astype(np.float32)
            
    def _extract_detection_features(self, detections: List[Dict[str, Any]], frame: np.ndarray) -> List[np.ndarray]:
        """Extract ReID features for all detections."""
        features = []
        
        for detection in detections:
            try:
                bbox = detection["bbox"]
                x1, y1 = int(bbox["x"]), int(bbox["y"])
                x2, y2 = x1 + int(bbox["width"]), y1 + int(bbox["height"])
                
                # Extract horse crop
                horse_crop = frame[y1:y2, x1:x2]
                
                if horse_crop.size > 0:
                    # Extract features using ReID model
                    feature_vector = self.reid_model.extract_features(horse_crop)
                    features.append(feature_vector)
                else:
                    # Fallback to random features
                    features.append(np.random.randn(512).astype(np.float32))
                    
            except Exception as error:
                logger.warning(f"Feature extraction failed for detection: {error}")
                features.append(np.random.randn(512).astype(np.float32))
                
        return features
        
    def _predict_track_positions(self, timestamp: float) -> None:
        """Predict track positions using motion model (simplified Kalman filter)."""
        for track in self.tracks.values():
            if len(track.velocity_history) >= 2:
                # Simple linear prediction based on velocity
                dt = timestamp - track.last_seen
                
                # Calculate velocity from position history
                if len(track.appearance_history) >= 2:
                    prev_pos = track.appearance_history[-2]["bbox"]
                    curr_pos = track.last_bbox
                    
                    vx = (curr_pos["x"] - prev_pos["x"]) / dt if dt > 0 else 0
                    vy = (curr_pos["y"] - prev_pos["y"]) / dt if dt > 0 else 0
                    
                    # Predict next position
                    track.predicted_bbox = {
                        "x": curr_pos["x"] + vx * dt,
                        "y": curr_pos["y"] + vy * dt,
                        "width": curr_pos["width"],
                        "height": curr_pos["height"]
                    }
                else:
                    track.predicted_bbox = track.last_bbox.copy()
                    
    def _associate_detections(self, detections: List[Dict[str, Any]], features: List[np.ndarray]) -> Tuple[List[Tuple[int, str]], List[int], List[str]]:
        """Associate detections with tracks using Hungarian algorithm."""
        if not self.tracks or not detections:
            return [], list(range(len(detections))), list(self.tracks.keys())
            
        # Build cost matrix (IoU + feature similarity)
        track_ids = list(self.tracks.keys())
        cost_matrix = np.full((len(detections), len(track_ids)), 10.0)  # High cost for no match
        
        for i, (detection, feature) in enumerate(zip(detections, features)):
            for j, track_id in enumerate(track_ids):
                track = self.tracks[track_id]
                
                # Calculate IoU cost
                iou = self._calculate_iou(detection["bbox"], getattr(track, 'predicted_bbox', track.last_bbox))
                iou_cost = 1.0 - iou  # Convert to cost (lower is better)
                
                # Calculate feature similarity cost  
                feature_similarity = self._cosine_similarity(feature, track.feature_vector)
                feature_cost = 1.0 - feature_similarity
                
                # Combined cost (weighted)
                combined_cost = 0.3 * iou_cost + 0.7 * feature_cost
                
                # Only consider if below threshold
                if combined_cost < (1.0 - self.similarity_threshold):
                    cost_matrix[i, j] = combined_cost
                    
        # Hungarian algorithm for optimal assignment
        row_indices, col_indices = linear_sum_assignment(cost_matrix)
        
        # Extract valid matches
        matched_pairs = []
        for row, col in zip(row_indices, col_indices):
            if cost_matrix[row, col] < 1.0:  # Valid match
                matched_pairs.append((row, track_ids[col]))
                
        # Find unmatched detections and tracks
        matched_detection_indices = {pair[0] for pair in matched_pairs}
        matched_track_ids = {pair[1] for pair in matched_pairs}
        
        unmatched_detections = [i for i in range(len(detections)) if i not in matched_detection_indices]
        unmatched_tracks = [tid for tid in track_ids if tid not in matched_track_ids]
        
        return matched_pairs, unmatched_detections, unmatched_tracks
        
    def _calculate_iou(self, bbox1: Dict[str, float], bbox2: Dict[str, float]) -> float:
        """Calculate Intersection over Union between two bounding boxes."""
        x1_1, y1_1 = bbox1["x"], bbox1["y"]
        x2_1, y2_1 = x1_1 + bbox1["width"], y1_1 + bbox1["height"]
        
        x1_2, y1_2 = bbox2["x"], bbox2["y"]
        x2_2, y2_2 = x1_2 + bbox2["width"], y1_2 + bbox2["height"]
        
        # Calculate intersection
        xi1 = max(x1_1, x1_2)
        yi1 = max(y1_1, y1_2)
        xi2 = min(x2_1, x2_2)
        yi2 = min(y2_1, y2_2)
        
        inter_area = max(0, xi2 - xi1) * max(0, yi2 - yi1)
        
        # Calculate union
        box1_area = bbox1["width"] * bbox1["height"]
        box2_area = bbox2["width"] * bbox2["height"]
        union_area = box1_area + box2_area - inter_area
        
        return inter_area / union_area if union_area > 0 else 0
        
    def _cosine_similarity(self, feat1: np.ndarray, feat2: np.ndarray) -> float:
        """Calculate cosine similarity between feature vectors."""
        dot_product = np.dot(feat1, feat2)
        norm1 = np.linalg.norm(feat1)
        norm2 = np.linalg.norm(feat2)
        
        if norm1 * norm2 == 0:
            return 0.0
            
        return dot_product / (norm1 * norm2)
        
    def _update_track(self, track: HorseTrack, detection: Dict[str, Any], features: Optional[np.ndarray],
                     timestamp: float, frame: Optional[np.ndarray] = None) -> HorseTrack:
        """Update existing track with new detection."""
        # Update position and timing
        track.last_bbox = detection["bbox"]
        track.last_seen = timestamp
        track.frames_since_seen = 0
        track.total_detections += 1

        # Update confidence with detection confidence
        detection_conf = detection.get("confidence", 0.5)
        track.confidence = 0.8 * track.confidence + 0.2 * detection_conf

        # PHASE 3: Update best thumbnail if this frame is better
        if frame is not None:
            self._update_best_thumbnail(track, detection, detection_conf, frame)

        # Update feature vector with exponential moving average (only if features provided)
        if features is not None:
            alpha = 0.8  # 80% old features, 20% new
            track.feature_vector = alpha * track.feature_vector + (1 - alpha) * features
            track.feature_vector = track.feature_vector / (np.linalg.norm(track.feature_vector) + 1e-8)
            track.feature_update_count += 1

            # Update ReID model index
            self.reid_model.add_horse_to_index(track.id, track.feature_vector)

        # Update appearance history
        track.appearance_history.append({
            "timestamp": timestamp,
            "bbox": detection["bbox"].copy(),
            "features": features.copy() if features is not None else track.feature_vector.copy(),
            "confidence": detection_conf
        })

        # Calculate velocity
        if len(track.appearance_history) >= 2:
            prev_appearance = track.appearance_history[-2]
            dt = timestamp - prev_appearance["timestamp"]

            if dt > 0:
                dx = detection["bbox"]["x"] - prev_appearance["bbox"]["x"]
                dy = detection["bbox"]["y"] - prev_appearance["bbox"]["y"]
                velocity = math.sqrt(dx**2 + dy**2) / dt
                track.velocity_history.append(velocity)

        # Update track confidence score
        track.track_confidence = self._calculate_track_confidence(track)

        return track
        
    def _try_reidentification(self, features: np.ndarray, detection: Dict[str, Any], timestamp: float) -> Optional[HorseTrack]:
        """
        Try to reidentify a detection with lost tracks.
        NOTE: Re-ID is stream-scoped - only searches within this stream's lost tracks.
        """
        if not self.lost_tracks:
            return None

        # STREAM-SCOPED RE-ID: Only searches lost tracks from current stream (self.stream_id)
        logger.debug(f"Attempting Re-ID within stream {self.stream_id} - {len(self.lost_tracks)} lost tracks")

        # Search for similar features in lost tracks
        best_match = None
        best_similarity = 0.0
        
        for track_id, track in self.lost_tracks.items():
            # Check if track was lost recently (within reasonable time window)
            time_since_lost = timestamp - track.last_seen
            if time_since_lost > 10.0:  # Don't reidentify tracks lost more than 10 seconds ago
                continue
                
            # Calculate feature similarity
            similarity = self._cosine_similarity(features, track.feature_vector)
            
            # Also check spatial proximity (track shouldn't teleport)
            spatial_distance = self._calculate_spatial_distance(detection["bbox"], track.last_bbox)
            max_movement = time_since_lost * 200  # Max 200 pixels/second movement
            
            if similarity > self.similarity_threshold and spatial_distance < max_movement and similarity > best_similarity:
                best_match = track
                best_similarity = similarity
                
        if best_match:
            logger.info(f"Reidentified horse {best_match.id} with similarity {best_similarity:.3f}")
            return best_match
            
        return None
        
    def _create_new_track(self, detection: Dict[str, Any], features: np.ndarray, timestamp: float,
                          frame: Optional[np.ndarray] = None) -> HorseTrack:
        """Create a new horse track with globally unique ID."""
        # Generate stream-scoped tracking ID to prevent collisions across streams
        # Format: {stream_id}_horse_{counter:03d}
        stream_prefix = self.stream_id.replace('-', '_')[:8]  # Use first 8 chars of stream ID
        track_id = f"{stream_prefix}_horse_{self.next_track_id:03d}"
        self.next_track_id += 1

        track = HorseTrack(
            id=track_id,
            tracking_id=self.next_track_id - 1,
            color=self._get_next_color(),
            feature_vector=features.copy(),
            last_bbox=detection["bbox"].copy(),
            last_seen=timestamp,
            confidence=detection.get("confidence", 0.5),
            first_appearance_features=features.copy()
        )

        # Initialize appearance history
        track.appearance_history.append({
            "timestamp": timestamp,
            "bbox": detection["bbox"].copy(),
            "features": features.copy(),
            "confidence": detection.get("confidence", 0.5)
        })

        # PHASE 3: Initialize best thumbnail for new track
        if frame is not None:
            detection_conf = detection.get("confidence", 0.5)
            self._update_best_thumbnail(track, detection, detection_conf, frame)

        # Add to tracking system
        self.tracks[track_id] = track
        self.reid_model.add_horse_to_index(track_id, features)

        # Update stats
        self.tracking_stats["total_tracks_created"] += 1

        logger.info(f"Created new horse track: {track_id} (stream: {self.stream_id}, tracking_id: {track.tracking_id})")
        return track
        
    def _reactivate_track(self, track: HorseTrack, detection: Dict[str, Any], features: np.ndarray,
                          timestamp: float, frame: Optional[np.ndarray] = None) -> HorseTrack:
        """Reactivate a lost track with new detection."""
        # Move from lost to active
        if track.id in self.lost_tracks:
            del self.lost_tracks[track.id]
        self.tracks[track.id] = track

        # Update track state
        track.state = "active"
        track.frames_since_seen = 0

        # Update with new detection
        return self._update_track(track, detection, features, timestamp, frame)
        
    def _mark_track_lost(self, track_id: str, timestamp: float) -> None:
        """Mark a track as lost."""
        if track_id not in self.tracks:
            return
            
        track = self.tracks[track_id]
        track.state = "lost"
        track.frames_since_seen += 1
        
        # If lost for too long, move to lost tracks
        if track.frames_since_seen >= self.max_lost_frames:
            self.lost_tracks[track_id] = self.tracks[track_id]
            del self.tracks[track_id]
            
            logger.debug(f"Moved track {track_id} to lost tracks")
            
    def _cleanup_old_tracks(self, timestamp: float) -> None:
        """Remove very old lost tracks to free memory."""
        cleanup_threshold = 30.0  # Remove tracks lost more than 30 seconds ago
        
        to_remove = []
        for track_id, track in self.lost_tracks.items():
            if timestamp - track.last_seen > cleanup_threshold:
                to_remove.append(track_id)
                
        for track_id in to_remove:
            track = self.lost_tracks[track_id]
            
            # Archive to history
            self.track_history.append(track)
            
            # Remove from lost tracks and ReID index
            del self.lost_tracks[track_id]
            self.reid_model.remove_horse_from_index(track_id)
            
            logger.debug(f"Archived old track: {track_id}")
            
    def _calculate_track_confidence(self, track: HorseTrack) -> float:
        """Calculate overall confidence score for a track."""
        factors = []
        
        # Detection confidence
        if track.appearance_history:
            recent_confidences = [app["confidence"] for app in list(track.appearance_history)[-5:]]
            avg_detection_conf = np.mean(recent_confidences)
            factors.append(avg_detection_conf)
            
        # Track longevity (longer tracks are more confident)
        longevity_factor = min(1.0, track.total_detections / 20.0)
        factors.append(longevity_factor)
        
        # Feature consistency (lower variance = higher confidence)
        if track.feature_update_count >= 3:
            feature_consistency = 1.0 / (1.0 + np.std([
                self._cosine_similarity(track.first_appearance_features, app["features"])
                for app in list(track.appearance_history)[-3:]
            ]))
            factors.append(feature_consistency)
            
        # Velocity consistency (horses don't teleport)
        if len(track.velocity_history) >= 3:
            velocity_std = np.std(list(track.velocity_history))
            velocity_consistency = 1.0 / (1.0 + velocity_std / 100.0)  # Normalize by 100 pixels
            factors.append(velocity_consistency)
            
        # Combine factors
        if factors:
            return np.mean(factors)
        else:
            return 0.5  # Default confidence for new tracks
            
    def _calculate_spatial_distance(self, bbox1: Dict[str, float], bbox2: Dict[str, float]) -> float:
        """Calculate spatial distance between bounding box centers."""
        center1 = (bbox1["x"] + bbox1["width"] / 2, bbox1["y"] + bbox1["height"] / 2)
        center2 = (bbox2["x"] + bbox2["width"] / 2, bbox2["y"] + bbox2["height"] / 2)
        
        dx = center1[0] - center2[0]
        dy = center1[1] - center2[1]
        
        return math.sqrt(dx**2 + dy**2)
        
    def _get_next_color(self) -> str:
        """Get next tracking color from palette."""
        color = self.TRACKING_COLORS[self.color_index % len(self.TRACKING_COLORS)]
        self.color_index += 1
        return color
        
    def _track_to_output(self, track: HorseTrack) -> Dict[str, Any]:
        """Convert track object to output format."""
        return {
            "id": track.id,
            "tracking_id": track.tracking_id,
            "color": track.color,
            "bbox": track.last_bbox.copy(),
            "confidence": track.confidence,
            "track_confidence": track.track_confidence,
            "state": track.state,
            "total_detections": track.total_detections,
            "frames_since_seen": track.frames_since_seen,
            "velocity": list(track.velocity_history)[-1] if track.velocity_history else 0.0,
            "is_new": track.total_detections == 1
        }
        
    def get_all_tracks(self, include_lost: bool = False) -> List[Dict[str, Any]]:
        """Get all current tracks."""
        tracks = [self._track_to_output(track) for track in self.tracks.values()]
        
        if include_lost:
            lost_tracks = [self._track_to_output(track) for track in self.lost_tracks.values()]
            tracks.extend(lost_tracks)
            
        return tracks
        
    def get_track_by_id(self, track_id: str) -> Optional[Dict[str, Any]]:
        """Get specific track by ID."""
        if track_id in self.tracks:
            return self._track_to_output(self.tracks[track_id])
        elif track_id in self.lost_tracks:
            return self._track_to_output(self.lost_tracks[track_id])
        else:
            return None
            
    def set_similarity_threshold(self, threshold: float) -> None:
        """Update similarity threshold for track association."""
        if 0.0 <= threshold <= 1.0:
            self.similarity_threshold = threshold
            logger.info(f"Updated similarity threshold to {threshold}")
        else:
            logger.warning(f"Invalid threshold {threshold}, must be between 0.0 and 1.0")
            
    def get_tracking_stats(self) -> Dict[str, Any]:
        """Get tracking performance statistics."""
        return {
            **self.tracking_stats,
            "active_tracks": len(self.tracks),
            "lost_tracks": len(self.lost_tracks),
            "archived_tracks": len(self.track_history),
            "similarity_threshold": self.similarity_threshold,
            "max_lost_frames": self.max_lost_frames,
            "reid_model_info": self.reid_model.get_model_info()
        }

    def _update_best_thumbnail(self, track: HorseTrack, detection: Dict[str, Any],
                               confidence: float, frame: np.ndarray) -> None:
        """
        Update best thumbnail for horse if this frame is better.
        Score = confidence * bbox_area (larger, more confident detections are better).

        Creates square crop with padding to avoid cutting off the horse.
        """
        try:
            bbox = detection["bbox"]
            bbox_area = bbox.get("width", 0) * bbox.get("height", 0)
            thumbnail_score = confidence * bbox_area

            # Update if this is better than current best
            if thumbnail_score > track.best_thumbnail_score:
                # Get frame dimensions
                frame_h, frame_w = frame.shape[:2]

                # Get bounding box coordinates
                bbox_x, bbox_y = int(bbox["x"]), int(bbox["y"])
                bbox_w, bbox_h = int(bbox["width"]), int(bbox["height"])

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

                    track.best_thumbnail_frame = thumbnail
                    track.best_thumbnail_bbox = bbox.copy()
                    track.best_thumbnail_score = thumbnail_score

                    logger.debug(f"Updated thumbnail for {track.id} (score: {thumbnail_score:.1f}, conf: {confidence:.2f})")

        except Exception as error:
            logger.debug(f"Failed to update thumbnail for {track.id}: {error}")

    def get_best_thumbnail(self, horse_id: str, quality: int = 80) -> Optional[bytes]:
        """
        Get best thumbnail for a horse as JPEG bytes.

        Args:
            horse_id: Horse track ID
            quality: JPEG quality (1-100, default 80)

        Returns:
            JPEG image bytes or None
        """
        track = self.tracks.get(horse_id) or self.lost_tracks.get(horse_id)
        if not track or track.best_thumbnail_frame is None:
            return None

        try:
            # Encode as JPEG
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
            success, encoded_image = cv2.imencode('.jpg', track.best_thumbnail_frame, encode_param)

            if success:
                return encoded_image.tobytes()
            else:
                logger.warning(f"Failed to encode thumbnail for {horse_id}")
                return None

        except Exception as error:
            logger.error(f"Failed to get thumbnail for {horse_id}: {error}")
            return None

    def _load_known_horses(self, known_horses: Dict[str, Dict[str, Any]]) -> None:
        """
        Load known horses from previous chunks to maintain cross-chunk continuity.

        Args:
            known_horses: Dict of {horse_id: horse_state} from Redis/PostgreSQL
        """
        try:
            logger.info(f"Loading {len(known_horses)} known horses for stream {self.stream_id}")

            max_tracking_id = 0

            for horse_id, horse_state in known_horses.items():
                # Extract horse data from state
                features = horse_state.get("features", [])
                if isinstance(features, list) and len(features) > 0:
                    feature_vector = np.array(features, dtype=np.float32)
                else:
                    # Skip horses without valid features
                    logger.warning(f"Skipping horse {horse_id} - no valid features")
                    continue

                # Parse tracking ID from horse_id (format: horse_001)
                try:
                    tracking_id = int(horse_id.split('_')[1])
                except (IndexError, ValueError):
                    tracking_id = self.next_track_id
                    self.next_track_id += 1

                # Track max ID to set next_track_id correctly
                max_tracking_id = max(max_tracking_id, tracking_id)

                # Create HorseTrack from state
                track = HorseTrack(
                    id=horse_id,
                    tracking_id=tracking_id,
                    color=self.TRACKING_COLORS[(tracking_id - 1) % len(self.TRACKING_COLORS)],
                    feature_vector=feature_vector,
                    last_bbox=horse_state.get("bbox", {}),
                    last_seen=horse_state.get("last_updated", time.time()),
                    confidence=horse_state.get("confidence", 0.5),
                    total_detections=horse_state.get("total_detections", 0),
                    track_confidence=horse_state.get("tracking_confidence", 1.0),
                    first_appearance_features=feature_vector.copy()
                )

                # Add to lost tracks initially (will be reactivated on detection)
                self.lost_tracks[horse_id] = track

                # Note: We don't add to ReID index here because it's not initialized yet.
                # Horses will be added to index when reidentified or when initialize() is called.

                logger.debug(f"Loaded known horse {horse_id} (tracking_id: {tracking_id})")

            # Set next_track_id to avoid conflicts
            self.next_track_id = max_tracking_id + 1
            self.color_index = max_tracking_id % len(self.TRACKING_COLORS)

            logger.info(f"Successfully loaded {len(self.lost_tracks)} known horses, next_track_id={self.next_track_id}")

        except Exception as error:
            logger.error(f"Failed to load known horses: {error}")

    def get_all_horse_states(self) -> Dict[str, Dict[str, Any]]:
        """
        Get current state of all horses for persistence (cross-chunk continuity).

        Returns:
            Dict of {horse_id: horse_state} suitable for saving to Redis/PostgreSQL
        """
        horse_states = {}

        # Get all active tracks
        for track_id, track in self.tracks.items():
            horse_states[track_id] = {
                "horse_id": track_id,
                "stream_id": self.stream_id,
                "tracking_id": track.tracking_id,
                "color": track.color,
                "last_updated": track.last_seen,
                "bbox": track.last_bbox.copy(),
                "confidence": track.confidence,
                "total_detections": track.total_detections,
                "features": track.feature_vector.tolist() if isinstance(track.feature_vector, np.ndarray) else [],
                "tracking_confidence": track.track_confidence,
                "state": track.state
            }

        # Include lost tracks (recently seen horses that might reappear)
        for track_id, track in self.lost_tracks.items():
            horse_states[track_id] = {
                "horse_id": track_id,
                "stream_id": self.stream_id,
                "tracking_id": track.tracking_id,
                "color": track.color,
                "last_updated": track.last_seen,
                "bbox": track.last_bbox.copy(),
                "confidence": track.confidence,
                "total_detections": track.total_detections,
                "features": track.feature_vector.tolist() if isinstance(track.feature_vector, np.ndarray) else [],
                "tracking_confidence": track.track_confidence,
                "state": track.state
            }

        return horse_states