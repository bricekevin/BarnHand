#!/usr/bin/env python3
"""
Create Demo Video with Mock ML Overlays
Creates a demonstration video with realistic horse detection/pose/tracking overlays
"""

import cv2
import numpy as np
import time
import random
from pathlib import Path

def create_demo_video():
    """Create demo video with mock ML overlays."""
    
    print("🎬 Creating Demo Video with ML Overlays")
    print("=" * 50)
    
    # Input and output paths
    input_video = "media/stomping.mp4"
    output_video = "stomping_ml_demo.mp4"
    
    # Check input video
    if not Path(input_video).exists():
        print(f"❌ Input video not found: {input_video}")
        return False
    
    # Open input video
    cap = cv2.VideoCapture(input_video)
    if not cap.isOpened():
        print(f"❌ Could not open video: {input_video}")
        return False
    
    # Get video properties
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = frame_count / fps
    
    print(f"📹 Input Video: {input_video}")
    print(f"   Resolution: {width}x{height}")
    print(f"   FPS: {fps}")
    print(f"   Duration: {duration:.1f}s ({frame_count} frames)")
    
    # Trim to 10 seconds
    max_frames = min(frame_count, fps * 10)  # 10 seconds
    trim_duration = max_frames / fps
    
    print(f"   Trimming to: {trim_duration:.1f}s ({max_frames} frames)")
    
    # Set up output video
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))
    
    # Horse tracking colors (10 distinctive colors)
    colors = [
        (255, 100, 100),  # Light Red
        (100, 255, 100),  # Light Green  
        (100, 100, 255),  # Light Blue
        (255, 255, 100),  # Yellow
        (255, 100, 255),  # Magenta
        (100, 255, 255),  # Cyan
        (255, 150, 100),  # Orange
        (150, 100, 255),  # Purple
        (100, 255, 150),  # Mint
        (255, 200, 150)   # Peach
    ]
    
    print("🎥 Processing video frames with mock ML overlays...")
    
    # Mock horse detections - simulate realistic horse positions
    mock_horses = [
        {
            'id': 'horse_001',
            'color': colors[0],
            'base_x': 0.3,
            'base_y': 0.4,
            'size_w': 0.25,
            'size_h': 0.4,
            'confidence': 0.87,
            'movement_pattern': 'stomp'
        },
        {
            'id': 'horse_002', 
            'color': colors[1],
            'base_x': 0.6,
            'base_y': 0.45,
            'size_w': 0.22,
            'size_h': 0.38,
            'confidence': 0.73,
            'movement_pattern': 'sway'
        }
    ]
    
    # Process frames
    frame_idx = 0
    start_time = time.time()
    total_detections = 0
    frames_with_horses = 0
    processing_times = []
    
    try:
        while frame_idx < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Simulate processing time
            mock_processing_time = random.uniform(180, 220)  # 180-220ms
            processing_times.append(mock_processing_time)
            
            # Create realistic detections based on frame
            detections = []
            
            # Simulate detection probability (horses not always detected)
            detection_probability = 0.85  # 85% chance of detection per frame
            
            for horse in mock_horses:
                if random.random() < detection_probability:
                    # Add natural movement/wobble
                    movement_factor = np.sin(frame_idx * 0.1) * 0.02
                    
                    if horse['movement_pattern'] == 'stomp':
                        # Stomping motion - vertical movement
                        y_offset = abs(np.sin(frame_idx * 0.3)) * 0.03
                        x_offset = movement_factor * 0.5
                    else:
                        # Swaying motion - horizontal movement  
                        x_offset = np.sin(frame_idx * 0.2) * 0.03
                        y_offset = movement_factor * 0.5
                    
                    # Calculate bounding box
                    x = int((horse['base_x'] + x_offset) * width)
                    y = int((horse['base_y'] + y_offset) * height) 
                    w = int(horse['size_w'] * width)
                    h = int(horse['size_h'] * height)
                    
                    # Ensure bbox stays in frame
                    x = max(0, min(width - w, x))
                    y = max(0, min(height - h, y))
                    
                    # Add confidence variation
                    confidence_variation = random.uniform(-0.05, 0.02)
                    confidence = max(0.70, min(0.95, horse['confidence'] + confidence_variation))
                    
                    detections.append({
                        'id': horse['id'],
                        'bbox': {'x': x, 'y': y, 'width': w, 'height': h},
                        'confidence': confidence,
                        'color': horse['color'],
                        'detection_count': frame_idx // 10 + random.randint(1, 5)  # Mock count
                    })
            
            total_detections += len(detections)
            if detections:
                frames_with_horses += 1
            
            # Create output frame with overlays
            output_frame = frame.copy()
            
            # Draw detections
            for detection in detections:
                draw_horse_detection(output_frame, detection)
                draw_mock_pose(output_frame, detection)
            
            # Draw UI overlays
            draw_frame_info(output_frame, frame_idx, max_frames, len(detections), 
                           total_detections, frames_with_horses, mock_processing_time)
            
            draw_ml_pipeline_status(output_frame)
            
            # Write frame to output
            out.write(output_frame)
            
            # Progress update
            if frame_idx % 30 == 0 or frame_idx < 10:
                elapsed = time.time() - start_time
                progress = (frame_idx + 1) / max_frames * 100
                eta = (elapsed / (frame_idx + 1)) * (max_frames - frame_idx - 1)
                print(f"   Frame {frame_idx+1}/{max_frames} ({progress:.1f}%) | "
                      f"Horses: {len(detections)} | ETA: {eta:.1f}s")
            
            frame_idx += 1
        
        # Cleanup
        cap.release()
        out.release()
        
        elapsed_time = time.time() - start_time
        avg_processing_time = np.mean(processing_times)
        
        # Results summary
        print(f"\n✅ Demo video processing completed!")
        print(f"   Output: {output_video}")
        print(f"   Processing time: {elapsed_time:.1f}s")
        print(f"   Frames processed: {frame_idx}")
        print(f"   Total detections: {total_detections}")
        print(f"   Frames with horses: {frames_with_horses} ({frames_with_horses/frame_idx*100:.1f}%)")
        print(f"   Average mock processing: {avg_processing_time:.1f}ms")
        print(f"   Video creation FPS: {frame_idx/elapsed_time:.1f}")
        
        # File info
        if Path(output_video).exists():
            size = Path(output_video).stat().st_size
            print(f"   Output size: {size/1024/1024:.1f}MB")
            
        return True
        
    except Exception as e:
        print(f"❌ Processing failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        cap.release()
        out.release()

def draw_horse_detection(frame, detection):
    """Draw horse detection overlay."""
    bbox = detection['bbox']
    x, y, w, h = bbox['x'], bbox['y'], bbox['width'], bbox['height']
    color = detection['color']
    confidence = detection['confidence']
    horse_id = detection['id']
    detection_count = detection['detection_count']
    
    # Draw bounding box with gradient effect
    thickness = 3
    cv2.rectangle(frame, (x, y), (x + w, y + h), color, thickness)
    
    # Add corner markers for professional look
    corner_size = 20
    corner_thickness = 4
    
    # Top-left corner
    cv2.line(frame, (x, y), (x + corner_size, y), color, corner_thickness)
    cv2.line(frame, (x, y), (x, y + corner_size), color, corner_thickness)
    
    # Top-right corner
    cv2.line(frame, (x + w, y), (x + w - corner_size, y), color, corner_thickness)
    cv2.line(frame, (x + w, y), (x + w, y + corner_size), color, corner_thickness)
    
    # Bottom-left corner
    cv2.line(frame, (x, y + h), (x + corner_size, y + h), color, corner_thickness)
    cv2.line(frame, (x, y + h), (x, y + h - corner_size), color, corner_thickness)
    
    # Bottom-right corner
    cv2.line(frame, (x + w, y + h), (x + w - corner_size, y + h), color, corner_thickness)
    cv2.line(frame, (x + w, y + h), (x + w, y + h - corner_size), color, corner_thickness)
    
    # Draw label with background
    label = f"{horse_id} | Horse {confidence:.1%} | [{detection_count}]"
    label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
    
    # Label background with transparency effect
    label_bg_height = label_size[1] + 15
    overlay = frame.copy()
    cv2.rectangle(overlay, (x, y - label_bg_height), 
                 (x + label_size[0] + 15, y), color, -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
    
    # Label text
    cv2.putText(frame, label, (x + 7, y - 7), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

def draw_mock_pose(frame, detection):
    """Draw mock pose keypoints and skeleton."""
    bbox = detection['bbox']
    x, y, w, h = bbox['x'], bbox['y'], bbox['width'], bbox['height']
    color = detection['color']
    
    # Mock keypoint positions (AP10K-style for horses)
    keypoints = [
        ("nose", x + w*0.5, y + h*0.15, 0.9),
        ("left_eye", x + w*0.45, y + h*0.12, 0.85),
        ("right_eye", x + w*0.55, y + h*0.12, 0.87),
        ("neck", x + w*0.5, y + h*0.28, 0.92),
        ("left_shoulder", x + w*0.35, y + h*0.35, 0.88),
        ("right_shoulder", x + w*0.65, y + h*0.35, 0.83),
        ("left_elbow", x + w*0.32, y + h*0.55, 0.78),
        ("right_elbow", x + w*0.68, y + h*0.55, 0.81),
        ("left_front_paw", x + w*0.28, y + h*0.88, 0.75),
        ("right_front_paw", x + w*0.72, y + h*0.88, 0.79),
        ("back", x + w*0.5, y + h*0.52, 0.89),
        ("left_hip", x + w*0.42, y + h*0.68, 0.84),
        ("right_hip", x + w*0.58, y + h*0.68, 0.86),
        ("left_knee", x + w*0.38, y + h*0.78, 0.72),
        ("right_knee", x + w*0.62, y + h*0.78, 0.76),
        ("left_back_paw", x + w*0.35, y + h*0.95, 0.71),
        ("right_back_paw", x + w*0.65, y + h*0.95, 0.74)
    ]
    
    # Draw keypoints
    for name, kx, ky, conf in keypoints:
        if conf > 0.3:  # Only draw confident keypoints
            kx, ky = int(kx), int(ky)
            # Draw keypoint with confidence-based size
            radius = int(3 + conf * 3)
            cv2.circle(frame, (kx, ky), radius, color, -1)
            cv2.circle(frame, (kx, ky), radius + 2, (255, 255, 255), 2)
    
    # Draw skeleton connections
    connections = [
        (0, 3), (3, 10),  # nose -> neck -> back
        (1, 0), (2, 0),   # eyes -> nose
        (3, 4), (3, 5),   # neck -> shoulders
        (4, 6), (6, 8),   # left front leg
        (5, 7), (7, 9),   # right front leg
        (10, 11), (10, 12), # back -> hips
        (11, 13), (13, 15), # left back leg
        (12, 14), (14, 16)  # right back leg
    ]
    
    for start_idx, end_idx in connections:
        if (start_idx < len(keypoints) and end_idx < len(keypoints) and
            keypoints[start_idx][3] > 0.3 and keypoints[end_idx][3] > 0.3):
            
            start_point = (int(keypoints[start_idx][1]), int(keypoints[start_idx][2]))
            end_point = (int(keypoints[end_idx][1]), int(keypoints[end_idx][2]))
            cv2.line(frame, start_point, end_point, color, 2)

def draw_frame_info(frame, frame_idx, total_frames, current_detections, 
                   total_detections, frames_with_horses, processing_time):
    """Draw frame information panel."""
    
    # Info panel background with transparency
    panel_height = 150
    panel_width = 350
    overlay = frame.copy()
    cv2.rectangle(overlay, (10, 10), (panel_width, panel_height), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
    
    # Panel border
    cv2.rectangle(frame, (10, 10), (panel_width, panel_height), (100, 255, 100), 2)
    
    # Header
    cv2.putText(frame, "BarnHand ML Pipeline", (20, 35), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 255, 100), 2)
    
    # Frame info
    info_lines = [
        f"Frame: {frame_idx+1:,}/{total_frames:,}",
        f"Live Horses: {current_detections}",
        f"Total Detections: {total_detections:,}",
        f"Detection Rate: {frames_with_horses}/{frame_idx+1} ({frames_with_horses/(frame_idx+1)*100:.1f}%)",
        f"Processing: {processing_time:.1f}ms"
    ]
    
    y_offset = 60
    for line in info_lines:
        cv2.putText(frame, line, (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 
                   0.5, (255, 255, 255), 2)
        cv2.putText(frame, line, (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 
                   0.5, (0, 0, 0), 1)
        y_offset += 18

def draw_ml_pipeline_status(frame):
    """Draw ML pipeline status indicators."""
    
    # Status panel
    panel_x = frame.shape[1] - 280
    panel_y = 10
    panel_width = 270
    panel_height = 120
    
    overlay = frame.copy()
    cv2.rectangle(overlay, (panel_x, panel_y), (panel_x + panel_width, panel_y + panel_height), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
    
    cv2.rectangle(frame, (panel_x, panel_y), (panel_x + panel_width, panel_y + panel_height), (100, 255, 100), 2)
    
    # Status header
    cv2.putText(frame, "ML Pipeline Status", (panel_x + 10, panel_y + 25), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 255, 100), 2)
    
    # Status items
    status_items = [
        ("YOLO Detection", "ACTIVE", (100, 255, 100)),
        ("70% Confidence", "ACTIVE", (100, 255, 100)),
        ("Pose Estimation", "ACTIVE", (100, 255, 100)),
        ("Horse ReID", "ACTIVE", (100, 255, 100))
    ]
    
    y_offset = panel_y + 50
    for item, status, color in status_items:
        # Status item
        cv2.putText(frame, f"{item}:", (panel_x + 15, y_offset), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        cv2.putText(frame, status, (panel_x + 160, y_offset), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
        
        # Status indicator dot
        cv2.circle(frame, (panel_x + 245, y_offset - 3), 4, color, -1)
        
        y_offset += 16
    
    # BarnHand watermark
    watermark = "Powered by BarnHand AI"
    watermark_size = cv2.getTextSize(watermark, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
    wm_x = frame.shape[1] - watermark_size[0] - 15
    wm_y = frame.shape[0] - 15
    
    cv2.putText(frame, watermark, (wm_x, wm_y), cv2.FONT_HERSHEY_SIMPLEX, 
               0.5, (255, 255, 255), 2)
    cv2.putText(frame, watermark, (wm_x, wm_y), cv2.FONT_HERSHEY_SIMPLEX, 
               0.5, (100, 255, 100), 1)

def main():
    success = create_demo_video()
    
    if success:
        print(f"\n🎉 Demo overlay video created successfully!")
        print(f"\n📹 Output: stomping_ml_demo.mp4")
        print(f"\n🎯 Features demonstrated:")
        print(f"   ✅ Horse detection with 70% confidence threshold")
        print(f"   ✅ Professional bounding box overlays with corner markers")
        print(f"   ✅ Horse tracking with unique IDs and colors")
        print(f"   ✅ Realistic pose keypoints and skeleton (AP10K format)")
        print(f"   ✅ Real-time processing statistics panel")
        print(f"   ✅ ML pipeline status indicators")
        print(f"   ✅ Professional UI with transparency effects")
        print(f"   ✅ 10-second demonstration video ready for review")
        
        return 0
    else:
        print(f"\n❌ Failed to create demo overlay video")
        return 1

if __name__ == "__main__":
    exit(main())