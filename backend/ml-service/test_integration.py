#!/usr/bin/env python3
"""
Test script to verify the integrated system components are working
"""

import sys
import os

# Set environment
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'

sys.path.insert(0, 'src')

def test_imports():
    """Test that all required imports work"""
    print("🔍 Testing imports...")
    
    try:
        from src.models.detection import HorseDetectionModel
        print("✅ HorseDetectionModel imported successfully")
    except Exception as e:
        print(f"❌ HorseDetectionModel import failed: {e}")
        return False
    
    try:
        from src.models.pose import RealRTMPoseModel
        print("✅ RealRTMPoseModel imported successfully")
    except Exception as e:
        print(f"❌ RealRTMPoseModel import failed: {e}")
        return False
    
    try:
        from src.models.advanced_state_detection import AdvancedStateTracker
        print("✅ AdvancedStateTracker imported successfully")
    except Exception as e:
        print(f"❌ AdvancedStateTracker import failed: {e}")
        return False
        
    try:
        from test_wildlifereid_pipeline import WildlifeHorseTracker
        print("✅ WildlifeHorseTracker imported successfully")
    except Exception as e:
        print(f"❌ WildlifeHorseTracker import failed: {e}")
        return False
    
    return True

def test_pipeline_creation():
    """Test that the pipeline can be created"""
    print("\n🏗️ Testing pipeline creation...")
    
    try:
        from test_advanced_state_pipeline import AdvancedStatePipeline
        pipeline = AdvancedStatePipeline()
        print("✅ AdvancedStatePipeline created successfully")
        return True
    except Exception as e:
        print(f"❌ AdvancedStatePipeline creation failed: {e}")
        return False

def test_flask_server():
    """Test that Flask server components are available"""
    print("\n🌐 Testing Flask server components...")
    
    try:
        import flask
        import flask_cors
        print("✅ Flask and Flask-CORS available")
    except Exception as e:
        print(f"❌ Flask components not available: {e}")
        return False
    
    try:
        from processing_server import app
        print("✅ Processing server app created successfully")
    except Exception as e:
        print(f"❌ Processing server creation failed: {e}")
        return False
    
    return True

def main():
    print("🐴 Integrated Horse State Detection System - Component Test")
    print("=" * 60)
    
    success = True
    
    # Test all components
    success &= test_imports()
    success &= test_pipeline_creation()
    success &= test_flask_server()
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 All components are working correctly!")
        print("💡 You can now run: python launch_integrated.py")
    else:
        print("❌ Some components failed. Check the errors above.")
        
    return success

if __name__ == "__main__":
    main()