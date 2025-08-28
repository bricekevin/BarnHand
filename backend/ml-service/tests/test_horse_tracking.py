"""Tests for horse re-identification and tracking system."""
import pytest
import numpy as np
import cv2
from unittest.mock import Mock, AsyncMock

from src.models.horse_reid import HorseReIDModel
from src.models.horse_tracker import HorseTracker, HorseTrack
from src.services.horse_database import HorseDatabaseService


class TestHorseReIDModel:
    """Test horse re-identification model."""
    
    def test_model_initialization(self):
        """Test ReID model can be initialized."""
        model = HorseReIDModel()
        assert model is not None
        assert model.feature_dimension == 512
        assert model.device is not None
        
    def test_feature_extraction(self):
        """Test feature extraction from horse crop."""
        model = HorseReIDModel()
        
        # Create mock image
        horse_crop = np.random.randint(0, 255, (128, 256, 3), dtype=np.uint8)
        
        # Extract features (will use random fallback since model isn't loaded)
        features = model.extract_features(horse_crop)
        
        assert isinstance(features, np.ndarray)
        assert features.shape == (512,)
        assert features.dtype == np.float32
        
    def test_similarity_search(self):
        """Test FAISS similarity search."""
        model = HorseReIDModel()
        model.load_model()
        
        # Add some test features
        test_features_1 = np.random.randn(512).astype(np.float32)
        test_features_2 = np.random.randn(512).astype(np.float32)
        
        model.add_horse_to_index("horse_001", test_features_1)
        model.add_horse_to_index("horse_002", test_features_2)
        
        # Search for similar features
        similar = model.find_similar_horses(test_features_1, k=2, threshold=0.5)
        
        assert len(similar) >= 1
        assert similar[0][0] == "horse_001"  # Should find itself


class TestHorseTracker:
    """Test horse tracking system."""
    
    def test_tracker_initialization(self):
        """Test tracker can be initialized."""
        tracker = HorseTracker()
        assert tracker is not None
        assert tracker.similarity_threshold == 0.7
        assert len(tracker.tracks) == 0
        
    def test_track_creation(self):
        """Test creating new horse tracks."""
        tracker = HorseTracker()
        
        # Mock detections
        detections = [
            {
                "bbox": {"x": 100, "y": 100, "width": 50, "height": 100},
                "confidence": 0.8
            }
        ]
        
        # Mock frame
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        
        # Mock the ReID model
        tracker.reid_model = Mock()
        tracker.reid_model.extract_features.return_value = np.random.randn(512).astype(np.float32)
        tracker.reid_model.add_horse_to_index = Mock()
        
        # Update tracks
        updated_tracks = tracker.update_tracks(detections, frame, 1.0)
        
        assert len(updated_tracks) == 1
        assert updated_tracks[0]["is_new"] == True
        assert len(tracker.tracks) == 1
        
    def test_track_association(self):
        """Test track association between frames."""
        tracker = HorseTracker()
        
        # Mock the ReID model
        tracker.reid_model = Mock()
        tracker.reid_model.extract_features.return_value = np.random.randn(512).astype(np.float32)
        tracker.reid_model.add_horse_to_index = Mock()
        
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        
        # First frame - create track
        detections_1 = [{"bbox": {"x": 100, "y": 100, "width": 50, "height": 100}, "confidence": 0.8}]
        tracks_1 = tracker.update_tracks(detections_1, frame, 1.0)
        
        # Second frame - same horse slightly moved
        detections_2 = [{"bbox": {"x": 105, "y": 105, "width": 50, "height": 100}, "confidence": 0.9}]
        tracks_2 = tracker.update_tracks(detections_2, frame, 2.0)
        
        assert len(tracks_2) == 1
        assert tracks_2[0]["is_new"] == False  # Should be associated, not new
        assert tracks_2[0]["total_detections"] == 2
        
    def test_similarity_threshold_update(self):
        """Test updating similarity threshold."""
        tracker = HorseTracker()
        
        # Test valid threshold
        tracker.set_similarity_threshold(0.8)
        assert tracker.similarity_threshold == 0.8
        
        # Test invalid threshold (should not change)
        tracker.set_similarity_threshold(1.5)
        assert tracker.similarity_threshold == 0.8
        
    def test_track_confidence_calculation(self):
        """Test track confidence scoring."""
        tracker = HorseTracker()
        
        # Create mock track
        track = HorseTrack(
            id="test_track",
            tracking_id=1,
            color="#ff6b6b",
            feature_vector=np.random.randn(512).astype(np.float32),
            last_bbox={"x": 100, "y": 100, "width": 50, "height": 100},
            last_seen=1.0,
            confidence=0.8,
            first_appearance_features=np.random.randn(512).astype(np.float32)
        )
        
        # Add some appearance history
        track.appearance_history.append({
            "timestamp": 1.0,
            "bbox": {"x": 100, "y": 100, "width": 50, "height": 100},
            "features": np.random.randn(512).astype(np.float32),
            "confidence": 0.8
        })
        track.total_detections = 5
        
        confidence = tracker._calculate_track_confidence(track)
        
        assert 0.0 <= confidence <= 1.0


class TestHorseDatabaseService:
    """Test horse database service."""
    
    @pytest.fixture
    def db_service(self):
        """Create mock database service."""
        service = HorseDatabaseService()
        service.pool = Mock()
        return service
        
    def test_database_initialization(self, db_service):
        """Test database service initialization."""
        assert db_service is not None
        assert db_service.similarity_threshold == 0.7
        
    @pytest.mark.asyncio
    async def test_save_horse(self, db_service):
        """Test saving horse to database."""
        # Mock the database operations
        mock_cursor = Mock()
        mock_conn = Mock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchone.return_value = None  # No existing horse
        
        db_service.pool.getconn.return_value = mock_conn
        db_service.pool.putconn = Mock()
        
        horse_data = {
            "tracking_id": "horse_001",
            "stream_id": "stream_123",
            "color": "#ff6b6b",
            "feature_vector": np.random.randn(512).astype(np.float32),
            "total_detections": 5,
            "track_confidence": 0.85
        }
        
        # This would normally save to database
        result = await db_service.save_horse(horse_data)
        
        assert mock_cursor.execute.called
        assert mock_conn.commit.called


if __name__ == "__main__":
    pytest.main([__file__, "-v"])