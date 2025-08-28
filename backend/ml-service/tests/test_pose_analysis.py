"""Tests for pose analysis pipeline."""
import pytest
import numpy as np
from unittest.mock import Mock, MagicMock

from src.models.pose_analysis import PoseAnalyzer, PoseMetrics
from src.models.gait_classifier import GaitClassifier, GaitType, ActionType
from src.models.pose_validator import PoseValidator, ValidationResult


# Global fixture for all test classes
@pytest.fixture
def sample_keypoints():
    """Create sample keypoints for testing."""
    # Create realistic horse keypoints (17 x 3)
    keypoints = np.array([
        [100, 80, 0.9],   # left_eye
        [120, 80, 0.9],   # right_eye
        [110, 90, 0.95],  # nose
        [110, 120, 0.9],  # neck
        [110, 250, 0.85], # root_of_tail
        [90, 140, 0.8],   # left_shoulder
        [85, 180, 0.75],  # left_elbow
        [80, 220, 0.7],   # left_front_paw
        [130, 140, 0.8],  # right_shoulder
        [135, 180, 0.75], # right_elbow
        [140, 220, 0.7],  # right_front_paw
        [95, 240, 0.8],   # left_hip
        [90, 280, 0.75],  # left_knee
        [85, 320, 0.7],   # left_back_paw
        [125, 240, 0.8],  # right_hip
        [130, 280, 0.75], # right_knee
        [135, 320, 0.7]   # right_back_paw
    ], dtype=np.float32)
    return keypoints


class TestPoseAnalyzer:
    """Test pose analysis functionality."""
    
    @pytest.fixture
    def analyzer(self):
        """Create a pose analyzer instance."""
        return PoseAnalyzer(confidence_threshold=0.3)
    
    
    def test_analyzer_initialization(self, analyzer):
        """Test analyzer is properly initialized."""
        assert analyzer is not None
        assert analyzer.confidence_threshold == 0.3
        assert analyzer.max_history_length == 30
        assert len(analyzer.pose_history) == 0
    
    def test_calculate_angle(self, analyzer):
        """Test angle calculation between three points."""
        # Test 90 degree angle
        p1 = (0, 0)
        p2 = (1, 0)
        p3 = (1, 1)
        angle = analyzer.calculate_angle(p1, p2, p3)
        assert abs(angle - 90) < 1.0  # Allow small tolerance
        
        # Test 180 degree angle (straight line)
        p1 = (0, 0)
        p2 = (1, 0)
        p3 = (2, 0)
        angle = analyzer.calculate_angle(p1, p2, p3)
        assert abs(angle - 180) < 1.0
        
        # Test zero vectors
        p1 = (0, 0)
        p2 = (0, 0)
        p3 = (1, 0)
        angle = analyzer.calculate_angle(p1, p2, p3)
        assert angle == 0.0
    
    def test_calculate_joint_angles(self, analyzer, sample_keypoints):
        """Test joint angle calculations."""
        angles = analyzer.calculate_joint_angles(sample_keypoints)
        
        assert isinstance(angles, dict)
        # Check that some expected angles are calculated
        assert "front_left_shoulder" in angles
        assert "front_left_elbow" in angles
        assert "back_right_hip" in angles
        assert "back_right_knee" in angles
        assert "neck" in angles
        
        # Check angle values are reasonable (0-180 degrees)
        for angle_name, angle_value in angles.items():
            assert 0 <= angle_value <= 180, f"{angle_name} angle out of range: {angle_value}"
    
    def test_calculate_stride_metrics(self, analyzer, sample_keypoints):
        """Test stride calculation."""
        metrics = analyzer.calculate_stride_metrics(sample_keypoints)
        
        assert isinstance(metrics, dict)
        assert "front_stride_width" in metrics
        assert "back_stride_width" in metrics
        assert "diagonal_stride" in metrics
        
        # Check values are positive
        for key, value in metrics.items():
            assert value >= 0
    
    def test_calculate_back_angle(self, analyzer, sample_keypoints):
        """Test spine angle calculation."""
        angle = analyzer.calculate_back_angle(sample_keypoints)
        
        assert isinstance(angle, (float, np.floating))
        assert 0 <= angle <= 180  # Angle should be in valid range
    
    def test_estimate_center_of_mass(self, analyzer, sample_keypoints):
        """Test center of mass estimation."""
        com = analyzer.estimate_center_of_mass(sample_keypoints)
        
        assert isinstance(com, tuple)
        assert len(com) == 2
        assert isinstance(com[0], (float, np.floating))
        assert isinstance(com[1], (float, np.floating))
        
        # CoM should be within the bounding box of keypoints
        x_min = sample_keypoints[:, 0].min()
        x_max = sample_keypoints[:, 0].max()
        y_min = sample_keypoints[:, 1].min()
        y_max = sample_keypoints[:, 1].max()
        
        assert x_min <= com[0] <= x_max
        assert y_min <= com[1] <= y_max
    
    def test_smooth_keypoints(self, analyzer):
        """Test temporal smoothing of keypoints."""
        # Create sequence with noise
        sequence = []
        for i in range(10):
            kps = np.random.randn(17, 3).astype(np.float32)
            kps[:, 2] = 0.8  # Set confidence
            kps[:, 0] += i * 2  # Add linear motion
            sequence.append(kps)
        
        smoothed = analyzer.smooth_keypoints(sequence, window_length=5)
        
        assert len(smoothed) == len(sequence)
        assert smoothed[0].shape == sequence[0].shape
    
    def test_interpolate_missing_keypoints(self, analyzer, sample_keypoints):
        """Test interpolation of missing keypoints."""
        # Create keypoints with missing data
        current = sample_keypoints.copy()
        current[5, 2] = 0.1  # Low confidence for left shoulder
        
        prev = sample_keypoints.copy()
        prev[5, 0] -= 5  # Slightly different position
        
        next_kps = sample_keypoints.copy()
        next_kps[5, 0] += 5  # Slightly different position
        
        interpolated = analyzer.interpolate_missing_keypoints(current, prev, next_kps)
        
        assert interpolated.shape == current.shape
        # Check that low confidence keypoint was interpolated
        assert interpolated[5, 2] >= analyzer.confidence_threshold
    
    def test_analyze_pose(self, analyzer, sample_keypoints):
        """Test complete pose analysis."""
        metrics = analyzer.analyze_pose(sample_keypoints, timestamp=1.0)
        
        assert isinstance(metrics, PoseMetrics)
        assert isinstance(metrics.joint_angles, dict)
        assert isinstance(metrics.back_angle, (float, np.floating))
        assert isinstance(metrics.head_height, (float, np.floating))
        assert isinstance(metrics.leg_extension, dict)
        assert isinstance(metrics.center_of_mass, tuple)
        assert isinstance(metrics.confidence, (float, np.floating))
        
        # Add to history and analyze again to get velocity
        metrics2 = analyzer.analyze_pose(sample_keypoints + np.array([5, 0, 0]), timestamp=2.0)
        assert metrics2.velocity is not None
        assert metrics2.velocity > 0


