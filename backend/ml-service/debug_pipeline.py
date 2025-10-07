#!/usr/bin/env python3
"""
Debug script to test the advanced state pipeline with minimal configuration
"""

import sys
import os
import time
import signal

# Set environment
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'
os.environ['YOLO_MODEL'] = 'downloads/yolov5m.pt'

sys.path.insert(0, 'src')

def signal_handler(sig, frame):
    print('\n🛑 Process interrupted by user')
    sys.exit(0)

# Register signal handler for Ctrl+C
signal.signal(signal.SIGINT, signal_handler)

def test_basic_imports():
    """Test basic imports first"""
    print("🔍 Testing basic imports...")
    try:
        from test_advanced_state_pipeline import AdvancedStatePipeline
        print("✅ AdvancedStatePipeline imported successfully")
        return True
    except Exception as e:
        print(f"❌ Import failed: {e}")
        return False

def test_pipeline_initialization():
    """Test pipeline initialization with timeout"""
    print("\n🏗️ Testing pipeline initialization...")
    
    try:
        print("   📦 Importing components...")
        from test_advanced_state_pipeline import AdvancedStatePipeline
        
        print("   🔧 Creating pipeline...")
        start_time = time.time()
        
        # Create pipeline with timeout simulation
        pipeline = AdvancedStatePipeline('config/state_tracking_config.yaml')
        
        init_time = time.time() - start_time
        print(f"✅ Pipeline initialized successfully in {init_time:.2f} seconds")
        return True
        
    except Exception as e:
        print(f"❌ Pipeline initialization failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_with_timeout():
    """Test pipeline initialization with a timeout"""
    import threading
    import queue
    
    print("\n⏱️ Testing with 30-second timeout...")
    
    result_queue = queue.Queue()
    
    def init_pipeline():
        try:
            from test_advanced_state_pipeline import AdvancedStatePipeline
            pipeline = AdvancedStatePipeline('config/state_tracking_config.yaml')
            result_queue.put(("success", pipeline))
        except Exception as e:
            result_queue.put(("error", str(e)))
    
    # Start initialization in a separate thread
    thread = threading.Thread(target=init_pipeline)
    thread.daemon = True  # Dies when main thread dies
    thread.start()
    
    # Wait with timeout
    thread.join(timeout=30.0)
    
    if thread.is_alive():
        print("❌ Pipeline initialization timed out after 30 seconds")
        print("   This suggests the system is hanging during model loading")
        return False
    else:
        try:
            result_type, result = result_queue.get_nowait()
            if result_type == "success":
                print("✅ Pipeline initialized within timeout")
                return True
            else:
                print(f"❌ Pipeline failed: {result}")
                return False
        except queue.Empty:
            print("❌ No result received")
            return False

def main():
    print("🐴 Advanced State Pipeline - Debug Test")
    print("=" * 50)
    print("🔍 This will help identify where the system is hanging...")
    print()
    
    success = True
    
    # Test imports
    success &= test_basic_imports()
    
    # Test initialization with timeout
    success &= test_with_timeout()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 All tests passed! The pipeline should work normally.")
        print("💡 The hanging issue might be specific to the web interface.")
    else:
        print("❌ Pipeline has issues. This explains the web interface hanging.")
        print("💡 The system is likely hanging during AI model loading.")
        print("\nCommon causes:")
        print("   • Model files corrupted or incompatible")
        print("   • Memory issues during model loading") 
        print("   • Network timeouts downloading model dependencies")
        print("   • Conflict with other processes")
        
    return success

if __name__ == "__main__":
    main()