#!/bin/bash

# BarnHand ML Models Download Script
# Downloads YOLOv5 and RTMPose models required for horse detection and pose estimation

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODELS_DIR="./models/downloads"
CACHE_DIR="./models/cache"
CONFIG_DIR="./models/configs"
LOG_FILE="./models/download.log"

# Model URLs and checksums
YOLO11_MODEL_URL="https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11m.pt"
YOLO11_MODEL_FILE="yolo11m.pt"
YOLO5_MODEL_URL="https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5m.pt"
YOLO5_MODEL_FILE="yolov5m.pt"
YOLO_CUSTOM_URL=""  # URL for custom horse-trained model (if available)
YOLO_CUSTOM_FILE="yolov5su.pt"

RTMPOSE_MODEL_URL="https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.pth"
RTMPOSE_MODEL_FILE="rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.pth"

# Expected file sizes (in bytes) for validation
YOLO11_EXPECTED_SIZE=40684120   # ~39MB (for YOLO11m)
YOLO5_EXPECTED_SIZE=42806829    # ~41MB (for YOLOv5m)
RTMPOSE_EXPECTED_SIZE=54721413  # ~52MB

# Functions
log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

print_header() {
    echo -e "${BLUE}"
    echo "=========================================="
    echo "  BarnHand ML Models Download Script"
    echo "=========================================="
    echo -e "${NC}"
}

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

create_directories() {
    log_message "INFO" "Creating model directories..."
    mkdir -p "$MODELS_DIR"
    mkdir -p "$CACHE_DIR"
    mkdir -p "$CONFIG_DIR"
    print_status "Created model directories"
}

check_dependencies() {
    log_message "INFO" "Checking dependencies..."
    
    # Check for required tools
    local missing_tools=()
    
    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        missing_tools+=("curl or wget")
    fi
    
    if ! command -v python3 &> /dev/null; then
        missing_tools+=("python3")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        log_message "ERROR" "Missing dependencies: ${missing_tools[*]}"
        exit 1
    fi
    
    print_status "All dependencies available"
}

download_file() {
    local url=$1
    local output_path=$2
    local expected_size=$3
    local description=$4
    
    log_message "INFO" "Downloading $description from $url"
    
    if [ -f "$output_path" ]; then
        local file_size=$(stat -f%z "$output_path" 2>/dev/null || stat -c%s "$output_path" 2>/dev/null || echo 0)
        if [ "$file_size" -eq "$expected_size" ]; then
            print_status "$description already exists and is valid"
            return 0
        else
            print_warning "$description exists but size mismatch, re-downloading..."
            rm -f "$output_path"
        fi
    fi
    
    # Try curl first, then wget
    if command -v curl &> /dev/null; then
        curl -L -o "$output_path" --progress-bar "$url"
    elif command -v wget &> /dev/null; then
        wget -O "$output_path" --progress=bar:force "$url"
    else
        print_error "Neither curl nor wget available for download"
        return 1
    fi
    
    # Verify file size
    local downloaded_size=$(stat -f%z "$output_path" 2>/dev/null || stat -c%s "$output_path" 2>/dev/null || echo 0)
    if [ "$downloaded_size" -ne "$expected_size" ]; then
        print_error "$description download failed - size mismatch (expected: $expected_size, got: $downloaded_size)"
        rm -f "$output_path"
        return 1
    fi
    
    print_status "$description downloaded successfully"
    log_message "INFO" "$description downloaded and verified"
    return 0
}

download_yolo_models() {
    log_message "INFO" "Starting YOLO model downloads..."
    echo -e "${BLUE}Downloading YOLO Models...${NC}"
    
    # Download YOLO11 model (primary)
    if ! download_file "$YOLO11_MODEL_URL" "$MODELS_DIR/$YOLO11_MODEL_FILE" "$YOLO11_EXPECTED_SIZE" "YOLO11s model (primary)"; then
        print_error "Failed to download YOLO11s model"
        return 1
    fi
    
    # Download YOLOv5 model (fallback)
    if ! download_file "$YOLO5_MODEL_URL" "$MODELS_DIR/$YOLO5_MODEL_FILE" "$YOLO5_EXPECTED_SIZE" "YOLOv5s model (fallback)"; then
        print_error "Failed to download YOLOv5s model"
        return 1
    fi
    
    # Download custom horse-trained model if URL is provided
    if [ -n "$YOLO_CUSTOM_URL" ]; then
        if ! download_file "$YOLO_CUSTOM_URL" "$MODELS_DIR/$YOLO_CUSTOM_FILE" "0" "Custom horse-trained model"; then
            print_warning "Failed to download custom horse model, using standard models"
            # Copy YOLO11 model as fallback
            cp "$MODELS_DIR/$YOLO11_MODEL_FILE" "$MODELS_DIR/$YOLO_CUSTOM_FILE"
        fi
    else
        print_warning "Custom horse model URL not provided, using standard YOLO11 model"
        cp "$MODELS_DIR/$YOLO11_MODEL_FILE" "$MODELS_DIR/$YOLO_CUSTOM_FILE"
    fi
    
    return 0
}