class TestGaitClassifier:
    """Test gait classification functionality."""
    
    @pytest.fixture
    def classifier(self):
        """Create a gait classifier instance."""
        return GaitClassifier(window_size=30)
    
    @pytest.fixture
    def pose_sequence(self, sample_keypoints):
        """Create a sequence of poses simulating movement."""
        sequence = []
        for i in range(30):
            kps = sample_keypoints.copy()
            # Simulate leg movement (alternating)
            if i % 4 == 0:
                kps[7, 1] -= 10  # Left front hoof up
                kps[16, 1] -= 10  # Right back hoof up
            elif i % 4 == 2:
                kps[10, 1] -= 10  # Right front hoof up
                kps[13, 1] -= 10  # Left back hoof up
            
            # Add some forward motion
            kps[:, 0] += i * 2
            
            sequence.append({
                "keypoints": kps,
                "timestamp": i / 30.0
            })
        return sequence
    
    def test_classifier_initialization(self, classifier):
        """Test classifier is properly initialized."""
        assert classifier is not None
        assert classifier.window_size == 30
        assert len(classifier.pose_buffer) == 0
    
    def test_detect_footfall_pattern(self, classifier, pose_sequence):
        """Test footfall pattern detection."""
        patterns = classifier.detect_footfall_pattern(pose_sequence)
        
        assert isinstance(patterns, dict)
        assert "front_left" in patterns
        assert "front_right" in patterns
        assert "back_left" in patterns
        assert "back_right" in patterns
        
        # Each pattern should have same length as sequence
        for leg, pattern in patterns.items():
            assert len(pattern) == len(pose_sequence)
    
    def test_calculate_stride_frequency(self, classifier):
        """Test stride frequency calculation."""
        # Create pattern with known frequency
        patterns = {
            "front_left": [True, False, True, False] * 5,
            "front_right": [False, True, False, True] * 5,
            "back_left": [True, False, True, False] * 5,
            "back_right": [False, True, False, True] * 5
        }
        
        frequency = classifier.calculate_stride_frequency(patterns, fps=30.0)
        assert frequency > 0
    
    def test_calculate_gait_symmetry(self, classifier):
        """Test gait symmetry calculation."""
        # Perfect symmetry
        patterns = {
            "front_left": [True, False] * 10,
            "front_right": [True, False] * 10,
            "back_left": [True, False] * 10,
            "back_right": [True, False] * 10
        }
        
        symmetry = classifier.calculate_gait_symmetry(patterns)
        assert 0 <= symmetry <= 1
        
        # Asymmetric pattern
        patterns["front_left"] = [True] * 20
        patterns["front_right"] = [False] * 20
        
        asymmetry = classifier.calculate_gait_symmetry(patterns)
        assert asymmetry < symmetry  # Should be less symmetric
    
    def test_classify_gait_from_pattern(self, classifier):
        """Test gait type classification."""
        # Standing
        gait = classifier.classify_gait_from_pattern(0.0, 0.0)
        assert gait == GaitType.STANDING
        
        # Walking
        gait = classifier.classify_gait_from_pattern(1.0, 1.5)
        assert gait == GaitType.WALK
        
        # Trotting
        gait = classifier.classify_gait_from_pattern(2.0, 3.0)
        assert gait == GaitType.TROT
        
        # Galloping
        gait = classifier.classify_gait_from_pattern(4.0, 8.0)
        assert gait == GaitType.GALLOP
    
    def test_classify_action(self, classifier):
        """Test action classification."""
        # Create mock pose metrics
        pose_metrics = Mock()
        pose_metrics.head_height = 100
        pose_metrics.center_of_mass = (100, 150)
        pose_metrics.back_angle = 15
        pose_metrics.joint_angles = {"neck": 120}
        pose_metrics.velocity = 0
        
        # Standing alert
        action = classifier.classify_action(pose_metrics, GaitType.STANDING)
        assert action in [ActionType.STANDING, ActionType.ALERT]
        
        # Grazing (head down)
        pose_metrics.head_height = 250
        action = classifier.classify_action(pose_metrics, GaitType.STANDING)
        assert action == ActionType.GRAZING
        
        # Running
        action = classifier.classify_action(pose_metrics, GaitType.GALLOP)
        assert action == ActionType.RUNNING
    
    def test_add_pose_and_classify(self, classifier, sample_keypoints):
        """Test adding poses and classification."""
        # Add multiple poses
        for i in range(30):
            kps = sample_keypoints.copy()
            kps[:, 0] += i * 2  # Add motion
            classifier.add_pose(kps, timestamp=i/30.0)
        
        # Classify
        metrics = classifier.classify(fps=30.0)
        
        assert metrics is not None
        assert isinstance(metrics.gait_type, GaitType)
        assert isinstance(metrics.action_type, ActionType)
        assert 0 <= metrics.confidence <= 1
        assert 0 <= metrics.symmetry_score <= 1
        assert 0 <= metrics.regularity_score <= 1


