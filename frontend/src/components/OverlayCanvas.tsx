import React, { useRef, useEffect, useCallback } from 'react';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Keypoint {
  x: number;
  y: number;
  confidence: number;
}

interface Detection {
  id: string;
  horseId: string;
  bbox: BoundingBox;
  pose?: {
    keypoints: Keypoint[];
  };
  confidence: number;
  trackingId: string;
  horse_name?: string; // Optional horse name from registry (Phase 3)
}

interface OverlayCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  detections: Detection[];
  showPose?: boolean;
  showTrackingIds?: boolean;
  className?: string;
}

// Horse tracking colors
const HORSE_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#6366F1', // indigo
];

// RTMPose AP10K keypoint connections for horse skeleton
const SKELETON_CONNECTIONS = [
  // Head
  [0, 1],
  [1, 2], // nose to eyes
  [0, 3],
  [0, 4], // nose to ears

  // Neck to body
  [5, 6],
  [5, 7],
  [6, 8], // neck connections
  [7, 9],
  [8, 10], // withers to back
  [9, 11],
  [10, 12], // back to hip

  // Front legs
  [7, 13],
  [13, 14],
  [14, 15], // left front leg
  [8, 16],
  [16, 17],
  [17, 18], // right front leg

  // Back legs
  [11, 19],
  [19, 20],
  [20, 21], // left back leg
  [12, 22],
  [22, 23],
  [23, 24], // right back leg
];

export const OverlayCanvas: React.FC<OverlayCanvasProps> = ({
  videoRef,
  detections,
  showPose = true,
  showTrackingIds = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);

  const getHorseColor = useCallback((trackingId: string) => {
    const hash = trackingId
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return HORSE_COLORS[hash % HORSE_COLORS.length];
  }, []);

  const drawDetections = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const video = videoRef?.current;
    if (!video) {
      // Clear canvas if no video
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get video dimensions for scaling
    const videoWidth = video.videoWidth || video.offsetWidth;
    const videoHeight = video.videoHeight || video.offsetHeight;
    const scaleX = canvas.width / videoWidth;
    const scaleY = canvas.height / videoHeight;

    detections.forEach(detection => {
      const color = getHorseColor(detection.trackingId);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;

      // Scale bounding box coordinates
      const bbox = {
        x: detection.bbox.x * scaleX,
        y: detection.bbox.y * scaleY,
        width: detection.bbox.width * scaleX,
        height: detection.bbox.height * scaleY,
      };

      // Draw bounding box
      ctx.beginPath();
      ctx.rect(bbox.x, bbox.y, bbox.width, bbox.height);
      ctx.stroke();

      // Draw confidence background
      const confidence = Math.round(detection.confidence * 100);
      const labelText = `${confidence}%`;
      ctx.font = '12px JetBrains Mono, monospace';
      const textWidth = ctx.measureText(labelText).width;

      ctx.fillStyle = color;
      ctx.fillRect(bbox.x, bbox.y - 20, textWidth + 8, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(labelText, bbox.x + 4, bbox.y - 8);

      // Draw tracking ID and horse name if enabled
      if (showTrackingIds) {
        // Extract tracking number from tracking_id (e.g., "horse_003" -> "#3")
        const trackingMatch = detection.trackingId.match(/(\d+)/);
        const trackingNumber = trackingMatch ? `#${parseInt(trackingMatch[1])}` : detection.trackingId;

        // Format: "Horse #3 - Thunder" or "Horse #3" if unnamed
        const displayName = detection.horse_name
          ? `Horse ${trackingNumber} - ${detection.horse_name}`
          : `Horse ${trackingNumber}`;

        ctx.font = '11px JetBrains Mono, monospace';
        const nameWidth = ctx.measureText(displayName).width;

        ctx.fillStyle = color; // Solid background with tracking color
        ctx.fillRect(bbox.x, bbox.y + bbox.height + 2, nameWidth + 8, 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(displayName, bbox.x + 4, bbox.y + bbox.height + 14);
      }

      // Draw pose skeleton if available and enabled
      if (showPose && detection.pose && detection.pose.keypoints.length > 0) {
        const keypoints = detection.pose.keypoints.map(kp => ({
          ...kp,
          x: kp.x * scaleX,
          y: kp.y * scaleY,
        }));

        // Draw skeleton connections
        ctx.strokeStyle = color + 'CC'; // Semi-transparent
        ctx.lineWidth = 1.5;

        SKELETON_CONNECTIONS.forEach(([startIdx, endIdx]) => {
          const startPoint = keypoints[startIdx];
          const endPoint = keypoints[endIdx];

          if (
            startPoint &&
            endPoint &&
            startPoint.confidence > 0.3 &&
            endPoint.confidence > 0.3
          ) {
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.stroke();
          }
        });

        // Draw keypoints
        keypoints.forEach((keypoint, idx) => {
          if (keypoint.confidence > 0.3) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(keypoint.x, keypoint.y, 3, 0, 2 * Math.PI);
            ctx.fill();

            // Draw keypoint index for debugging
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '8px monospace';
            ctx.fillText(idx.toString(), keypoint.x + 4, keypoint.y - 4);
          }
        });
      }
    });

    // Request next frame
    animationFrameRef.current = requestAnimationFrame(() => drawDetections());
  }, [detections, showPose, showTrackingIds, getHorseColor, videoRef]);

  useEffect(() => {
    // Start animation loop
    drawDetections();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawDetections]);

  // Handle canvas resize when video dimensions change
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && video) {
        const rect = video.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(video);

    return () => {
      resizeObserver.disconnect();
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute top-0 left-0 pointer-events-none ${className}`}
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  );
};
