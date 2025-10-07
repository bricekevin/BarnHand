#!/usr/bin/env python3
"""
Advanced Horse State Detection Pipeline
Integrates YOLO + RTMPose + Wildlife ReID + Advanced State Detection
Processes video with configurable state detection and outputs timeline data
"""

import os
import sys
import cv2
import torch
import numpy as np
from pathlib import Path
import json
import argparse
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import yaml

# Set environment variables with correct capitalization  
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'
os.environ['MODEL_PATH'] = './models'
os.environ['YOLO_MODEL'] = 'downloads/yolov5m.pt'

# Add src to path
sys.path.insert(0, 'src')

from src.models.detection import HorseDetectionModel
from src.models.pose import RealRTMPoseModel
from src.models.advanced_state_detection import (
    AdvancedStateTracker, BodyState, HeadPosition, TemporalAction
)

# Import Wildlife ReID components from the working script
from test_wildlifereid_pipeline import MegaDescriptorReID

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import components from working script to maintain compatibility
from test_wildlifereid_pipeline import WildlifeTrackedHorse, WildlifeHorseTracker

class AdvancedStatePipeline:
    """Complete pipeline with advanced state detection"""
    
    def __init__(self, config_path: Optional[str] = None):
        """Initialize pipeline with all components"""
        
        logger.info("Initializing Advanced State Detection Pipeline...")
        
        # Load configuration
        self.config_path = config_path
        self.config = self._load_config(config_path)
        
        # Initialize tracker (this handles all models internally)
        logger.info("Initializing complete Wildlife ReID tracker...")
        self.tracker = WildlifeHorseTracker(max_horses=5, similarity_threshold=0.6)
        
        # Initialize state tracker
        self.state_tracker = AdvancedStateTracker(config_path)
        
        # Statistics
        self.frame_count = 0
        self.total_horses_tracked = 0
        
    def _load_config(self, config_path: Optional[str]) -> Dict:
        """Load configuration"""
        if config_path and Path(config_path).exists():
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        else:
            # Return default config structure
            return {
                'display': {
                    'colors': {
                        'standing': [0, 255, 0],
                        'walking': [255, 200, 0],
                        'running': [255, 100, 0],
                        'lying_down': [128, 128, 255],
                        'head_up': [0, 255, 255],
                        'head_down': [0, 128, 255]
                    },
                    'font': {
                        'scale': 0.7,
                        'thickness': 2
                    }
                }
            }
    
    def draw_state_overlay(self, frame: np.ndarray, horse) -> np.ndarray:
        """Draw clean state information - just basics"""
        
        if not hasattr(horse, 'state_result') or not horse.state_result:
            return frame
        
        # Get bbox coordinates
        if horse.last_bbox:
            x1, y1 = int(horse.last_bbox['x']), int(horse.last_bbox['y'])
            x2, y2 = x1 + int(horse.last_bbox['width']), y1 + int(horse.last_bbox['height'])
        else:
            return frame
        
        # Get colors from config
        body_color = self.config['display']['colors'].get(
            horse.state_result.body_state.value.replace('_', ''),
            [255, 255, 255]
        )
        
        # Draw bounding box with state color
        cv2.rectangle(frame, (x1, y1), (x2, y2), body_color, 3)
        
        # Simple info box above horse
        info_x = x1
        info_y = y1 - 80
        info_width = 300
        info_height = 70
        
        # Adjust position if too close to top
        if info_y < 10:
            info_y = y2 + 10
        
        # Adjust position if too close to right edge
        if info_x + info_width > frame.shape[1]:
            info_x = frame.shape[1] - info_width - 10
        
        # Draw pose keypoints if available
        if hasattr(horse, 'last_pose_result') and horse.last_pose_result:
            keypoints = horse.last_pose_result.get('keypoints', [])
            
            if keypoints and len(keypoints) > 0:
                # Draw keypoints as small circles
                for i, (x, y) in enumerate(keypoints):
                    if x > 0 and y > 0:  # Valid keypoint
                        # Use different colors for different body parts
                        if i < 5:  # Head/neck keypoints
                            kp_color = (0, 255, 255)  # Yellow
                        elif i < 11:  # Front legs
                            kp_color = (255, 0, 0)    # Blue  
                        else:  # Back legs/body
                            kp_color = (0, 255, 0)    # Green
                            
                        cv2.circle(frame, (int(x), int(y)), 4, kp_color, -1)
                        cv2.circle(frame, (int(x), int(y)), 4, (255, 255, 255), 1)  # White border
        
        # Optional: Draw a small horse ID next to the bounding box (minimal text)
        cv2.putText(frame, f"#{horse.horse_id}", (x1, y1 - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, body_color, 2)
        
        return frame
    
    def draw_timeline_bar(self, frame: np.ndarray, states_history: Dict[int, List]) -> np.ndarray:
        """Draw timeline bar showing state transitions"""
        height, width = frame.shape[:2]
        bar_height = 40
        bar_y = height - bar_height - 10
        
        # Create timeline background
        cv2.rectangle(frame, (10, bar_y), (width - 10, bar_y + bar_height), (0, 0, 0), -1)
        cv2.rectangle(frame, (10, bar_y), (width - 10, bar_y + bar_height), (255, 255, 255), 1)
        
        # Draw timeline for each horse
        if states_history:
            num_horses = len(states_history)
            horse_bar_height = bar_height // max(1, num_horses)
            
            for idx, (horse_id, history) in enumerate(states_history.items()):
                y_offset = bar_y + idx * horse_bar_height
                
                # Draw horse ID
                cv2.putText(frame, f"H{horse_id}", (15, y_offset + 15), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                
                # Draw state blocks
                if history:
                    block_width = max(2, (width - 100) // len(history))
                    for i, state in enumerate(history[-100:]):  # Last 100 states
                        x = 50 + i * block_width
                        color = self.config['display']['colors'].get(
                            state.replace('_', ''),
                            [128, 128, 128]
                        )
                        cv2.rectangle(frame, (x, y_offset + 2), 
                                    (x + block_width - 1, y_offset + horse_bar_height - 2),
                                    color, -1)
        
        return frame
    
    def process_frame(self, frame: np.ndarray, frame_idx: int) -> Tuple[np.ndarray, List[Dict]]:
        """Process single frame through complete pipeline"""
        
        self.frame_count += 1
        timestamp = frame_idx / 30.0  # Assuming 30 fps
        
        # Use the WildlifeHorseTracker's process_frame method directly
        tracked_horses, output_frame = self.tracker.process_frame(frame, frame_idx)
        
        # Process state for each tracked horse
        frame_states = []
        for horse in tracked_horses:
            if horse.last_pose and horse.last_bbox:
                # Prepare pose data with bbox
                pose_with_bbox = horse.last_pose.copy()
                pose_with_bbox['bbox'] = horse.last_bbox
                
                # Detect state
                state_result = self.state_tracker.update_horse_state(
                    horse.horse_id, pose_with_bbox, frame_idx, timestamp
                )
                horse.state_result = state_result
                frame_states.append(state_result.to_dict())
            else:
                # Create minimal state result if no pose data
                logger.debug(f"No pose data for horse {horse.horse_id}")
                continue
        
        # Remove any existing text overlays by drawing a black rectangle over the top area
        cv2.rectangle(output_frame, (0, 0), (output_frame.shape[1], 80), (0, 0, 0), -1)
        
        # Add advanced state overlays to the frame
        for horse in tracked_horses:
            if hasattr(horse, 'state_result') and horse.state_result:
                output_frame = self.draw_state_overlay(output_frame, horse)
        
        # Draw clean header only
        cv2.putText(output_frame, f"Advanced Horse State Detection - Frame {self.frame_count}", 
                   (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(output_frame, f"Active Horses: {len(tracked_horses)}", 
                   (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
        
        return output_frame, frame_states
    
    def process_video(self, video_path: str, output_path: str, 
                     timeline_output: str, max_frames: Optional[int] = None):
        """Process entire video and save results"""
        
        logger.info(f"Processing video: {video_path}")
        
        # Open video
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Failed to open video: {video_path}")
            return
        
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if max_frames:
            total_frames = min(total_frames, max_frames)
        
        logger.info(f"Video: {width}x{height} @ {fps}fps, {total_frames} frames")
        
        # Create video writer with web-compatible codec
        fourcc = cv2.VideoWriter_fourcc(*'avc1')  # H.264 codec for web compatibility
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        # If H.264 fails, try alternative codecs
        if not out.isOpened():
            logger.warning("H.264 codec failed, trying mp4v")
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        # Process frames
        frame_idx = 0
        all_timeline_data = []
        
        try:
            while cap.isOpened() and frame_idx < total_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Process frame
                processed_frame, frame_states = self.process_frame(frame, frame_idx)
                
                # Save timeline data
                all_timeline_data.extend(frame_states)
                
                # Write frame
                out.write(processed_frame)
                
                # Show progress
                if frame_idx % 30 == 0:
                    progress = (frame_idx / total_frames) * 100
                    logger.info(f"Progress: {progress:.1f}% ({frame_idx}/{total_frames})")
                
                # Display (optional)
                if frame_idx % 5 == 0:  # Show every 5th frame
                    display_frame = cv2.resize(processed_frame, (1280, 720))
                    cv2.imshow('Advanced State Detection', display_frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break
                
                frame_idx += 1
                
        finally:
            # Cleanup
            cap.release()
            out.release()
            cv2.destroyAllWindows()
            
            # Save timeline data
            self.state_tracker.save_timeline_data(timeline_output, format='json')
            
            # Also save detection and pose data
            full_timeline_path = timeline_output.replace('.json', '_full.json')
            with open(full_timeline_path, 'w') as f:
                json.dump(all_timeline_data, f, indent=2)
            
            logger.info(f"Processing complete!")
            logger.info(f"Output video: {output_path}")
            logger.info(f"Timeline data: {timeline_output}")
            logger.info(f"Full timeline: {full_timeline_path}")
            
            # Print summary
            self.print_summary()
    
    def print_summary(self):
        """Print processing summary"""
        logger.info("\n" + "="*50)
        logger.info("PROCESSING SUMMARY")
        logger.info("="*50)
        logger.info(f"Total frames processed: {self.frame_count}")
        logger.info(f"Total horses tracked: {len(self.tracker.horses)}")
        
        # State distribution
        all_states = self.state_tracker.get_all_states()
        if all_states:
            logger.info("\nFinal Horse States:")
            for horse_id, state in all_states.items():
                logger.info(f"  Horse {horse_id}:")
                logger.info(f"    Body: {state.body_state.value} ({state.body_confidence:.2f})")
                logger.info(f"    Head: {state.head_position.value} ({state.head_confidence:.2f})")
                if state.action_1s:
                    logger.info(f"    Action: {state.action_1s.value}")
                if state.alerts:
                    logger.info(f"    Alerts: {', '.join(state.alerts)}")

def main():
    parser = argparse.ArgumentParser(description='Advanced Horse State Detection Pipeline')
    parser.add_argument('input_video', help='Path to input video')
    parser.add_argument('--output', default='output_advanced_state.mp4', help='Output video path')
    parser.add_argument('--timeline', default='timeline_data.json', help='Timeline output path')
    parser.add_argument('--config', help='Path to configuration YAML file')
    parser.add_argument('--max-frames', type=int, help='Maximum frames to process')
    
    args = parser.parse_args()
    
    # Create pipeline
    pipeline = AdvancedStatePipeline(config_path=args.config)
    
    # Process video
    pipeline.process_video(
        args.input_video,
        args.output,
        args.timeline,
        max_frames=args.max_frames
    )

if __name__ == "__main__":
    main()