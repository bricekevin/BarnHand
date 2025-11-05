"""Frame renderer for drawing detection overlays on video frames."""
import cv2
import numpy as np
from typing import List, Dict, Any
from loguru import logger


class FrameRenderer:
    """Renders detection and pose overlays on video frames."""

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

    def __init__(self):
        """Initialize frame renderer."""
        pass

    def draw_overlays(
        self,
        frame: np.ndarray,
        tracked_horses: List[Dict],
        frame_poses: List[Dict]
    ) -> np.ndarray:
        """
        Draw detection, tracking, and pose overlays on frame.

        Args:
            frame: Input frame (numpy array)
            tracked_horses: List of tracked horse detections
            frame_poses: List of pose estimations for horses

        Returns:
            Frame with overlays drawn
        """
        # Create overlay map for poses
        pose_map = {pose["horse_id"]: pose for pose in frame_poses}

        # Draw each tracked horse
        for track in tracked_horses:
            # Use global ID, not numeric counter
            horse_id = str(track.get("id", "unknown"))
            horse_name = track.get("horse_name")
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

                # Draw horse label (name if available, otherwise ID)
                label = horse_name if horse_name else f"#{horse_id}"
                cv2.putText(frame, label, (x, y - 10),
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

    def render_detection_overlay(
        self,
        frame: np.ndarray,
        detection: Dict[str, Any],
        horse_color: tuple = (0, 255, 0),
        horse_name: str = None
    ) -> np.ndarray:
        """
        Render a single detection overlay on a frame.

        Args:
            frame: Input frame
            detection: Detection dict with bbox and metadata
            horse_color: Color for overlay (BGR tuple)
            horse_name: Optional horse name to display

        Returns:
            Frame with overlay drawn
        """
        bbox = detection.get("bbox", {})
        if not bbox:
            return frame

        x = int(bbox.get("x", 0))
        y = int(bbox.get("y", 0))
        w = int(bbox.get("width", 0))
        h = int(bbox.get("height", 0))

        # Draw bbox rectangle
        cv2.rectangle(frame, (x, y), (x + w, y + h), horse_color, 3)

        # Draw label
        label = horse_name if horse_name else f"Horse {detection.get('id', '?')}"
        cv2.putText(frame, label, (x, y - 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, horse_color, 2)

        return frame