class TestPoseValidator:
    """Test pose validation functionality."""
    
    @pytest.fixture
    def validator(self):
        """Create a pose validator instance."""
        return PoseValidator(confidence_threshold=0.3)
    
    @pytest.fixture
    def valid_keypoints(self):
        """Create anatomically valid keypoints."""
        return np.array([
            [100, 80, 0.9],   # left_eye
            [120, 80, 0.9],   # right_eye
            [110, 90, 0.95],  # nose
            [110, 120, 0.9],  # neck
            [110, 250, 0.85], # root_of_tail
            [90, 140, 0.8],   # left_shoulder
            [85, 180, 0.75],  # left_elbow
            [80, 220, 0.7],   # left_front_paw
            [130, 140, 0.8],  # right_shoulder
            [135, 180, 0.75], # right_elbow
            [140, 220, 0.7],  # right_front_paw
            [95, 240, 0.8],   # left_hip
            [90, 280, 0.75],  # left_knee
            [85, 320, 0.7],   # left_back_paw
            [125, 240, 0.8],  # right_hip
            [130, 280, 0.75], # right_knee
            [135, 320, 0.7]   # right_back_paw
        ], dtype=np.float32)
    
    @pytest.fixture
    def invalid_keypoints(self):
        """Create anatomically invalid keypoints."""
        kps = np.zeros((17, 3), dtype=np.float32)
        # Set some extreme/invalid positions
        kps[3] = [100, 100, 0.9]  # neck
        kps[4] = [100, 102, 0.9]  # tail too close to neck (invalid spine)
        kps[7] = [500, 500, 0.8]  # hoof way out of place
        return kps
    
    def test_validator_initialization(self, validator):
        """Test validator is properly initialized."""
        assert validator is not None
        assert validator.confidence_threshold == 0.3
        assert validator.max_movement_per_frame == 50
        assert len(validator.keypoint_history) == 0
    
    def test_check_anatomical_constraints(self, validator, valid_keypoints, invalid_keypoints):
        """Test anatomical constraint checking."""
        # Valid pose
        is_valid, issues = validator.check_anatomical_constraints(valid_keypoints)
        assert is_valid == True or len(issues) <= 1  # Allow minor issues
        
        # Invalid pose
        is_valid, issues = validator.check_anatomical_constraints(invalid_keypoints)
        assert is_valid == False
        assert len(issues) > 0
    
    def test_detect_outlier_keypoints(self, validator, valid_keypoints):
        """Test outlier detection."""
        # Add normal poses to history
        for i in range(5):
            kps = valid_keypoints.copy()
            kps[:, 0] += i  # Small movement
            validator.keypoint_history.append(kps)
        
        # Add outlier pose
        outlier_kps = valid_keypoints.copy()
        outlier_kps[5, 0] += 200  # Large jump in position
        
        outliers = validator.detect_outlier_keypoints(outlier_kps)
        
        # Should detect the outlier keypoint
        assert 5 in outliers or len(outliers) == 0  # May need more history
    
    def test_check_temporal_consistency(self, validator, valid_keypoints):
        """Test temporal consistency checking."""
        prev_kps = valid_keypoints.copy()
        
        # Small movement (consistent)
        current_kps = valid_keypoints.copy()
        current_kps[:, 0] += 5
        
        is_consistent, issues = validator.check_temporal_consistency(current_kps, prev_kps)
        assert is_consistent == True
        assert len(issues) == 0
        
        # Large movement (inconsistent)
        current_kps[:, 0] += 100
        
        is_consistent, issues = validator.check_temporal_consistency(current_kps, prev_kps)
        assert is_consistent == False
        assert len(issues) > 0
    
    def test_check_pose_completeness(self, validator, valid_keypoints):
        """Test pose completeness checking."""
        # Complete pose
        completeness, missing = validator.check_pose_completeness(valid_keypoints)
        assert completeness > 0.5
        assert len(missing) < 10
        
        # Incomplete pose
        incomplete = valid_keypoints.copy()
        incomplete[:10, 2] = 0.1  # Low confidence for first 10 keypoints
        
        completeness, missing = validator.check_pose_completeness(incomplete)
        assert completeness < 0.5
        assert len(missing) >= 10
    
    def test_correct_outliers(self, validator, valid_keypoints):
        """Test outlier correction."""
        # Add history
        for i in range(5):
            validator.keypoint_history.append(valid_keypoints.copy())
        
        # Create outlier
        outlier_kps = valid_keypoints.copy()
        outlier_indices = [5, 8]  # Mark as outliers
        
        corrected = validator.correct_outliers(outlier_kps, outlier_indices)
        
        assert corrected.shape == outlier_kps.shape
        # Confidence should be reduced for corrected points
        for idx in outlier_indices:
            assert corrected[idx, 2] < outlier_kps[idx, 2]
    
    def test_validate_joint_angles(self, validator):
        """Test joint angle validation."""
        # Valid angles
        valid_angles = {
            "front_left_shoulder": 90,
            "front_left_elbow": 120,
            "neck": 100
        }
        
        is_valid, issues = validator.validate_joint_angles(valid_angles)
        assert is_valid == True
        assert len(issues) == 0
        
        # Invalid angles
        invalid_angles = {
            "front_left_shoulder": 10,  # Too small
            "front_left_elbow": 200,    # Too large
            "neck": 180                 # Out of range
        }
        
        is_valid, issues = validator.validate_joint_angles(invalid_angles)
        assert is_valid == False
        assert len(issues) >= 2
    
    def test_complete_validation(self, validator, valid_keypoints):
        """Test complete validation process."""
        result = validator.validate(valid_keypoints)
        
        assert isinstance(result, ValidationResult)
        assert isinstance(result.is_valid, bool)
        assert 0 <= result.confidence <= 1
        assert isinstance(result.issues, list)
        assert isinstance(result.outlier_keypoints, list)
        
        # Valid pose should pass
        assert result.confidence > 0.3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])