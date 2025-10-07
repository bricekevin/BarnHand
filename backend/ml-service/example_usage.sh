#!/bin/bash
# Example usage of the Advanced Horse State Detection Pipeline

echo "🐴 Advanced Horse State Detection Pipeline Examples"
echo "================================================="

# Basic usage
echo "1. Basic usage with default config:"
echo "LOG_LEVEL=INFO python test_advanced_state_pipeline.py horse_video.mp4"
echo ""

# With custom configuration
echo "2. With custom configuration file:"
echo "LOG_LEVEL=INFO python test_advanced_state_pipeline.py horse_video.mp4 \\"
echo "    --config config/state_tracking_config.yaml \\"
echo "    --output output_with_states.mp4 \\"
echo "    --timeline timeline_states.json"
echo ""

# Process short clip for testing
echo "3. Process short clip (first 300 frames):"
echo "LOG_LEVEL=INFO python test_advanced_state_pipeline.py horse_video.mp4 \\"
echo "    --max-frames 300 \\"
echo "    --output quick_test.mp4 \\"
echo "    --timeline quick_timeline.json"
echo ""

# Analyze results
echo "4. Analyze timeline results:"
echo "python analyze_timeline.py timeline_states.json"
echo ""

echo "📁 Configuration file: config/state_tracking_config.yaml"
echo "📊 Timeline format: JSON with detection, pose, and state data"
echo "🎥 Output: Video with state overlays + timeline data"
echo ""

echo "🔧 Key tuning parameters in config/state_tracking_config.yaml:"
echo "  - movement_threshold_pixels: 5 (sensitivity for detecting movement)"
echo "  - lying_aspect_ratio: 1.3 (width/height ratio for lying detection)"
echo "  - head_angle_threshold: 110 (degrees for 'looking back' detection)"
echo "  - smoothing_frames_body: 15 (frames for state smoothing)"
echo "  - confidence thresholds for each state type"
echo ""

echo "📋 States detected:"
echo "  Body: standing_still, moving, walking, running, lying_down, kneeling, jumping"
echo "  Head: head_up, head_down, head_left, head_right, head_left_back, head_right_back"
echo "  Actions: walking_pattern, running_pattern, pawing_ground, looking_back_at_abdomen"
echo ""

echo "⚠️ Alert patterns (configurable):"
echo "  - Horse lying down + looking back (possible colic)"
echo "  - Horse pawing + looking back (discomfort)"
echo "  - Repetitive rolling behavior"