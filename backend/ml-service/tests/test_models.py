#!/usr/bin/env python3
"""
Model validation and testing pipeline for BarnHand ML service.
Tests model loading, inference, and performance benchmarks.
"""

import pytest
import time
import numpy as np
from pathlib import Path
import cv2
from typing import List, Dict, Any

from src.models.detection import HorseDetectionModel
from src.models.pose import HorsePoseModel
from src.config.settings import settings

class TestModelValidation:
    """Comprehensive model validation test suite."""
    
    @pytest.fixture
    def sample_image(self):
        """Create a sample test image for validation."""
        # Create a 640x480 test image with some basic content
        image = np.zeros((480, 640, 3), dtype=np.uint8)
        # Add some simple geometric shapes to simulate a horse-like object
        cv2.rectangle(image, (150, 200), (450, 400), (100, 100, 100), -1)  # Body
        cv2.circle(image, (120, 180), 30, (150, 150, 150), -1)  # Head
        return image
    
    @pytest.fixture
    def detection_model(self):
        """Initialize detection model for testing."""
        model = HorseDetectionModel()
        model.load_models()
        return model
    
    @pytest.fixture  
    def pose_model(self):
        """Initialize pose model for testing."""
        model = HorsePoseModel()
        model.load_model()
        return model
    
    def test_yolo11_model_loading(self):
        """Test YOLO11 primary model loading."""
        model_path = Path(settings.model_path) / settings.yolo_model
        assert model_path.exists(), f"YOLO11 model not found: {model_path}"
        
        detection_model = HorseDetectionModel()
        detection_model.load_models()
        
        assert detection_model.primary_model is not None, "Primary model failed to load"
        assert detection_model.primary_model.device.type in ['cpu', 'cuda'], "Invalid device assignment"
    
    def test_yolo5_model_loading(self):
        """Test YOLOv5 fallback model loading."""
        model_path = Path(settings.model_path) / settings.yolo_fallback
        assert model_path.exists(), f"YOLOv5 model not found: {model_path}"
        
        detection_model = HorseDetectionModel()
        detection_model.load_models()
        
        assert detection_model.fallback_model is not None, "Fallback model failed to load"
        assert detection_model.fallback_model.device.type in ['cpu', 'cuda'], "Invalid device assignment"
    
    def test_rtmpose_model_loading(self):
        """Test RTMPose model loading.""" 
        model_path = Path(settings.model_path) / settings.pose_model
        assert model_path.exists(), f"RTMPose model not found: {model_path}"
        
        pose_model = HorsePoseModel()
        pose_model.load_model()
        
        assert pose_model.model is not None, "RTMPose model failed to load"
    
    def test_detection_inference(self, detection_model, sample_image):
        """Test detection model inference with sample image."""
        start_time = time.time()
        results = detection_model.detect(sample_image)
        inference_time = time.time() - start_time
        
        assert isinstance(results, list), "Detection results should be a list"
        assert inference_time < 1.0, f"Inference too slow: {inference_time:.3f}s"
        
        # Log performance
        fps = 1.0 / inference_time
        print(f"Detection inference: {inference_time:.3f}s ({fps:.1f} FPS)")
    
    def test_pose_inference(self, pose_model, sample_image):
        """Test pose model inference with sample image."""
        # Create mock detection box for pose estimation
        detection_box = {
            "bbox": [100, 150, 400, 350],  # x1, y1, x2, y2
            "confidence": 0.8
        }
        
        start_time = time.time()
        pose_results = pose_model.estimate_pose(sample_image, [detection_box])
        inference_time = time.time() - start_time
        
        assert isinstance(pose_results, list), "Pose results should be a list"
        assert inference_time < 0.5, f"Pose inference too slow: {inference_time:.3f}s"
        
        # Log performance
        fps = 1.0 / inference_time
        print(f"Pose inference: {inference_time:.3f}s ({fps:.1f} FPS)")
    
    def test_model_switching_performance(self, detection_model, sample_image):
        """Test model switching based on performance metrics."""
        if not detection_model.enable_switching:
            pytest.skip("Model switching disabled")
        
        # Test primary model performance
        primary_times = []
        for _ in range(5):
            start_time = time.time()
            detection_model.detect(sample_image)
            primary_times.append(time.time() - start_time)
        
        primary_avg_fps = 1.0 / (sum(primary_times) / len(primary_times))
        
        # Force switch to fallback for comparison
        detection_model.switch_to_fallback()
        
        fallback_times = []
        for _ in range(5):
            start_time = time.time()
            detection_model.detect(sample_image)
            fallback_times.append(time.time() - start_time)
        
        fallback_avg_fps = 1.0 / (sum(fallback_times) / len(fallback_times))
        
        print(f"Primary model avg FPS: {primary_avg_fps:.1f}")
        print(f"Fallback model avg FPS: {fallback_avg_fps:.1f}")
        
        # Both models should perform reasonably
        assert primary_avg_fps > 10.0, "Primary model too slow"
        assert fallback_avg_fps > 10.0, "Fallback model too slow"
    
    def test_batch_processing(self, detection_model, sample_image):
        """Test batch processing capabilities."""
        # Create batch of test images
        batch_images = [sample_image for _ in range(4)]
        
        start_time = time.time()
        batch_results = detection_model.detect_batch(batch_images)
        batch_time = time.time() - start_time
        
        assert len(batch_results) == len(batch_images), "Batch result count mismatch"
        
        # Batch processing should be more efficient than individual calls
        individual_time = 0
        for img in batch_images:
            start_time = time.time()
            detection_model.detect(img)
            individual_time += time.time() - start_time
        
        print(f"Batch processing: {batch_time:.3f}s")
        print(f"Individual processing: {individual_time:.3f}s")
        print(f"Batch efficiency: {(individual_time / batch_time):.1f}x faster")
        
        # Batch should be at least 10% more efficient
        assert batch_time < individual_time * 0.9, "Batch processing not efficient"
    
    def test_performance_monitoring(self, detection_model, sample_image):
        """Test performance monitoring and statistics."""
        initial_frames = detection_model.performance_stats["frames_processed"]
        
        # Run several inference calls to populate stats
        for _ in range(10):
            detection_model.detect(sample_image)
        
        stats = detection_model.get_performance_stats()
        
        assert stats["frames_processed"] == initial_frames + 10, "Frame count not updated"
        assert stats["fps"] > 0, "FPS not calculated"
        assert stats["avg_inference_ms"] > 0, "Average inference time not calculated"
        assert len(stats["inference_times"]) <= detection_model.window_size, "Performance window size exceeded"
        
        print(f"Performance stats: {stats}")
    
    def test_model_validation_benchmarks(self, detection_model, pose_model):
        """Run comprehensive performance benchmarks."""
        test_image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        
        # Detection benchmark
        detection_times = []
        for _ in range(20):
            start_time = time.time()
            results = detection_model.detect(test_image)
            detection_times.append(time.time() - start_time)
        
        detection_avg_fps = 1.0 / (sum(detection_times) / len(detection_times))
        
        # Pose benchmark (with mock detection)
        mock_detection = {"bbox": [100, 100, 300, 400], "confidence": 0.9}
        pose_times = []
        for _ in range(10):
            start_time = time.time()
            pose_results = pose_model.estimate_pose(test_image, [mock_detection])
            pose_times.append(time.time() - start_time)
        
        pose_avg_fps = 1.0 / (sum(pose_times) / len(pose_times))
        
        # Performance assertions
        assert detection_avg_fps >= settings.target_fps * 0.6, f"Detection FPS too low: {detection_avg_fps:.1f}"
        assert pose_avg_fps >= 20.0, f"Pose FPS too low: {pose_avg_fps:.1f}"
        
        print(f"Detection benchmark: {detection_avg_fps:.1f} FPS")
        print(f"Pose benchmark: {pose_avg_fps:.1f} FPS")
        print(f"Target FPS: {settings.target_fps}")
        
        return {
            "detection_fps": detection_avg_fps,
            "pose_fps": pose_avg_fps,
            "meets_target": detection_avg_fps >= settings.target_fps * 0.6
        }


