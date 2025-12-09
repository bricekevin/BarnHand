"""
Fast horse detection for PTZ auto-scan snapshots.

This module provides YOLO-only detection optimized for speed,
used during the auto-scan detection phase to quickly identify
which locations have horses present.

Unlike full processing, this:
- Only runs YOLO detection (no pose estimation, no ReID)
- Uses lower confidence threshold (0.3) for higher recall
- Optimized for single-image processing
- Returns within 500ms for 1080p images
"""

import time
from typing import Dict, Any, List, Tuple
import numpy as np
import cv2
from loguru import logger

from ..models.detection import HorseDetectionModel


class SnapshotDetector:
    """Fast horse detection for PTZ auto-scan snapshots."""

    def __init__(self, detection_model: HorseDetectionModel = None):
        """
        Initialize the snapshot detector.

        Args:
            detection_model: Optional existing HorseDetectionModel instance.
                           If not provided, a new one will be created.
        """
        self.detection_model = detection_model
        self._model_loaded = False

    def ensure_model_loaded(self) -> None:
        """Ensure the detection model is loaded."""
        if self.detection_model is None:
            logger.info("Creating new HorseDetectionModel for snapshot detection")
            self.detection_model = HorseDetectionModel()

        if not self._model_loaded:
            logger.info("Loading YOLO model for snapshot detection")
            self.detection_model.load_models()
            self._model_loaded = True

    def detect_horses_in_snapshot(
        self,
        image_bytes: bytes,
        confidence_threshold: float = 0.3
    ) -> Dict[str, Any]:
        """
        Detect horses in a snapshot image.

        Uses YOLO only - no pose estimation or ReID for maximum speed.

        Args:
            image_bytes: Raw image bytes (JPEG or PNG)
            confidence_threshold: Detection confidence threshold (default 0.3 for higher recall)

        Returns:
            Dictionary containing:
            - horses_detected: bool - whether any horses were found
            - count: int - number of horses detected
            - detections: list - individual detections with bbox and confidence
            - processing_time_ms: float - time taken for detection
        """
        start_time = time.time()

        try:
            self.ensure_model_loaded()

            # Decode image from bytes
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                return {
                    "horses_detected": False,
                    "count": 0,
                    "detections": [],
                    "processing_time_ms": (time.time() - start_time) * 1000,
                    "error": "Failed to decode image"
                }

            # Run detection with custom confidence threshold
            detections = self._run_detection(image, confidence_threshold)
            processing_time_ms = (time.time() - start_time) * 1000

            logger.info(
                f"Snapshot detection complete: {len(detections)} horses found "
                f"(conf >= {confidence_threshold}) in {processing_time_ms:.1f}ms"
            )

            return {
                "horses_detected": len(detections) > 0,
                "count": len(detections),
                "detections": detections,
                "processing_time_ms": processing_time_ms
            }

        except Exception as e:
            processing_time_ms = (time.time() - start_time) * 1000
            logger.error(f"Snapshot detection error: {e}")
            return {
                "horses_detected": False,
                "count": 0,
                "detections": [],
                "processing_time_ms": processing_time_ms,
                "error": str(e)
            }

    def _run_detection(
        self,
        frame: np.ndarray,
        confidence_threshold: float
    ) -> List[Dict[str, Any]]:
        """
        Run YOLO detection on a frame with custom confidence threshold.

        Args:
            frame: OpenCV image (BGR)
            confidence_threshold: Minimum confidence for detection

        Returns:
            List of detections with bbox and confidence
        """
        if self.detection_model is None or self.detection_model.model is None:
            raise RuntimeError("Detection model not loaded")

        # Run YOLO inference
        results = self.detection_model.model(frame, conf=confidence_threshold, verbose=False)

        # COCO class ID for horse: 17
        HORSE_CLASS_ID = 17

        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    confidence = float(box.conf[0].cpu().numpy())
                    class_id = int(box.cls[0].cpu().numpy())

                    # Only accept horses
                    if class_id == HORSE_CLASS_ID:
                        detections.append({
                            "bbox": [float(x1), float(y1), float(x2), float(y2)],
                            "confidence": confidence,
                            "class_name": "horse"
                        })

        # Sort by confidence (highest first)
        detections.sort(key=lambda d: d["confidence"], reverse=True)

        return detections

    def detect_horses_in_image(
        self,
        image: np.ndarray,
        confidence_threshold: float = 0.3
    ) -> Dict[str, Any]:
        """
        Detect horses in an already-decoded image.

        Args:
            image: OpenCV image (BGR numpy array)
            confidence_threshold: Detection confidence threshold

        Returns:
            Same format as detect_horses_in_snapshot
        """
        start_time = time.time()

        try:
            self.ensure_model_loaded()
            detections = self._run_detection(image, confidence_threshold)
            processing_time_ms = (time.time() - start_time) * 1000

            return {
                "horses_detected": len(detections) > 0,
                "count": len(detections),
                "detections": detections,
                "processing_time_ms": processing_time_ms
            }

        except Exception as e:
            processing_time_ms = (time.time() - start_time) * 1000
            logger.error(f"Image detection error: {e}")
            return {
                "horses_detected": False,
                "count": 0,
                "detections": [],
                "processing_time_ms": processing_time_ms,
                "error": str(e)
            }


# Module-level singleton for reuse across requests
_snapshot_detector: SnapshotDetector = None


def get_snapshot_detector() -> SnapshotDetector:
    """Get or create the singleton SnapshotDetector instance."""
    global _snapshot_detector
    if _snapshot_detector is None:
        _snapshot_detector = SnapshotDetector()
    return _snapshot_detector


def detect_horses_in_snapshot(
    image_bytes: bytes,
    confidence_threshold: float = 0.3
) -> Dict[str, Any]:
    """
    Convenience function for detecting horses in a snapshot.

    Args:
        image_bytes: Raw image bytes
        confidence_threshold: Detection confidence threshold (default 0.3)

    Returns:
        Detection results dict
    """
    detector = get_snapshot_detector()
    return detector.detect_horses_in_snapshot(image_bytes, confidence_threshold)
