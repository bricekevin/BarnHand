#!/usr/bin/env python3
"""
Video Processing Server for Horse State Detection
Handles video upload, processing, and result delivery
"""

import os
import json
import uuid
import time
import subprocess
import threading
from pathlib import Path
from flask import Flask, request, jsonify, send_file, render_template_string
from flask_cors import CORS
import tempfile
import shutil
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = Path('uploads')
OUTPUT_FOLDER = Path('outputs') 
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB

# Create folders
UPLOAD_FOLDER.mkdir(exist_ok=True)
OUTPUT_FOLDER.mkdir(exist_ok=True)

# Store processing jobs
processing_jobs = {}

class ProcessingJob:
    def __init__(self, job_id, filename, config):
        self.job_id = job_id
        self.filename = filename
        self.config = config
        self.status = 'pending'
        self.progress = 0
        self.step = 'Initializing...'
        self.logs = []
        self.error = None
        self.output_video = None
        self.timeline_data = None
        self.start_time = time.time()
        self.end_time = None
        
    def add_log(self, message, level='info'):
        self.logs.append({
            'timestamp': time.time(),
            'message': message,
            'level': level
        })
        print(f"[{self.job_id}] {level.upper()}: {message}")
        
    def update_progress(self, progress, step):
        self.progress = progress
        self.step = step
        self.add_log(f"Progress: {progress}% - {step}")
        
    def complete(self, output_video, timeline_data):
        self.status = 'completed'
        self.progress = 100
        self.step = 'Processing completed'
        self.output_video = output_video
        self.timeline_data = timeline_data
        self.end_time = time.time()
        self.add_log('Processing completed successfully', 'success')
        
    def fail(self, error):
        self.status = 'failed'
        self.error = error
        self.end_time = time.time()
        self.add_log(f'Processing failed: {error}', 'error')

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """Serve the integrated viewer interface"""
    # Try the comprehensive version first, then fixed, then original
    try:
        with open('integrated_viewer_comprehensive.html', 'r') as f:
            html_content = f.read()
        # Comprehensive version has all features - serve as-is
        return render_template_string(html_content)
    except FileNotFoundError:
        try:
            with open('integrated_viewer_fixed.html', 'r') as f:
                html_content = f.read()
            # Fixed version already has working JavaScript - serve as-is
            return render_template_string(html_content)
        except FileNotFoundError:
            with open('integrated_viewer.html', 'r') as f:
                html_content = f.read()
    
    # For the original version, no modifications needed for now
    return render_template_string(html_content)

@app.route('/upload', methods=['POST'])
def upload_video():
    """Handle video upload and start processing"""
    try:
        if 'video' not in request.files:
            return jsonify({'success': False, 'error': 'No video file provided'})
        
        file = request.files['video']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'})
        
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Invalid file type'})
        
        # Get configuration
        config = json.loads(request.form.get('config', '{}'))
        
        # Save uploaded file
        job_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        filepath = UPLOAD_FOLDER / f"{job_id}_{filename}"
        file.save(str(filepath))
        
        # Create processing job
        job = ProcessingJob(job_id, filename, config)
        processing_jobs[job_id] = job
        
        # Start processing in background
        thread = threading.Thread(target=process_video, args=(job, filepath))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'message': 'Video uploaded successfully, processing started'
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/status/<job_id>')
def get_status(job_id):
    """Get processing status for a job"""
    job = processing_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    
    return jsonify({
        'job_id': job_id,
        'status': job.status,
        'progress': job.progress,
        'step': job.step,
        'logs': job.logs[-10:],  # Last 10 log entries
        'error': job.error,
        'processing_time': time.time() - job.start_time if job.status == 'processing' else (
            job.end_time - job.start_time if job.end_time else 0
        )
    })

@app.route('/video/<job_id>')
def get_video(job_id):
    """Serve processed video"""
    job = processing_jobs.get(job_id)
    if not job or job.status != 'completed':
        return jsonify({'error': 'Video not ready'}), 404
    
    # Verify file exists
    from pathlib import Path
    video_path = Path(job.output_video)
    if not video_path.exists():
        return jsonify({'error': 'Video file not found'}), 404
    
    # Serve with proper MIME type for MP4
    return send_file(job.output_video, 
                     as_attachment=False,
                     mimetype='video/mp4')

@app.route('/timeline/<job_id>')
def get_timeline(job_id):
    """Get timeline data for a job"""
    job = processing_jobs.get(job_id)
    if not job or job.status != 'completed':
        return jsonify({'error': 'Timeline not ready'}), 404
    
    with open(job.timeline_data, 'r') as f:
        timeline_data = json.load(f)
    
    return jsonify(timeline_data)

