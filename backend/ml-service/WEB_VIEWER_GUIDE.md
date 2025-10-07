# 🐴 Horse State Detection Web Viewer Guide

## 🎯 Quick Start

### 1. **Launch the Web Viewer**
```bash
python launch_viewer.py
# or
./demo_viewer.sh
```

### 2. **Load Your Data**
- **Video File**: Select `output_clean_states.mp4` (clean version)
- **Timeline File**: Select `timeline_clean_states.json` 
- Click **"Load & Analyze"**

### 3. **Analyze Results**
- View synchronized video playback with timeline charts
- Toggle horses on/off to focus analysis
- Jump between state change events
- Export detailed analysis reports

## 🎥 **Clean Video Output**

The processed video now shows **clean, reviewable overlays**:

✅ **Horse Detection**: Color-coded bounding boxes
✅ **Horse ID**: Simple horse number labels  
✅ **Basic State Info**: Body state, head position
✅ **Pose Quality**: Color-coded confidence indicator
✅ **Head Direction**: Yellow arrow showing orientation
✅ **Alert Notifications**: Red alerts for concerning behaviors

❌ **Removed**: Detailed detection logic text overlays
❌ **Removed**: RTMPose text at top of frame
❌ **Removed**: Verbose confidence explanations

## 📊 **Web Viewer Features**

### **Synchronized Playback**
- **Video player** with timeline data overlay
- **Frame-accurate synchronization** with pose data
- **Progress tracking** with visual indicators
- **Event navigation** (jump to next/previous state changes)

### **Interactive Timeline Charts**

1. **Body State Timeline**
   - Shows state transitions over time
   - Color-coded by state type
   - Filterable by horse selection

2. **Head Position Timeline** 
   - Tracks head angle changes
   - Shows looking back patterns
   - Separate line for each horse

3. **Confidence Levels**
   - Detection confidence over time
   - Quality assessment visualization
   - Per-horse confidence tracking

4. **State Distribution**
   - Pie chart showing time spent in each state
   - Percentage breakdown per horse
   - Overall behavior summary

### **Analysis Tools**

- **Horse Filtering**: Toggle individual horses on/off
- **Statistics Dashboard**: Real-time metrics
- **Alert Monitoring**: Concerning behavior notifications
- **Export Reports**: Generate detailed HTML analysis reports
- **Event Navigation**: Jump between significant state changes

## 📈 **Timeline Data Structure**

The JSON timeline contains comprehensive frame-by-frame data:

```json
{
  "frame_idx": 150,
  "timestamp": 5.357,
  "horse_id": 2,
  "body_state": {
    "state": "kneeling",
    "confidence": 0.75,
    "raw_scores": {"kneeling": 0.75, "standing": 0.20}
  },
  "head_position": {
    "state": "head_down", 
    "confidence": 0.85,
    "angle": -25.3
  },
  "action_1s": {
    "action": "none",
    "confidence": 0.0
  },
  "action_5s": {
    "action": "walking_pattern",
    "confidence": 0.65
  },
  "measurements": {
    "keypoints_detected": 17,
    "avg_keypoint_confidence": 0.68,
    "bbox_aspect_ratio": 1.45
  },
  "alerts": []
}
```

## 🔧 **Configuration & Tuning**

### **Generate Different Analysis**
```bash
# Process with custom config
LOG_LEVEL=INFO python test_advanced_state_pipeline.py your_video.mp4 \
    --config config/state_tracking_config.yaml \
    --output custom_analysis.mp4 \
    --timeline custom_timeline.json

# Analyze specific time range
LOG_LEVEL=INFO python test_advanced_state_pipeline.py your_video.mp4 \
    --max-frames 600 \  # First 20 seconds at 30fps
    --output quick_test.mp4 \
    --timeline quick_timeline.json
```

### **Tune Detection Parameters**
Edit `config/state_tracking_config.yaml`:

```yaml
single_frame:
  body_state:
    movement_threshold_pixels: 3    # More sensitive movement
    lying_aspect_ratio: 1.2         # Easier lying detection
  head_position:
    head_angle_threshold: 90        # Easier "looking back"
```

## 🎨 **Visual Indicators**

### **Horse Bounding Box Colors**
- 🟢 **Green**: Standing Still
- 🔵 **Blue**: Moving/Walking  
- 🟠 **Orange**: Running
- 🟣 **Purple**: Lying Down
- ⚫ **Gray**: Kneeling
- 🌸 **Pink**: Jumping

### **Quality Indicators**
- 🟢 **Green Circle**: High pose confidence (>70%)
- 🟡 **Yellow Circle**: Medium confidence (50-70%) 
- 🔴 **Red Circle**: Low confidence (<50%)

### **Head Direction**
- 🟡 **Yellow Arrow**: Shows nose-to-neck direction
- **Arrow Length**: Proportional to head extension

## 📋 **Analysis Workflow**

1. **Process Video**
   ```bash
   LOG_LEVEL=INFO python test_advanced_state_pipeline.py your_video.mp4
   ```

2. **Launch Viewer**
   ```bash
   python launch_viewer.py
   ```

3. **Load Data**
   - Select generated video and JSON files
   - Click "Load & Analyze"

4. **Analyze Behavior**
   - Watch synchronized video with state tracking
   - Review timeline charts for patterns
   - Filter by individual horses
   - Export reports for documentation

5. **Tune Parameters** (if needed)
   - Edit config file
   - Re-process video
   - Compare results in viewer

## 🎯 **Use Cases**

### **Behavioral Research**
- Track state transitions over time
- Identify unusual behavior patterns
- Compare horses within same environment
- Generate quantitative behavior reports

### **Health Monitoring**
- Detect concerning behaviors (looking back + lying)
- Monitor activity levels
- Track changes in movement patterns
- Alert on potential colic signs

### **Training Analysis**
- Assess horse movement quality
- Track confidence levels during exercises
- Compare before/after training states
- Document behavioral improvements

## 🔬 **Data Export**

The web viewer generates comprehensive HTML reports including:

- **Summary Statistics**: Total horses, frames, average confidence
- **Per-Horse Analysis**: State distribution, behavior patterns
- **Time-based Metrics**: Activity over time periods
- **Quality Assessment**: Pose detection reliability
- **Alert Summary**: Concerning behavior incidents

## 🚀 **Performance**

- **Real-time Analysis**: 15+ FPS processing on CPU
- **Memory Efficient**: Streaming timeline data
- **Scalable**: Handles hours of video data
- **Interactive**: Smooth navigation and filtering
- **Export Ready**: Professional analysis reports

This system provides a complete solution for reviewing horse behavioral analysis with clean video output and comprehensive web-based timeline analysis!