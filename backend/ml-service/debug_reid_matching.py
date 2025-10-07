#!/usr/bin/env python3
"""
Debug ReID Matching - Check why only 2 horses are tracked when 3 are detected
"""

import os
import sys
import cv2
import numpy as np
from typing import Dict, List
import time

# Set environment
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['CONFIDENCE_THRESHOLD'] = '0.7'
os.environ['MODEL_PATH'] = '../../models'
os.environ['YOLO_MODEL'] = 'downloads/yolov5m.pt'

sys.path.insert(0, 'src')

def debug_detection_matching():
    """Debug what happens with detection matching."""
    
    print("🔍 Debugging Horse Detection and Matching")
    print("=" * 50)
    
    from src.models.detection import HorseDetectionModel
    
    # Load detection model
    print("🔧 Loading detection model...")
    detection_model = HorseDetectionModel()
    detection_model.load_models()
    print("✅ Detection model loaded")
    
    # Load video
    input_video = "../../media/rolling-on-ground.mp4"
    cap = cv2.VideoCapture(input_video)
    
    print(f"\n📹 Analyzing first 5 frames of {input_video}")
    print("Looking for: Why 3 detections become 2 tracked horses")
    print()
    
    for frame_idx in range(5):
        ret, frame = cap.read()
        if not ret:
            break
            
        print(f"🎬 Frame {frame_idx + 1}:")
        
        # Get detections
        detections, _ = detection_model.detect_horses(frame)
        print(f"   Detections found: {len(detections)}")
        
        if detections:
            # Show detection details
            for i, detection in enumerate(detections):
                bbox = detection['bbox']
                conf = detection['confidence']
                print(f"   Detection {i+1}: conf={conf:.3f}, bbox=({bbox['x']:.0f},{bbox['y']:.0f},{bbox['width']:.0f},{bbox['height']:.0f})")
                
                # Extract crop and show properties
                x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
                x = max(0, min(x, frame.shape[1] - 1))
                y = max(0, min(y, frame.shape[0] - 1))
                w = min(w, frame.shape[1] - x)
                h = min(h, frame.shape[0] - y)
                
                if w > 0 and h > 0:
                    crop = frame[y:y+h, x:x+w]
                    avg_color = np.mean(crop, axis=(0, 1))
                    print(f"     Crop size: {w}x{h}, avg_color: {avg_color}")
                else:
                    print(f"     Invalid crop size: {w}x{h}")
        print()
    
    cap.release()
    
    print("💡 Analysis Complete")
    print("Next: Check if crops are too similar or ReID threshold is too loose")

def analyze_reid_features():
    """Analyze ReID feature similarity between detected horses."""
    
    print("\n🧠 Analyzing ReID Feature Similarity")
    print("=" * 50)
    
    import torch
    import torch.nn as nn
    import torchvision.transforms as transforms
    from torchvision import models
    from scipy.spatial.distance import cosine
    
    # Initialize feature extractor (current ResNet18)
    device = torch.device('cpu')
    base_model = models.resnet18(pretrained=True)
    feature_extractor = nn.Sequential(*list(base_model.children())[:-1])
    feature_extractor.eval()
    
    preprocess = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], 
                           std=[0.229, 0.224, 0.225])
    ])
    
    print("✅ ResNet18 feature extractor loaded")
    
    # Load models
    from src.models.detection import HorseDetectionModel
    detection_model = HorseDetectionModel()
    detection_model.load_models()
    
    # Analyze first frame
    input_video = "../../media/rolling-on-ground.mp4"
    cap = cv2.VideoCapture(input_video)
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        print("❌ Could not read frame")
        return
    
    # Get detections
    detections, _ = detection_model.detect_horses(frame)
    print(f"📊 Analyzing {len(detections)} detections from first frame")
    
    if len(detections) < 2:
        print("❌ Need at least 2 detections to analyze similarity")
        return
    
    # Extract features for each detection
    features = []
    crops = []
    
    for i, detection in enumerate(detections):
        bbox = detection['bbox']
        x, y, w, h = int(bbox['x']), int(bbox['y']), int(bbox['width']), int(bbox['height'])
        x = max(0, min(x, frame.shape[1] - 1))
        y = max(0, min(y, frame.shape[0] - 1))
        w = min(w, frame.shape[1] - x)
        h = min(h, frame.shape[0] - y)
        
        if w > 0 and h > 0:
            crop = frame[y:y+h, x:x+w]
            crops.append(crop)
            
            # Extract features
            with torch.no_grad():
                image_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                input_tensor = preprocess(image_rgb)
                input_batch = input_tensor.unsqueeze(0)
                feat = feature_extractor(input_batch)
                feat = feat.squeeze().numpy()
                feat = feat / (np.linalg.norm(feat) + 1e-6)  # L2 normalize
                features.append(feat)
                
                print(f"   Detection {i+1}: Feature vector norm: {np.linalg.norm(feat):.3f}")
        else:
            print(f"   Detection {i+1}: Invalid crop")
            features.append(np.zeros(512))
            crops.append(None)
    
    # Calculate pairwise similarities
    print(f"\n📐 Pairwise Cosine Similarities:")
    similarities = []
    
    for i in range(len(features)):
        for j in range(i+1, len(features)):
            similarity = 1 - cosine(features[i], features[j])
            similarities.append(similarity)
            print(f"   Detection {i+1} vs {j+1}: {similarity:.4f}")
    
    # Analyze with different thresholds
    print(f"\n🎯 Threshold Analysis:")
    thresholds = [0.5, 0.6, 0.7, 0.8, 0.9]
    
    for thresh in thresholds:
        matches = sum(1 for sim in similarities if sim >= thresh)
        unique_horses = len(detections) - matches
        print(f"   Threshold {thresh:.1f}: {matches} matches → {unique_horses} unique horses")
    
    print(f"\n💭 Current system uses threshold 0.7")
    print(f"   With threshold 0.7: {sum(1 for sim in similarities if sim >= 0.7)} pairs match")
    print(f"   This explains why {len(detections)} detections become fewer tracked horses")
    
    # Save crops for visual inspection
    output_dir = "debug_crops"
    os.makedirs(output_dir, exist_ok=True)
    
    for i, crop in enumerate(crops):
        if crop is not None:
            cv2.imwrite(f"{output_dir}/horse_{i+1}.jpg", crop)
    
    print(f"\n💾 Saved crops to {output_dir}/ for visual inspection")

def main():
    print("🔍 ReID Matching Debug Analysis")
    print("=" * 60)
    print("Goal: Understand why 3 detections become 2 tracked horses")
    print()
    
    try:
        debug_detection_matching()
        analyze_reid_features()
        
        print(f"\n🎯 Summary:")
        print("1. Check if detections are valid and distinct")
        print("2. Analyze feature similarity between horse crops")
        print("3. Determine optimal similarity threshold")
        print("4. Consider switching to MegaDescriptor for better features")
        
    except Exception as e:
        print(f"❌ Debug failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())