@app.route('/download/<job_id>/<file_type>')
def download_file(job_id, file_type):
    """Download processed files"""
    job = processing_jobs.get(job_id)
    if not job or job.status != 'completed':
        return jsonify({'error': 'Files not ready'}), 404
    
    if file_type == 'video':
        return send_file(job.output_video, as_attachment=True, 
                        download_name=f"processed_{job.filename}")
    elif file_type == 'timeline':
        return send_file(job.timeline_data, as_attachment=True,
                        download_name=f"timeline_{job.filename}.json")
    else:
        return jsonify({'error': 'Invalid file type'}), 400

def process_video(job, input_path):
    """Process video using the advanced state detection pipeline"""
    try:
        job.status = 'processing'
        job.add_log('Starting video processing pipeline')
        
        # Prepare output paths
        output_video = OUTPUT_FOLDER / f"{job.job_id}_processed.mp4"
        timeline_data = OUTPUT_FOLDER / f"{job.job_id}_timeline.json"
        config_file = OUTPUT_FOLDER / f"{job.job_id}_config.yaml"
        
        # Create config file
        create_config_file(config_file, job.config)
        
        job.update_progress(10, 'Loading AI models...')
        
        # Build command
        cmd = [
            'python', 'test_advanced_state_pipeline.py',
            str(input_path),
            '--output', str(output_video),
            '--timeline', str(timeline_data),
            '--config', str(config_file)
        ]
        
        # Add max frames if specified
        if job.config.get('max_frames'):
            cmd.extend(['--max-frames', str(job.config['max_frames'])])
        
        job.update_progress(20, 'Starting processing pipeline...')
        
        # Set environment variables
        env = os.environ.copy()
        env['LOG_LEVEL'] = 'INFO'
        env['CONFIDENCE_THRESHOLD'] = str(job.config.get('confidence_threshold', '0.7'))
        env['YOLO_MODEL'] = 'downloads/yolov5m.pt'  # Use compatible YOLOv5 model
        
        # Run processing
        job.add_log(f'Running command: {" ".join(cmd)}')
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Merge stderr into stdout
            universal_newlines=True,
            bufsize=1,  # Line buffered
            env=env,
            cwd=Path(__file__).parent
        )
        
        # Monitor progress with threading for better compatibility
        import threading
        import queue
        import time
        
        output_lines = []
        output_queue = queue.Queue()
        timeout_seconds = 300  # 5 minute timeout
        
        def read_output():
            """Read output in separate thread to avoid blocking"""
            try:
                for line in iter(process.stdout.readline, ''):
                    output_queue.put(line.rstrip())
                output_queue.put(None)  # Signal end
            except Exception as e:
                output_queue.put(f"ERROR: {e}")
        
        # Start output reading thread
        reader_thread = threading.Thread(target=read_output)
        reader_thread.daemon = True
        reader_thread.start()
        
        last_activity = time.time()
        
        while True:
            # Check if process is finished
            if process.poll() is not None:
                # Process finished, drain remaining output
                while True:
                    try:
                        line = output_queue.get_nowait()
                        if line is None:
                            break
                        if line.strip():
                            output_lines.append(line.strip())
                            job.add_log(line.strip())
                    except queue.Empty:
                        break
                break
            
            try:
                # Try to get output with timeout
                line = output_queue.get(timeout=1.0)
                
                if line is None:
                    # End of output stream
                    break
                    
                if line.strip():
                    output_lines.append(line.strip())
                    job.add_log(line.strip())
                    last_activity = time.time()
                    
                    # Parse progress from output
                    if 'Progress:' in line:
                        try:
                            progress_text = line.split('Progress:')[1].strip()
                            progress = float(progress_text.split('%')[0])
                            job.update_progress(min(20 + progress * 0.7, 90), 'Processing frames...')
                        except:
                            pass
                    elif 'Frame' in line and 'detections found' in line:
                        job.update_progress(min(job.progress + 1, 90), 'Analyzing horse behavior...')
                    elif 'Initializing' in line:
                        job.update_progress(30, 'Initializing AI models...')
                    elif 'Loading' in line and 'model' in line:
                        job.update_progress(40, 'Loading AI models...')
                    elif 'Processing frame' in line:
                        job.update_progress(min(job.progress + 0.5, 85), 'Processing video frames...')
                        
            except queue.Empty:
                # No output received in the last second
                if time.time() - last_activity > timeout_seconds:
                    job.add_log(f'Process timed out after {timeout_seconds} seconds', 'error')
                    process.terminate()
                    time.sleep(2)
                    if process.poll() is None:
                        process.kill()
                    raise Exception(f"Processing timed out after {timeout_seconds} seconds")
                
                # Update progress to show we're still working
                if time.time() - last_activity > 10:  # Every 10 seconds of no output
                    job.update_progress(job.progress, 'Processing (waiting for output)...')
        
        # Wait for completion
        return_code = process.wait()
        
        if return_code == 0:
            job.update_progress(95, 'Finalizing results...')
            
            # Verify output files exist
            if output_video.exists() and timeline_data.exists():
                job.complete(str(output_video), str(timeline_data))
            else:
                job.fail('Output files not generated')
        else:
            # Error occurred - stderr was merged into stdout
            error_output = '\n'.join(output_lines[-10:])  # Last 10 lines
            job.fail(f'Processing failed with code {return_code}: {error_output}')
        
    except Exception as e:
        job.fail(f'Processing error: {str(e)}')
    
    finally:
        # Cleanup input file
        try:
            input_path.unlink()
        except:
            pass

def create_config_file(config_path, config):
    """Create YAML config file from job config"""
    yaml_content = f"""
single_frame:
  smoothing_frames_body: 15
  smoothing_frames_head: 10
  min_confidence_threshold: 0.6
  hysteresis_factor: 0.8
  body_state:
    movement_threshold_pixels: {config.get('movement_threshold', 5)}
    hoof_similarity_threshold: 0.1
    standing_hip_range: [0.4, 0.6]
    lying_hip_threshold: 0.7
    lying_aspect_ratio: 1.3
    kneeling_height_diff: 0.2
    jumping_ground_clearance: 0.2
    jumping_leg_angle: 120
  head_position:
    head_angle_threshold: 110
    head_up_threshold: 0.15
    head_down_threshold: 0.5
    head_lateral_threshold: 0.2

temporal_analysis:
  temporal_window_short: 30
  temporal_window_medium: 90
  temporal_window_long: 150
  update_interval: 15
  min_valid_frames_ratio: 0.6
  
  # Walking/Running Detection
  gait_detection:
    walking_speed_range: [1.0, 2.0]
    running_speed_threshold: 2.0
    suspension_phase_frames: 2
    gait_rhythm_threshold: 0.7
    
  # Pawing Detection
  pawing_detection:
    pawing_frequency_range: [1.0, 3.0]
    pawing_min_cycles: 3
    pawing_amplitude_threshold: 20
    stationary_hoof_threshold: 10
    
  # Jumping Action Detection
  jumping_action:
    crouch_duration: [0.3, 0.8]
    airborne_duration: [0.2, 0.8]
    landing_duration: [0.2, 0.5]
    trajectory_fit_threshold: 0.85
    
  # Looking Back Detection
  looking_back:
    hold_duration_min: 1.0
    repeat_pattern_window: 10
    weight_shift_threshold: 0.1

display:
  colors:
    upright: [0, 255, 0]
    running: [255, 100, 0]
    lying_down: [128, 128, 255]
    kneeling: [200, 128, 255]
    jumping: [255, 0, 255]
    head_up: [0, 255, 255]
    head_down: [0, 128, 255]

confidence_weights:
  single_frame:
    keypoint_visibility: 0.4
    geometric_match: 0.4
    smoothing_consistency: 0.2
  multi_frame:
    pattern_match: 0.5
    temporal_consistency: 0.3
    keypoint_quality: 0.2
"""
    
    with open(config_path, 'w') as f:
        f.write(yaml_content.strip())

@app.route('/cleanup/<job_id>')
def cleanup_job(job_id):
    """Clean up job files"""
    job = processing_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    
    try:
        # Remove output files
        if job.output_video and Path(job.output_video).exists():
            Path(job.output_video).unlink()
        if job.timeline_data and Path(job.timeline_data).exists():
            Path(job.timeline_data).unlink()
        
        # Remove job from memory
        del processing_jobs[job_id]
        
        return jsonify({'success': True, 'message': 'Job cleaned up'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

if __name__ == '__main__':
    print("🐴 Horse State Detection Processing Server")
    print("=" * 50)
    print(f"📁 Upload folder: {UPLOAD_FOLDER.absolute()}")
    print(f"📁 Output folder: {OUTPUT_FOLDER.absolute()}")
    print(f"📏 Max file size: {MAX_FILE_SIZE // 1024 // 1024} MB")
    print(f"🎥 Supported formats: {', '.join(ALLOWED_EXTENSIONS)}")
    print()
    print("🌐 Server starting on http://localhost:5001")
    print("💡 Open your browser and navigate to the URL above")
    print()
    
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True)