download_rtmpose_models() {
    log_message "INFO" "Starting RTMPose model downloads..."
    echo -e "${BLUE}Downloading RTMPose Models...${NC}"
    
    # Download RTMPose model
    if ! download_file "$RTMPOSE_MODEL_URL" "$MODELS_DIR/$RTMPOSE_MODEL_FILE" "$RTMPOSE_EXPECTED_SIZE" "RTMPose-M AP10K model"; then
        print_error "Failed to download RTMPose model"
        return 1
    fi
    
    return 0
}

create_model_configs() {
    log_message "INFO" "Creating model configuration files..."
    
    # YOLOv5 config
    cat > "$CONFIG_DIR/yolo_config.yaml" << EOF
# YOLOv5 Configuration for Horse Detection
model_path: /models/downloads/yolov5su.pt
input_size: [640, 640]
confidence_threshold: 0.5
iou_threshold: 0.45
max_detections: 50
classes:
  0: horse  # Assuming horse class is 0 in custom model
device: auto  # 'cpu', 'cuda', or 'auto'
half_precision: true
batch_size: 1
EOF

    # RTMPose config
    cat > "$CONFIG_DIR/rtmpose_config.yaml" << EOF
# RTMPose Configuration for Horse Pose Estimation
model_path: /models/downloads/rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.pth
input_size: [256, 256]
keypoint_threshold: 0.3
keypoints:
  0: nose
  1: left_eye
  2: right_eye
  3: left_ear
  4: right_ear
  5: left_front_leg_top
  6: right_front_leg_top
  7: left_front_leg_bottom
  8: right_front_leg_bottom
  9: left_back_leg_top
  10: right_back_leg_top
  11: left_back_leg_bottom
  12: right_back_leg_bottom
  13: tail_top
  14: tail_middle
  15: tail_bottom
  16: center_back
device: auto
half_precision: true
batch_size: 1
EOF

    # Model manager config
    cat > "$CONFIG_DIR/model_manager.yaml" << EOF
# Model Manager Configuration
models:
  detection:
    name: YOLOv5
    type: detection
    config_path: /models/configs/yolo_config.yaml
    warm_up: true
    
  pose:
    name: RTMPose
    type: pose_estimation  
    config_path: /models/configs/rtmpose_config.yaml
    warm_up: true

cache:
  enabled: true
  directory: /models/cache
  max_size: 1GB
  
logging:
  level: INFO
  file: /models/model_manager.log
EOF

    print_status "Model configuration files created"
}

verify_models() {
    log_message "INFO" "Verifying downloaded models..."
    echo -e "${BLUE}Verifying Models...${NC}"
    
    local all_valid=true
    
    # Check YOLOv5 model
    if [ -f "$MODELS_DIR/$YOLO_CUSTOM_FILE" ]; then
        print_status "YOLOv5 model: $YOLO_CUSTOM_FILE"
    else
        print_error "YOLOv5 model missing: $YOLO_CUSTOM_FILE"
        all_valid=false
    fi
    
    # Check RTMPose model
    if [ -f "$MODELS_DIR/$RTMPOSE_MODEL_FILE" ]; then
        print_status "RTMPose model: $RTMPOSE_MODEL_FILE"
    else
        print_error "RTMPose model missing: $RTMPOSE_MODEL_FILE"
        all_valid=false
    fi
    
    if [ "$all_valid" = true ]; then
        print_status "All models verified successfully"
        return 0
    else
        print_error "Model verification failed"
        return 1
    fi
}

