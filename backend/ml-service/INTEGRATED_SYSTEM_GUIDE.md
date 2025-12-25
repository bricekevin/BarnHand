# 🐴 Integrated Horse State Detection System

## Complete Upload → Process → Analyze Workflow

This integrated system provides a seamless web interface for:

1. **Upload**: Drag & drop video files
2. **Configure**: Set processing parameters
3. **Process**: Real-time AI analysis with progress monitoring
4. **Analyze**: Interactive timeline charts with synchronized video playback

## Quick Start

### **1. Launch the System**

```bash
python launch_integrated.py
```

The system will:

- Check dependencies and AI models
- Install required packages (Flask, Flask-CORS)
- Start processing server on http://localhost:5000
- Open web interface automatically

### **2. Upload & Process Video**

1. **Drag & drop** your horse video file (or click to browse)
2. **Configure** processing options:
   - Max frames (for quick testing)
   - Confidence threshold (detection accuracy)
   - Movement sensitivity (motion detection)
   - Processing mode (speed vs accuracy)
3. **Click "Start Processing"** and monitor real-time progress
4. **Review results** with synchronized video and timeline charts

### **3. Analyze Results**

- **Video Playback**: Clean processed video with state overlays
- **Timeline Charts**: Body states, head positions, confidence levels
- **Statistics**: Horses tracked, frame analysis, processing time
- **Export**: Download results and generate analysis reports

## Visual Interface Features

### **Workflow Steps**

- **Visual progress indicators** showing current step
- **Step-by-step guidance** through the entire process
- **Real-time status updates** with processing logs
- **Error handling** with clear feedback

### **Upload Interface**

- **Drag & drop zone** with visual feedback
- **File validation** (format, size, type checking)
- **Configuration panel** with processing options
- **File information** display (name, size, format)

### **Processing Monitor**

- **Progress bar** with percentage completion
- **Live processing logs** with color-coded messages
- **Current step indicator** showing AI model status
- **Cancel option** to stop processing if needed

### **Results Dashboard**

- **Synchronized video player** with timeline controls
- **Interactive charts** for behavioral analysis
- **Statistics cards** with key metrics
- **Export options** for reports and files

## ⚙ Configuration Options

### **Processing Parameters**

```yaml
Max Frames:
  - Process entire video (full analysis)
  - 150 frames (~5 seconds at 30fps)
  - 300 frames (~10 seconds)
  - 600 frames (~20 seconds)
  - 900 frames (~30 seconds)

Confidence Threshold:
  - 0.5: More detections, may include false positives
  - 0.6: Balanced detection accuracy
  - 0.7: Higher accuracy, fewer false positives (recommended)
  - 0.8: Very strict, only high-confidence detections

Movement Sensitivity:
  - High (3px): Detects subtle movements
  - Medium (5px): Balanced sensitivity (recommended)
  - Low (8px): Only obvious movements

Processing Mode:
  - Fast: CPU optimized, faster processing
  - Accurate: Full analysis with all features (recommended)
  - Demo: Quick preview mode
```

### **AI Models Used**

- **YOLO Detection**: Horse detection and bounding boxes
- **RTMPose**: 17-keypoint pose estimation (AP10K model)
- **Wildlife ReID**: Multi-horse tracking with MegaDescriptor
- **State Detection**: Advanced behavioral analysis engine

## Analysis Capabilities

### **Body State Detection**

- **Standing Still**: Stationary with minimal movement
- **Walking**: Controlled forward movement with gait analysis
- **Running**: Fast movement with suspension phases
- **Lying Down**: Horizontal position with aspect ratio analysis
- **Kneeling**: Front legs folded, rear legs extended
- **Jumping**: All hooves off ground with trajectory analysis

### **Head Position Tracking**

- **Head Up**: Elevated head position, alert behavior
- **Head Down**: Grazing or ground-focused position
- **Head Left/Right**: Lateral head movement
- **Looking Back**: Potential health concern indicator (>110° angle)

