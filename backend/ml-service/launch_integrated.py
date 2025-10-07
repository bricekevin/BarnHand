#!/usr/bin/env python3
"""
Launch the Integrated Horse State Detection System
Complete upload → process → analyze workflow in one interface
"""

import os
import webbrowser
import threading
import time
import subprocess
import sys
from pathlib import Path

def check_dependencies():
    """Check if required dependencies are available"""
    required_files = [
        'test_advanced_state_pipeline.py',
        'config/state_tracking_config.yaml',
        'integrated_viewer.html',
        'processing_server.py'
    ]
    
    missing = []
    for file in required_files:
        if not Path(file).exists():
            missing.append(file)
    
    if missing:
        print("❌ Missing required files:")
        for file in missing:
            print(f"   - {file}")
        return False
    
    # Check if models are available
    models_path = Path('../../models/downloads')
    required_models = ['yolov5m.pt', 'rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.pth']
    
    missing_models = []
    for model in required_models:
        if not (models_path / model).exists():
            missing_models.append(model)
    
    if missing_models:
        print("⚠️ Missing AI models (processing may fail):")
        for model in missing_models:
            print(f"   - {model}")
        print("   Run the model download script to get required models")
        return False
    
    return True

def install_requirements():
    """Install required Python packages"""
    try:
        print("📦 Installing required packages...")
        subprocess.check_call([
            sys.executable, '-m', 'pip', 'install', 
            'flask', 'flask-cors', 'werkzeug'
        ])
        return True
    except Exception as e:
        print(f"❌ Failed to install packages: {e}")
        return False

def start_server():
    """Start the processing server"""
    try:
        print("🚀 Starting integrated processing server...")
        subprocess.run([sys.executable, 'processing_server.py'])
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")

def open_browser_delayed():
    """Open browser after server startup delay"""
    time.sleep(3)  # Wait for server to start
    print("🌐 Opening browser...")
    webbrowser.open('http://localhost:5001')

def main():
    print("🐴 Integrated Horse State Detection System")
    print("=" * 50)
    print("📋 Complete workflow: Upload → Configure → Process → Analyze")
    print()
    
    # Check dependencies
    print("🔍 Checking system requirements...")
    if not check_dependencies():
        print("\n💡 Make sure you have:")
        print("   1. Downloaded AI models (YOLO + RTMPose)")
        print("   2. All required Python files in place")
        print("   3. Configuration files available")
        return
    
    print("✅ All dependencies found")
    
    # Install packages if needed
    try:
        import flask
        import flask_cors
    except ImportError:
        if not install_requirements():
            return
    
    print("\n🎯 System Features:")
    print("   📤 Drag & drop video upload")
    print("   ⚙️ Configurable processing options")
    print("   📊 Real-time processing progress")
    print("   🎥 Synchronized video playback")
    print("   📈 Interactive timeline charts")
    print("   📄 Export analysis reports")
    print("   💾 Download processed results")
    
    print("\n🎬 Supported video formats:")
    print("   • MP4, MOV, AVI, MKV")
    print("   • Maximum size: 500MB")
    print("   • Recommended: 30 FPS, 1080p")
    
    print("\n🔧 Processing capabilities:")
    print("   • YOLO horse detection")
    print("   • RTMPose keypoint analysis")
    print("   • Wildlife ReID tracking")
    print("   • Advanced state detection")
    print("   • Behavioral pattern analysis")
    
    # Start browser opener thread
    browser_thread = threading.Thread(target=open_browser_delayed)
    browser_thread.daemon = True
    browser_thread.start()
    
    print(f"\n🌐 Server will start on: http://localhost:5001")
    print("🎮 Interface will open automatically")
    print()
    print("📖 Usage Instructions:")
    print("   1. Upload horse video file")
    print("   2. Configure processing options")
    print("   3. Click 'Start Processing'")
    print("   4. Monitor progress in real-time")
    print("   5. Review results with synchronized playback")
    print("   6. Export analysis and download files")
    print()
    print("🛑 Press Ctrl+C to stop server")
    print("-" * 50)
    
    # Start the server
    start_server()

if __name__ == "__main__":
    main()