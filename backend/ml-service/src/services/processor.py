"""Main ML processing service for chunk analysis."""
import asyncio
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
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
from .horse_database import HorseDatabaseService


class ChunkProcessor:
    """Main processor for analyzing video chunks."""
    
    def __init__(self) -> None:
        self.detection_model = HorseDetectionModel()
        self.pose_model = HorsePoseModel()
        self.horse_tracker = HorseTracker()
        self.horse_db = HorseDatabaseService()
        
        # Pose analysis components
        self.pose_analyzers = {}  # Per-horse analyzers
        self.gait_classifiers = {}  # Per-horse gait classifiers
        self.pose_validator = PoseValidator()
        
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
            logger.info("Initializing ML models and tracking system...")
            
            # Load detection models
            self.detection_model.load_models()
            
            # Load pose model
            self.pose_model.load_model()
            
            # Initialize horse tracker
            await self.horse_tracker.initialize()
            
            # Initialize database service
            await self.horse_db.initialize()
            
            logger.info("ML models and tracking system initialized successfully")
            
        except Exception as error:
            logger.error(f"Failed to initialize ML models: {error}")
            raise
            
    async def process_chunk(self, chunk_path: str, chunk_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a video chunk for horse detection and pose analysis.
        
        Args:
            chunk_path: Path to video chunk file
            chunk_metadata: Metadata about the chunk (stream_id, start_time, etc.)
            
        Returns:
            Processing results with detections and overlays
        """
        start_time = time.time()
        chunk_id = str(uuid.uuid4())
        
        logger.info(f"Processing chunk: {chunk_path}", 
                   chunk_id=chunk_id,
                   stream_id=chunk_metadata.get("stream_id"),
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
            
            for frame_idx, frame in enumerate(frames):
                frame_start = time.time()
                frame_timestamp = chunk_metadata.get("start_time", 0) + (frame_idx / fps if fps > 0 else frame_idx * 0.033)
                
                # Detect horses in frame
                detections, detection_time = self.detection_model.detect_horses(frame)
                total_detections += len(detections)
                
                # Update horse tracking with detections
                tracked_horses = self.horse_tracker.update_tracks(detections, frame, frame_timestamp)
                total_tracks = len(tracked_horses)
                
                # Estimate poses for each tracked horse
                frame_poses = []
                for track_info in tracked_horses:
                    pose_data, pose_time = self.pose_model.estimate_pose(frame, track_info["bbox"])
                    if pose_data:
                        pose_data["horse_id"] = track_info["id"]
                        pose_data["tracking_id"] = track_info["tracking_id"]
                        
                        # Analyze pose biomechanics
                        horse_id = track_info["id"]
                        
                        # Get or create analyzer for this horse
                        if horse_id not in self.pose_analyzers:
                            self.pose_analyzers[horse_id] = PoseAnalyzer()
                            self.gait_classifiers[horse_id] = GaitClassifier()
                        
                        # Validate pose
                        keypoints = np.array(pose_data["keypoints"])
                        prev_keypoints = None
                        if len(frame_poses) > 0 and "keypoints" in frame_poses[-1]:
                            prev_keypoints = np.array(frame_poses[-1]["keypoints"])
                        
                        validation_result = self.pose_validator.validate(keypoints, prev_keypoints)
                        
                        # Use corrected keypoints if available
                        if validation_result.corrected_keypoints is not None:
                            keypoints = validation_result.corrected_keypoints
                            pose_data["keypoints"] = keypoints.tolist()
                        
                        # Analyze pose if valid
                        if validation_result.is_valid:
                            # Biomechanical analysis
                            pose_metrics = self.pose_analyzers[horse_id].analyze_pose(keypoints, frame_timestamp)
                            
                            # Gait classification
                            self.gait_classifiers[horse_id].add_pose(keypoints, frame_timestamp)
                            gait_metrics = self.gait_classifiers[horse_id].classify(fps)
                            
                            # Add analysis to pose data
                            pose_data["biomechanics"] = {
                                "joint_angles": pose_metrics.joint_angles,
                                "stride_length": pose_metrics.stride_length,
                                "back_angle": pose_metrics.back_angle,
                                "head_height": pose_metrics.head_height,
                                "center_of_mass": pose_metrics.center_of_mass,
                                "velocity": pose_metrics.velocity,
                                "confidence": pose_metrics.confidence
                            }
                            
                            if gait_metrics:
                                pose_data["gait"] = {
                                    "type": gait_metrics.gait_type.value,
                                    "action": gait_metrics.action_type.value,
                                    "stride_frequency": gait_metrics.stride_frequency,
                                    "symmetry_score": gait_metrics.symmetry_score,
                                    "regularity_score": gait_metrics.regularity_score,
                                    "confidence": gait_metrics.confidence
                                }
                        
                        # Add validation info
                        pose_data["validation"] = {
                            "is_valid": validation_result.is_valid,
                            "confidence": validation_result.confidence,
                            "issues": validation_result.issues[:3] if validation_result.issues else []  # Limit issues
                        }
                        
                        frame_poses.append(pose_data)
                        
                    # Save horse to database if new or updated
                    if track_info["is_new"] or track_info["total_detections"] % 10 == 0:  # Save every 10 detections
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
            
            # Generate overlay data for frontend
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
            logger.error(f"Chunk processing failed after {processing_time:.1f}ms: {error}",
                        chunk_id=chunk_id,
                        chunk_path=chunk_path)
            
            return {
                "chunk_id": chunk_id,
                "stream_id": chunk_metadata.get("stream_id"),
                "status": "failed",
                "error": str(error),
                "processing_time_ms": processing_time,
                "processed_at": time.time()
            }
            
    async def _load_video_chunk(self, chunk_path: str) -> Tuple[List[np.ndarray], float]:
        """Load video chunk and extract frames."""
        frames = []
        fps = 0.0
        
        try:
            cap = cv2.VideoCapture(chunk_path)
            if not cap.isOpened():
                raise ValueError(f"Could not open video file: {chunk_path}")
                
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            logger.debug(f"Loading video chunk: {frame_count} frames at {fps} FPS")
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frames.append(frame)
                
            cap.release()
            
            logger.debug(f"Loaded {len(frames)} frames from chunk")
            return frames, fps
            
        except Exception as error:
            logger.error(f"Failed to load video chunk: {error}")
            return [], 0.0
            
    def _generate_overlay_data(self, frame_results: List[Dict[str, Any]], chunk_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Generate overlay data for frontend visualization with tracking."""
        
        # Extract all unique horses across frames from tracking data
        unique_horses = self._extract_tracked_horses(frame_results)
        
        # Create tracking data structure
        overlay_data = {
            "version": "2.0",  # Updated version with tracking
            "chunk_id": chunk_metadata.get("chunk_id"),
            "stream_id": chunk_metadata.get("stream_id"), 
            "horses": unique_horses,
            "tracking_stats": self.horse_tracker.get_tracking_stats(),
            "frames": []
        }
        
        # Process each frame for overlay
        for frame_result in frame_results:
            frame_overlay = {
                "frame_index": frame_result["frame_index"],
                "timestamp": frame_result["timestamp"],
                "objects": []
            }
            
            # Add tracked horses with poses
            for horse in frame_result.get("tracked_horses", []):
                obj_data = {
                    "type": "tracked_horse",
                    "horse_id": horse["id"],
                    "tracking_id": horse["tracking_id"],
                    "bbox": horse["bbox"],
                    "confidence": horse["confidence"],
                    "track_confidence": horse["track_confidence"],
                    "color": horse["color"],
                    "state": horse["state"],
                    "is_new": horse["is_new"]
                }
                
                # Add pose data if available
                pose = next((p for p in frame_result["poses"] if p.get("horse_id") == horse["id"]), None)
                if pose:
                    obj_data["pose"] = {
                        "keypoints": pose["keypoints"],
                        "skeleton": self.pose_model.SKELETON,
                        "gait_type": pose["gait_type"],
                        "velocity": pose["velocity"]
                    }
                    
                frame_overlay["objects"].append(obj_data)
                
            overlay_data["frames"].append(frame_overlay)
            
        return overlay_data
        
    def _extract_tracked_horses(self, frame_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract unique horses from tracking data across all frames."""
        unique_horses = {}
        
        for frame_result in frame_results:
            for horse in frame_result.get("tracked_horses", []):
                horse_id = horse["id"]
                
                if horse_id not in unique_horses:
                    unique_horses[horse_id] = {
                        "id": horse_id,
                        "tracking_id": horse["tracking_id"],
                        "color": horse["color"],
                        "first_seen_frame": frame_result["frame_index"],
                        "last_seen_frame": frame_result["frame_index"],
                        "total_detections": horse["total_detections"],
                        "track_confidence": horse["track_confidence"],
                        "state": horse["state"]
                    }
                else:
                    # Update last seen frame
                    unique_horses[horse_id]["last_seen_frame"] = frame_result["frame_index"]
                    unique_horses[horse_id]["total_detections"] = horse["total_detections"]
                    unique_horses[horse_id]["track_confidence"] = horse["track_confidence"]
                    unique_horses[horse_id]["state"] = horse["state"]
                    
        return list(unique_horses.values())
        
    def _assign_tracking_color(self, tracking_id: Optional[str]) -> str:
        """Assign consistent color for horse tracking."""
        # Color palette for up to 10 horses
        colors = [
            "#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57",
            "#ff9ff3", "#54a0ff", "#5f27cd", "#00d2d3", "#ff9f43"
        ]
        
        if not tracking_id:
            return colors[0]
            
        # Use hash of tracking_id for consistent color assignment
        color_index = hash(tracking_id) % len(colors)
        return colors[color_index]
        
    def _count_unique_horses(self, frame_results: List[Dict[str, Any]]) -> int:
        """Count unique horses across all frames using tracking data."""
        unique_horse_ids = set()
        for frame_result in frame_results:
            for horse in frame_result.get("tracked_horses", []):
                unique_horse_ids.add(horse["id"])
                    
        return len(unique_horse_ids)
        
    def _update_stats(self, processing_time: float, fps: float, detections: int, tracks: int) -> None:
        """Update processing statistics."""
        alpha = 0.1  # Smoothing factor
        
        self.processing_stats["chunks_processed"] += 1
        self.processing_stats["total_detections"] += detections
        self.processing_stats["total_tracks"] = tracks
        
        # Update rolling averages
        if self.processing_stats["avg_processing_time"] == 0:
            self.processing_stats["avg_processing_time"] = processing_time
        else:
            self.processing_stats["avg_processing_time"] = (
                (1 - alpha) * self.processing_stats["avg_processing_time"] + 
                alpha * processing_time
            )
            
        if self.processing_stats["avg_fps"] == 0:
            self.processing_stats["avg_fps"] = fps
        else:
            self.processing_stats["avg_fps"] = (
                (1 - alpha) * self.processing_stats["avg_fps"] + 
                alpha * fps
            )
            
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics."""
        return {
            **self.processing_stats,
            "avg_processing_time": round(self.processing_stats["avg_processing_time"], 2),
            "avg_fps": round(self.processing_stats["avg_fps"], 2),
            "detection_model": self.detection_model.get_model_info(),
            "pose_model": self.pose_model.get_performance_info(),
            "tracking_stats": self.horse_tracker.get_tracking_stats()
        }
        
    async def batch_process_chunks(self, chunk_paths: List[str], chunk_metadata_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process multiple chunks in batch for efficiency."""
        if len(chunk_paths) != len(chunk_metadata_list):
            raise ValueError("chunk_paths and chunk_metadata_list must have same length")
            
        logger.info(f"Starting batch processing of {len(chunk_paths)} chunks")
        batch_start = time.time()
        
        # Process chunks concurrently (limited by batch_size)
        batch_size = min(settings.batch_size, len(chunk_paths))
        results = []
        
        for i in range(0, len(chunk_paths), batch_size):
            batch_paths = chunk_paths[i:i + batch_size]
            batch_metadata = chunk_metadata_list[i:i + batch_size]
            
            # Process batch concurrently
            batch_tasks = [
                self.process_chunk(path, metadata) 
                for path, metadata in zip(batch_paths, batch_metadata)
            ]
            
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            # Handle any exceptions in results
            for j, result in enumerate(batch_results):
                if isinstance(result, Exception):
                    logger.error(f"Batch processing error for chunk {i + j}: {result}")
                    results.append({
                        "status": "failed",
                        "error": str(result),
                        "chunk_path": batch_paths[j]
                    })
                else:
                    results.append(result)
                    
        batch_time = (time.time() - batch_start) * 1000
        logger.info(f"Batch processing completed: {len(results)} chunks in {batch_time:.1f}ms")
        
        return results
        
    async def _save_horse_to_database(self, track_info: Dict[str, Any], timestamp: float) -> None:
        """Save horse tracking information to database."""
        try:
            horse_data = {
                "tracking_id": track_info["id"],
                "stream_id": track_info.get("stream_id"),
                "color": track_info["color"],
                "feature_vector": track_info.get("feature_vector"),
                "total_detections": track_info["total_detections"],
                "track_confidence": track_info["track_confidence"],
                "metadata": {
                    "tracking_id": track_info["tracking_id"],
                    "state": track_info["state"],
                    "velocity": track_info.get("velocity", 0.0)
                }
            }
            
            await self.horse_db.save_horse(horse_data)
            
            # Save appearance data
            appearance_data = {
                "timestamp": timestamp,
                "features": track_info.get("feature_vector"),
                "confidence": track_info["confidence"],
                "bbox": track_info["bbox"]
            }
            
            await self.horse_db.save_horse_appearance(track_info["id"], appearance_data)
            
        except Exception as error:
            logger.warning(f"Failed to save horse {track_info['id']} to database: {error}")
            
    async def update_similarity_threshold(self, threshold: float) -> bool:
        """Update similarity threshold for horse tracking."""
        success1 = await self.horse_db.update_similarity_threshold(threshold)
        self.horse_tracker.set_similarity_threshold(threshold)
        
        logger.info(f"Updated similarity threshold to {threshold}")
        return success1
        
    async def merge_horses(self, primary_id: str, secondary_id: str) -> bool:
        """Merge two horse tracks that are the same horse."""
        return await self.horse_db.merge_horse_tracks(primary_id, secondary_id)
        
    async def split_horse(self, horse_id: str, split_timestamp: float) -> Optional[str]:
        """Split a horse track that was incorrectly merged."""
        return await self.horse_db.split_horse_track(horse_id, split_timestamp)