### **Temporal Analysis**

- **Movement Patterns**: Walking/running gait detection
- **Behavioral Events**: Pawing, looking back, rolling patterns
- **State Transitions**: Smooth temporal tracking with hysteresis
- **Alert Detection**: Concerning behavior combinations

## Technical Architecture

### **Backend Processing**

- **Flask Server**: Handles uploads and processing requests
- **Threading**: Background video processing with progress updates
- **Job Queue**: Manages multiple processing requests
- **File Management**: Secure upload/output file handling

### **Frontend Interface**

- **Responsive Design**: Works on desktop and mobile
- **Real-time Updates**: WebSocket-like polling for progress
- **Chart.js Integration**: Interactive timeline visualizations
- **Video.js Player**: Advanced video playback controls

### **AI Pipeline**

- **YOLO Detection** → **RTMPose Analysis** → **Wildlife ReID** → **State Detection**
- **Real-time Processing**: Frame-by-frame analysis with buffering
- **Quality Assurance**: Confidence scoring and validation
- **Output Generation**: Processed video + JSON timeline

## Performance Metrics

### **Processing Speed**

- **CPU Mode**: ~5-10 FPS processing (recommended for compatibility)
- **GPU Mode**: ~15-30 FPS processing (if CUDA available)
- **Memory Usage**: ~2-4GB RAM during processing
- **Storage**: Temporary files cleaned after processing

### **Accuracy Targets**

- **Detection Accuracy**: >95% horse detection rate
- **Pose Quality**: >85% keypoint detection confidence
- **State Classification**: >90% behavioral state accuracy
- **Tracking Consistency**: >95% horse identity maintenance

## 🎬 Supported Video Formats

### **Input Formats**

- **MP4**: H.264/H.265 codecs (recommended)
- **MOV**: QuickTime format
- **AVI**: Audio Video Interleave
- **MKV**: Matroska Video

### **Recommendations**

- **Resolution**: 720p-1080p (higher resolution = better accuracy)
- **Frame Rate**: 30 FPS (standard for smooth analysis)
- **Duration**: 10 seconds - 5 minutes (longer videos = more processing time)
- **File Size**: Up to 500MB per upload

## Troubleshooting

### **Common Issues**

**Upload Fails**

- Check file format (MP4, MOV, AVI, MKV only)
- Verify file size (<500MB)
- Ensure stable internet connection

**Processing Errors**

- Verify AI models are downloaded
- Check available disk space (>2GB free)
- Ensure Python dependencies installed

**No Horses Detected**

- Lower confidence threshold (try 0.5-0.6)
- Check video quality and lighting
- Verify horses are clearly visible

**Poor State Detection**

- Adjust movement sensitivity settings
- Ensure horses are in full view (not cropped)
- Use higher resolution source video

### **Performance Optimization**

- **Close other applications** for more RAM/CPU
- **Use shorter clips** for faster processing
- **Lower resolution** if processing is too slow
- **Enable GPU** if CUDA-compatible hardware available

## Export Options

### **Analysis Reports**

- **HTML Report**: Comprehensive analysis with charts
- **Timeline JSON**: Raw detection data for further analysis
- **Processed Video**: MP4 with state overlays
- **Statistics Summary**: Key metrics and findings

### **Data Format**

```json
{
  "frame_idx": 150,
  "timestamp": 5.0,
  "horse_id": 1,
  "body_state": {
    "state": "walking",
    "confidence": 0.85
  },
  "head_position": {
    "state": "head_down",
    "confidence": 0.78,
    "angle": -25
  },
  "measurements": {
    "keypoints_detected": 17,
    "avg_keypoint_confidence": 0.72
  },
  "alerts": []
}
```

This integrated system provides a complete end-to-end solution for horse behavioral analysis with an intuitive web interface and professional-grade AI processing capabilities!
