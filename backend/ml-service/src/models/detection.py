"""YOLO detection model for horse detection."""
import os
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import torch
import cv2
import numpy as np
from ultralytics import YOLO
from loguru import logger

from ..config.settings import settings


class HorseDetectionModel:
    """YOLOv5-based horse detection."""

    def __init__(self) -> None:
        self.device = self._setup_device()
        self.model: Optional[YOLO] = None
        self.performance_metrics = {
            "avg_time": 0.0,
            "total_detections": 0
        }

    def load_models(self) -> None:
        """Load YOLOv5 model."""
        try:
            model_path = Path(settings.model_path) / settings.yolo_model
            if not model_path.exists():
                raise RuntimeError(f"YOLO model not found: {model_path}")

            logger.info(f"Loading YOLOv5 model: {model_path}")
            self.model = YOLO(str(model_path))
            self.model.to(self.device)
            logger.info(f"YOLOv5 model loaded on {self.device}")

        except Exception as error:
            logger.error(f"Failed to load YOLO model: {error}")
            raise
            
    def _setup_device(self) -> torch.device:
        """Setup computation device based on configuration."""
        if settings.ml_device == "cuda" and torch.cuda.is_available():
            device = torch.device("cuda")
            logger.info(f"Using CUDA device: {torch.cuda.get_device_name()}")
        elif settings.ml_device == "auto":
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            device_name = torch.cuda.get_device_name() if torch.cuda.is_available() else "CPU"
            logger.info(f"Auto-selected device: {device} ({device_name})")
        else:
            device = torch.device("cpu")
            logger.info("Using CPU device")
            
        return device
        
    def detect_horses(self, frame: np.ndarray) -> Tuple[List[Dict[str, Any]], float]:
        """
        Detect horses in a frame using YOLOv5.

        Returns:
            Tuple of (detections, processing_time_ms)
        """
        start_time = time.time()

        try:
            if not self.model:
                raise RuntimeError("YOLO model not loaded")

            # Run detection
            results = self.model(frame, conf=settings.confidence_threshold, verbose=False)
            processing_time = (time.time() - start_time) * 1000

            # Extract horse detections
            # COCO class ID for horse: 17
            HORSE_CLASS_ID = 17

            detections = []
            all_detections_debug = []

            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        # Extract bounding box coordinates
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                        confidence = float(box.conf[0].cpu().numpy())
                        class_id = int(box.cls[0].cpu().numpy())

                        # Debug: log all detections above 10% to see what we're getting
                        if confidence > 0.1:
                            all_detections_debug.append({
                                "class_id": class_id,
                                "confidence": confidence,
                                "bbox_area": (x2-x1) * (y2-y1)
                            })

                        # Only accept horses with confidence above threshold
                        if class_id == HORSE_CLASS_ID and confidence >= settings.confidence_threshold:
                            bbox_width = float(x2 - x1)
                            bbox_height = float(y2 - y1)
                            bbox_area = bbox_width * bbox_height
                            aspect_ratio = bbox_width / bbox_height if bbox_height > 0 else 0

                            # Apply quality filters to reduce false positives
                            # Filter 1: Minimum area (avoid tiny detections like distant objects)
                            if bbox_area < 1000:  # 31x31 pixels minimum
                                logger.debug(f"Rejected detection: area too small ({bbox_area:.0f} < 1000)")
                                continue

                            # Filter 2: Aspect ratio check (horses are roughly 0.5:1 to 2.5:1)
                            # This filters out very wide objects (tires: 5:1) or very tall objects (posts: 1:5)
                            if aspect_ratio < 0.4 or aspect_ratio > 3.0:
                                logger.debug(f"Rejected detection: invalid aspect ratio ({aspect_ratio:.2f})")
                                continue

                            # Filter 3: Higher confidence for larger bounding boxes
                            # Large detections need lower confidence, small ones need higher
                            adjusted_threshold = settings.confidence_threshold
                            if bbox_area < 5000:  # Small detection
                                adjusted_threshold = min(0.85, settings.confidence_threshold + 0.15)

                            if confidence < adjusted_threshold:
                                logger.debug(f"Rejected detection: confidence too low ({confidence:.2f} < {adjusted_threshold:.2f} for area {bbox_area:.0f})")
                                continue

                            detection = {
                                "bbox": {
                                    "x": float(x1),
                                    "y": float(y1),
                                    "width": bbox_width,
                                    "height": bbox_height
                                },
                                "confidence": confidence,
                                "class_id": class_id,
                                "class_name": "horse",
                                # Quality metadata for tracking
                                "quality_metrics": {
                                    "area": bbox_area,
                                    "aspect_ratio": aspect_ratio,
                                    "adjusted_threshold": adjusted_threshold
                                }
                            }
                            detections.append(detection)

            # Debug logging
            if all_detections_debug:
                logger.debug(f"All detections found: {len(all_detections_debug)}")
                for i, det in enumerate(all_detections_debug[:5]):  # Log first 5
                    logger.debug(f"  Detection {i+1}: class_id={det['class_id']}, conf={det['confidence']:.3f}")
            else:
                logger.debug("No detections found by YOLO model")

            # Update performance metrics
            self._update_performance_metrics(processing_time, len(detections))

            logger.debug(f"Detection completed: {len(detections)} horses found in {processing_time:.1f}ms")
            return detections, processing_time

        except Exception as error:
            processing_time = (time.time() - start_time) * 1000
            logger.error(f"Detection failed after {processing_time:.1f}ms: {error}")
            raise
            
    def _update_performance_metrics(self, processing_time: float, detection_count: int) -> None:
        """Update rolling average performance metrics."""
        alpha = 0.1  # Smoothing factor for exponential moving average

        if self.performance_metrics["avg_time"] == 0:
            self.performance_metrics["avg_time"] = processing_time
        else:
            self.performance_metrics["avg_time"] = (
                (1 - alpha) * self.performance_metrics["avg_time"] +
                alpha * processing_time
            )
        self.performance_metrics["total_detections"] += detection_count

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model and performance."""
        return {
            "model": "YOLOv5",
            "device": str(self.device),
            "loaded": self.model is not None,
            "path": settings.yolo_model,
            "avg_time_ms": round(self.performance_metrics["avg_time"], 2),
            "total_detections": self.performance_metrics["total_detections"],
            "configuration": {
                "confidence_threshold": settings.confidence_threshold,
                "target_fps": settings.target_fps,
                "batch_size": settings.batch_size
            }
        }