create_test_script() {
    log_message "INFO" "Creating model test script..."
    
    cat > "$CONFIG_DIR/test_models.py" << 'EOF'
#!/usr/bin/env python3
"""
BarnHand ML Models Test Script
Tests that downloaded models can be loaded correctly
"""

import sys
import os
from pathlib import Path

def test_yolo_model():
    """Test YOLOv5 model loading"""
    try:
        import torch
        from ultralytics import YOLO
        
        model_path = Path(__file__).parent / "../downloads/yolov5su.pt"
        if not model_path.exists():
            print(f"❌ YOLOv5 model not found: {model_path}")
            return False
            
        model = YOLO(str(model_path))
        print(f"✅ YOLOv5 model loaded successfully")
        print(f"   Model classes: {len(model.names)}")
        print(f"   Model device: {model.device}")
        return True
        
    except ImportError as e:
        print(f"❌ Missing dependencies for YOLOv5: {e}")
        return False
    except Exception as e:
        print(f"❌ Error loading YOLOv5 model: {e}")
        return False

def test_rtmpose_model():
    """Test RTMPose model loading"""
    try:
        import torch
        
        model_path = Path(__file__).parent / "../downloads/rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.pth"
        if not model_path.exists():
            print(f"❌ RTMPose model not found: {model_path}")
            return False
            
        # Basic torch loading test
        checkpoint = torch.load(str(model_path), map_location='cpu')
        print(f"✅ RTMPose model loaded successfully")
        print(f"   Model keys: {list(checkpoint.keys())[:5]}...")
        return True
        
    except ImportError as e:
        print(f"❌ Missing dependencies for RTMPose: {e}")
        return False
    except Exception as e:
        print(f"❌ Error loading RTMPose model: {e}")
        return False

def main():
    """Run all model tests"""
    print("🧪 Testing BarnHand ML Models...")
    print("=" * 40)
    
    tests = [
        ("YOLOv5", test_yolo_model),
        ("RTMPose", test_rtmpose_model),
    ]
    
    results = []
    for name, test_func in tests:
        print(f"\nTesting {name}...")
        result = test_func()
        results.append((name, result))
    
    print("\n" + "=" * 40)
    print("Test Results:")
    all_passed = True
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {name}: {status}")
        if not result:
            all_passed = False
    
    if all_passed:
        print("\n🎉 All model tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some model tests failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
EOF

    chmod +x "$CONFIG_DIR/test_models.py"
    print_status "Model test script created"
}

print_summary() {
    echo -e "${GREEN}"
    echo "=========================================="
    echo "  Download Summary"
    echo "=========================================="
    echo -e "${NC}"
    
    echo "Models downloaded to: $MODELS_DIR"
    echo "Configuration files: $CONFIG_DIR"
    echo "Cache directory: $CACHE_DIR"
    echo "Log file: $LOG_FILE"
    echo ""
    echo "Next steps:"
    echo "1. Run 'python3 $CONFIG_DIR/test_models.py' to test models"
    echo "2. Start the ML service: 'npm run ml:dev'"
    echo "3. Check the logs for any issues"
    echo ""
    echo -e "${GREEN}✓ Model setup complete!${NC}"
}

# Main execution
main() {
    print_header
    
    log_message "INFO" "Starting model download process..."
    
    # Create log file
    touch "$LOG_FILE"
    
    # Run setup steps
    check_dependencies
    create_directories
    
    # Download models
    if ! download_yolo_models; then
        print_error "YOLOv5 model download failed"
        exit 1
    fi
    
    if ! download_rtmpose_models; then
        print_error "RTMPose model download failed" 
        exit 1
    fi
    
    # Create configs and verify
    create_model_configs
    create_test_script
    
    if ! verify_models; then
        print_error "Model verification failed"
        exit 1
    fi
    
    print_summary
    log_message "INFO" "Model download process completed successfully"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "BarnHand ML Models Download Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --verify       Only verify existing models"
        echo "  --clean        Clean all downloaded models and configs"
        echo ""
        exit 0
        ;;
    --verify)
        create_directories
        verify_models
        exit $?
        ;;
    --clean)
        echo "Cleaning all models and configurations..."
        rm -rf "$MODELS_DIR" "$CACHE_DIR" "$CONFIG_DIR" "$LOG_FILE"
        print_status "Cleaned all model files"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac