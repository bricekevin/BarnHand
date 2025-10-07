#!/usr/bin/env python3
"""
Test the improved subprocess handling for the processing server
"""

import sys
import os
import tempfile
import json

# Set environment
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'
os.environ['YOLO_MODEL'] = 'downloads/yolov5m.pt'

sys.path.insert(0, 'src')

def test_job_processing():
    """Test the job processing with a small video file"""
    print("🧪 Testing improved subprocess handling...")
    
    # Import after path setup
    from processing_server import ProcessingJob, process_video
    from pathlib import Path
    
    # Create a test job
    job_id = "test_subprocess_fix"
    filename = "test_video.mp4" 
    config = {
        'max_frames': 150,  # Small test
        'confidence_threshold': 0.7,
        'movement_threshold': 5,
        'processing_mode': 'fast'
    }
    
    job = ProcessingJob(job_id, filename, config)
    
    print(f"✅ Created test job: {job_id}")
    
    # Check if we have an existing video file to test with
    test_videos = [
        'horse_wildlifereid_pipeline.mp4',
        'horse_complete_reid_pipeline.mp4',
        'output_advanced_state.mp4'
    ]
    
    test_video_path = None
    for video in test_videos:
        if Path(video).exists():
            test_video_path = Path(video)
            break
    
    if not test_video_path:
        print("❌ No test video found. Please ensure a horse video exists in the current directory.")
        print("Available test videos should be one of:")
        for video in test_videos:
            print(f"   - {video}")
        return False
    
    print(f"✅ Using test video: {test_video_path}")
    
    # Create a temporary copy for testing
    import shutil
    temp_path = Path(f"temp_{job_id}_{test_video_path.name}")
    shutil.copy(test_video_path, temp_path)
    
    try:
        print("🚀 Starting subprocess test...")
        print("   This should complete within 60 seconds or timeout")
        
        # Run the processing function
        process_video(job, temp_path)
        
        if job.status == 'completed':
            print("✅ Processing completed successfully!")
            print(f"   Output video: {job.output_video}")
            print(f"   Timeline data: {job.timeline_data}")
            print(f"   Processing time: {job.end_time - job.start_time:.2f} seconds")
            return True
        elif job.status == 'failed':
            print(f"❌ Processing failed: {job.error}")
            print("Recent logs:")
            for log in job.logs[-5:]:
                print(f"   {log['level'].upper()}: {log['message']}")
            return False
        else:
            print(f"⚠️ Processing status: {job.status}")
            return False
            
    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # Cleanup
        try:
            temp_path.unlink()
            print(f"✅ Cleaned up temporary file: {temp_path}")
        except:
            pass
        
        # Cleanup output files
        try:
            if hasattr(job, 'output_video') and job.output_video:
                Path(job.output_video).unlink()
            if hasattr(job, 'timeline_data') and job.timeline_data:
                Path(job.timeline_data).unlink()
            print("✅ Cleaned up output files")
        except:
            pass

def main():
    print("🐴 Subprocess Handling Test")
    print("=" * 50)
    print("Testing the improved subprocess handling with threading and timeout")
    print()
    
    success = test_job_processing()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 Subprocess handling test PASSED!")
        print("💡 The hanging issue should now be resolved")
        print("🌐 You can now retry processing in the web interface")
    else:
        print("❌ Subprocess handling test FAILED")
        print("💡 There may still be issues with the processing pipeline")
        
    return success

if __name__ == "__main__":
    main()