"""YOLO detection models for horse detection."""
import os
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Literal
import torch
import cv2
import numpy as np
from ultralytics import YOLO
from loguru import logger

from ..config.settings import settings


class HorseDetectionModel:
    """YOLO-based horse detection with dual model support."""
    
    def __init__(self) -> None:
        self.device = self._setup_device()
        self.primary_model: Optional[YOLO] = None
        self.fallback_model: Optional[YOLO] = None
        self.current_model = "primary"
        self.performance_metrics = {
            "primary_avg_time": 0.0,
            "fallback_avg_time": 0.0,
            "primary_detections": 0,
            "fallback_detections": 0
        }
        
    def load_models(self) -> None:
        """Load both primary and fallback YOLO models."""
        try:
            # Load primary model (YOLO11)
            primary_path = Path(settings.model_path) / settings.yolo_model
            if primary_path.exists():
                logger.info(f"Loading primary YOLO model: {primary_path}")
                self.primary_model = YOLO(str(primary_path))
                self.primary_model.to(self.device)
                logger.info(f"Primary model loaded on {self.device}")
            else:
                logger.warning(f"Primary model not found: {primary_path}")
                
            # Load fallback model (YOLOv5) 
            fallback_path = Path(settings.model_path) / settings.yolo_fallback
            if fallback_path.exists():
                logger.info(f"Loading fallback YOLO model: {fallback_path}")
                self.fallback_model = YOLO(str(fallback_path))
                self.fallback_model.to(self.device)
                logger.info(f"Fallback model loaded on {self.device}")
            else:
                logger.warning(f"Fallback model not found: {fallback_path}")
                
            if not self.primary_model and not self.fallback_model:
                raise RuntimeError("No YOLO models could be loaded")
                
        except Exception as error:
            logger.error(f"Failed to load YOLO models: {error}")
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
        Detect horses in a frame using YOLO.
        
        Returns:
            Tuple of (detections, processing_time_ms)
        """
        start_time = time.time()
        
        try:
            # Get active model
            model = self._get_active_model()
            if not model:
                raise RuntimeError("No YOLO model available")
                
            # Run detection
            results = model(frame, conf=settings.confidence_threshold, verbose=False)
            processing_time = (time.time() - start_time) * 1000
            
            # Extract horse detections with 70% confidence threshold
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
                        
                        # STRICT FILTERING: Only accept horses with 70%+ confidence
                        if class_id == HORSE_CLASS_ID and confidence >= settings.confidence_threshold:
                            detection = {
                                "bbox": {
                                    "x": float(x1),
                                    "y": float(y1), 
                                    "width": float(x2 - x1),
                                    "height": float(y2 - y1)
                                },
                                "confidence": confidence,
                                "class_id": class_id,
                                "class_name": "horse",
                                "model_used": self.current_model,
                                "is_primary_horse": True
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
            self._update_performance_metrics(processing_time)
            
            logger.debug(f"Detection completed: {len(detections)} horses found in {processing_time:.1f}ms")
            return detections, processing_time
            
        except Exception as error:
            processing_time = (time.time() - start_time) * 1000
            logger.error(f"Detection failed after {processing_time:.1f}ms: {error}")
            
            # Try fallback model if primary failed
            if self.current_model == "primary" and self.fallback_model:
                logger.info("Switching to fallback model due to primary model failure")
                self.current_model = "fallback"
                return self.detect_horses(frame)
                
            raise
            
    def _get_active_model(self) -> Optional[YOLO]:
        """Get the currently active YOLO model."""
        if self.current_model == "primary" and self.primary_model:
            return self.primary_model
        elif self.current_model == "fallback" and self.fallback_model:
            return self.fallback_model
        elif self.primary_model:
            self.current_model = "primary"
            return self.primary_model
        elif self.fallback_model:
            self.current_model = "fallback"
            return self.fallback_model
        else:
            return None
            
    def _update_performance_metrics(self, processing_time: float) -> None:
        """Update rolling average performance metrics."""
        alpha = 0.1  # Smoothing factor for exponential moving average
        
        if self.current_model == "primary":
            if self.performance_metrics["primary_avg_time"] == 0:
                self.performance_metrics["primary_avg_time"] = processing_time
            else:
                self.performance_metrics["primary_avg_time"] = (
                    (1 - alpha) * self.performance_metrics["primary_avg_time"] + 
                    alpha * processing_time
                )
            self.performance_metrics["primary_detections"] += 1
            
        else:  # fallback model
            if self.performance_metrics["fallback_avg_time"] == 0:
                self.performance_metrics["fallback_avg_time"] = processing_time
            else:
                self.performance_metrics["fallback_avg_time"] = (
                    (1 - alpha) * self.performance_metrics["fallback_avg_time"] + 
                    alpha * processing_time
                )
            self.performance_metrics["fallback_detections"] += 1
            
    def switch_model(self, model_type: Literal["primary", "fallback"]) -> bool:
        """Switch between primary and fallback models."""
        if model_type == "primary" and self.primary_model:
            self.current_model = "primary"
            logger.info("Switched to primary model (YOLO11)")
            return True
        elif model_type == "fallback" and self.fallback_model:
            self.current_model = "fallback" 
            logger.info("Switched to fallback model (YOLOv5)")
            return True
        else:
            logger.warning(f"Cannot switch to {model_type} model (not available)")
            return False
            
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about loaded models and performance."""
        return {
            "current_model": self.current_model,
            "device": str(self.device),
            "models": {
                "primary": {
                    "loaded": self.primary_model is not None,
                    "path": settings.yolo_model,
                    "avg_time_ms": round(self.performance_metrics["primary_avg_time"], 2),
                    "detections": self.performance_metrics["primary_detections"]
                },
                "fallback": {
                    "loaded": self.fallback_model is not None,
                    "path": settings.yolo_fallback, 
                    "avg_time_ms": round(self.performance_metrics["fallback_avg_time"], 2),
                    "detections": self.performance_metrics["fallback_detections"]
                }
            },
            "configuration": {
                "confidence_threshold": settings.confidence_threshold,
                "target_fps": settings.target_fps,
                "batch_size": settings.batch_size
            }
        }