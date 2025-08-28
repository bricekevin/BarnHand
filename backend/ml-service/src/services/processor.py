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


class ChunkProcessor:
    """Main processor for analyzing video chunks."""
    
    def __init__(self) -> None:
        self.detection_model = HorseDetectionModel()
        self.pose_model = HorsePoseModel()
        self.processing_stats = {
            "chunks_processed": 0,
            "total_detections": 0,
            "avg_processing_time": 0.0,
            "avg_fps": 0.0
        }
        
    async def initialize(self) -> None:
        """Initialize ML models."""
        try:
            logger.info("Initializing ML models...")
            
            # Load detection models
            self.detection_model.load_models()
            
            # Load pose model
            self.pose_model.load_model()
            
            logger.info("ML models initialized successfully")
            
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
                
            # Process each frame for detections and poses
            frame_results = []
            total_detections = 0
            
            for frame_idx, frame in enumerate(frames):
                frame_start = time.time()
                
                # Detect horses in frame
                detections, detection_time = self.detection_model.detect_horses(frame)
                total_detections += len(detections)
                
                # Estimate poses for each detected horse
                frame_poses = []
                for detection in detections:
                    pose_data, pose_time = self.pose_model.estimate_pose(frame, detection["bbox"])
                    if pose_data:
                        pose_data["detection_id"] = detection.get("id", f"det_{frame_idx}_{len(frame_poses)}")
                        frame_poses.append(pose_data)
                        
                frame_time = (time.time() - frame_start) * 1000
                
                frame_result = {
                    "frame_index": frame_idx,
                    "timestamp": frame_idx / fps if fps > 0 else frame_idx * 0.033,  # Assume 30fps fallback
                    "detections": detections,
                    "poses": frame_poses,
                    "processing_time_ms": frame_time
                }
                frame_results.append(frame_result)
                
            # Generate chunk summary
            processing_time = (time.time() - start_time) * 1000
            chunk_fps = len(frames) / (processing_time / 1000) if processing_time > 0 else 0
            
            # Update performance metrics
            self._update_stats(processing_time, chunk_fps, total_detections)
            
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
                "unique_horses": self._count_unique_horses(frame_results),
                "frame_results": frame_results,
                "overlay_data": overlay_data,
                "model_info": {
                    "detection_model": self.detection_model.get_model_info(),
                    "pose_model": self.pose_model.get_performance_info()
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
        """Generate overlay data for frontend visualization."""
        
        # Extract all unique horses across frames
        unique_horses = self._extract_unique_horses(frame_results)
        
        # Create tracking data structure
        overlay_data = {
            "version": "1.0",
            "chunk_id": chunk_metadata.get("chunk_id"),
            "stream_id": chunk_metadata.get("stream_id"), 
            "horses": unique_horses,
            "frames": []
        }
        
        # Process each frame for overlay
        for frame_result in frame_results:
            frame_overlay = {
                "frame_index": frame_result["frame_index"],
                "timestamp": frame_result["timestamp"],
                "objects": []
            }
            
            # Add detection boxes and poses
            for detection in frame_result["detections"]:
                obj_data = {
                    "type": "horse_detection",
                    "tracking_id": detection.get("tracking_id", f"det_{frame_result['frame_index']}"),
                    "bbox": detection["bbox"],
                    "confidence": detection["confidence"],
                    "color": self._assign_tracking_color(detection.get("tracking_id"))
                }
                
                # Add pose data if available
                pose = next((p for p in frame_result["poses"] if p.get("detection_id") == detection.get("id")), None)
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
        
    def _extract_unique_horses(self, frame_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract unique horses across all frames."""
        # For mock data, create some consistent horses
        return [
            {
                "tracking_id": "horse_001",
                "name": "Thunder", 
                "color": "#ff6b6b",
                "first_seen_frame": 0,
                "last_seen_frame": len(frame_results) - 1
            },
            {
                "tracking_id": "horse_002", 
                "name": "Luna",
                "color": "#4ecdc4", 
                "first_seen_frame": 2,
                "last_seen_frame": len(frame_results) - 1
            }
        ]
        
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
        """Count unique horses across all frames."""
        unique_tracking_ids = set()
        for frame_result in frame_results:
            for detection in frame_result["detections"]:
                tracking_id = detection.get("tracking_id")
                if tracking_id:
                    unique_tracking_ids.add(tracking_id)
                    
        return len(unique_tracking_ids)
        
    def _update_stats(self, processing_time: float, fps: float, detections: int) -> None:
        """Update processing statistics."""
        alpha = 0.1  # Smoothing factor
        
        self.processing_stats["chunks_processed"] += 1
        self.processing_stats["total_detections"] += detections
        
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
            "pose_model": self.pose_model.get_performance_info()
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