if __name__ == "__main__":
    """Run validation tests manually."""
    print("🧪 BarnHand ML Model Validation Pipeline")
    print("=" * 50)
    
    # Initialize models
    print("\n📦 Loading models...")
    detection_model = HorseDetectionModel()
    detection_model.load_models()
    
    pose_model = HorsePoseModel()  
    pose_model.load_model()
    
    print("✅ Models loaded successfully")
    
    # Create test image
    test_image = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.rectangle(test_image, (150, 200), (450, 400), (100, 100, 100), -1)
    cv2.circle(test_image, (120, 180), 30, (150, 150, 150), -1)
    
    # Run validation tests
    validator = TestModelValidation()
    
    print("\n🔍 Running validation tests...")
    
    try:
        # Test model loading
        validator.test_yolo11_model_loading()
        print("✅ YOLO11 model loading test passed")
        
        validator.test_yolo5_model_loading()
        print("✅ YOLOv5 model loading test passed")
        
        validator.test_rtmpose_model_loading()
        print("✅ RTMPose model loading test passed")
        
        # Test inference
        validator.test_detection_inference(detection_model, test_image)
        print("✅ Detection inference test passed")
        
        validator.test_pose_inference(pose_model, test_image)
        print("✅ Pose inference test passed")
        
        # Test performance monitoring
        validator.test_performance_monitoring(detection_model, test_image)
        print("✅ Performance monitoring test passed")
        
        # Run benchmarks
        results = validator.test_model_validation_benchmarks(detection_model, pose_model)
        print("✅ Performance benchmarks completed")
        
        print("\n" + "=" * 50)
        print("🎉 All validation tests passed!")
        print(f"📊 Final Results:")
        print(f"   Detection FPS: {results['detection_fps']:.1f}")
        print(f"   Pose FPS: {results['pose_fps']:.1f}")
        print(f"   Target Met: {'✅' if results['meets_target'] else '❌'}")
        
    except Exception as e:
        print(f"\n❌ Validation failed: {e}")
        exit(1)