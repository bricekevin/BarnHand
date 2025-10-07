#!/bin/bash

echo "🐴 Integrated Horse State Detection System Demo"
echo "=============================================="
echo ""

echo "🎯 This system provides a complete workflow:"
echo "   1️⃣ Upload: Drag & drop horse video files"
echo "   2️⃣ Configure: Set processing parameters" 
echo "   3️⃣ Process: Real-time AI analysis with progress monitoring"
echo "   4️⃣ Analyze: Interactive timeline charts with synchronized video"
echo ""

echo "📋 System Requirements:"
echo "   ✅ Python 3.8+ with required packages"
echo "   ✅ YOLO and RTMPose AI models"
echo "   ✅ Flask web framework"
echo "   ✅ Modern web browser"
echo ""

echo "🎬 Supported Video Formats:"
echo "   • MP4, MOV, AVI, MKV"
echo "   • Up to 500MB file size" 
echo "   • 720p-1080p resolution recommended"
echo "   • 30 FPS for optimal analysis"
echo ""

echo "🚀 Starting the integrated system..."
echo ""

# Check if the required files exist
if [ ! -f "launch_integrated.py" ]; then
    echo "❌ launch_integrated.py not found"
    echo "   Make sure you're in the ml-service directory"
    exit 1
fi

if [ ! -f "processing_server.py" ]; then
    echo "❌ processing_server.py not found"
    echo "   Required server file is missing"
    exit 1
fi

if [ ! -f "integrated_viewer.html" ]; then
    echo "❌ integrated_viewer.html not found"
    echo "   Required web interface file is missing"
    exit 1
fi

echo "✅ All required files found"
echo ""

echo "🌐 The system will:"
echo "   • Start Flask server on http://localhost:5000"
echo "   • Open web interface automatically"
echo "   • Provide real-time processing feedback"
echo "   • Generate interactive analysis results"
echo ""

echo "💡 Demo Workflow:"
echo "   1. Upload a horse video file (drag & drop)"
echo "   2. Configure processing (try 300 frames for quick demo)"
echo "   3. Click 'Start Processing' and watch progress"
echo "   4. Review synchronized video and timeline charts"
echo "   5. Export analysis reports and download results"
echo ""

echo "🛑 Press Ctrl+C to stop the server when done"
echo ""

echo "⏳ Launching in 3 seconds..."
sleep 3

# Launch the integrated system
python3 launch_integrated.py