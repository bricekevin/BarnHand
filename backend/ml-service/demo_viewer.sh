#!/bin/bash
# Demo script for Horse State Detection Timeline Viewer

echo "🐴 Horse State Detection Timeline Viewer Demo"
echo "============================================="
echo ""

echo "📁 Available files for analysis:"
echo "  Video: output_clean_states.mp4 (clean overlays)"
echo "  Timeline: timeline_clean_states.json (300 frames)"
echo "  Full Video: output_advanced_state_full.mp4 (entire video)"
echo "  Full Timeline: timeline_advanced_state_full.json (1,635 frames)"
echo ""

echo "🚀 Starting web viewer..."
python3 launch_viewer.py

echo ""
echo "💡 Instructions:"
echo "  1. The web browser should open automatically"
echo "  2. Select video file: output_clean_states.mp4"
echo "  3. Select timeline file: timeline_clean_states.json"  
echo "  4. Click 'Load & Analyze' to view synchronized data"
echo ""
echo "🎯 Features available:"
echo "  ✅ Synchronized video playback with timeline charts"
echo "  ✅ Interactive timeline charts for each horse"
echo "  ✅ Body state and head position analysis"
echo "  ✅ Confidence tracking over time"
echo "  ✅ State distribution visualization"
echo "  ✅ Export analysis reports"
echo "  ✅ Horse selection filtering"
echo "  ✅ Jump to next/previous events"
echo ""
echo "🔧 Generated with advanced state detection pipeline"
echo "📊 Timeline includes detection logic and confidence scores"