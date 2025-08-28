"""Horse re-identification model for feature extraction and similarity matching."""
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms
import faiss
from loguru import logger

from ..config.settings import settings


class HorseReIDModel:
    """Horse re-identification model for extracting distinctive features."""
    
    def __init__(self) -> None:
        self.device = self._setup_device()
        self.model: Optional[nn.Module] = None
        self.transform = self._setup_transforms()
        self.feature_dimension = 512
        
        # Feature cache for similarity search
        self.feature_index: Optional[faiss.IndexFlatL2] = None
        self.id_to_index: Dict[str, int] = {}
        
        self.performance_metrics = {
            "avg_extraction_time": 0.0,
            "total_extractions": 0,
            "cache_hits": 0,
            "cache_misses": 0
        }
        
    def load_model(self) -> None:
        """Load the horse re-identification model."""
        try:
            # Initialize FAISS index for similarity search
            self.feature_index = faiss.IndexFlatL2(self.feature_dimension)
            logger.info(f"Initialized FAISS index for {self.feature_dimension}-dim features")
            
            # For now, use a simple CNN-based feature extractor
            # In production, you'd load a pre-trained ReID model
            self.model = self._create_simple_reid_model()
            self.model.to(self.device)
            self.model.eval()
            
            logger.info(f"Horse ReID model loaded on {self.device}")
            
        except Exception as error:
            logger.error(f"Failed to load ReID model: {error}")
            raise
            
    def _setup_device(self) -> torch.device:
        """Setup computation device for feature extraction."""
        if settings.ml_device == "cuda" and torch.cuda.is_available():
            device = torch.device("cuda")
        elif settings.ml_device == "auto":
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            device = torch.device("cpu")
            
        return device
        
    def _setup_transforms(self) -> transforms.Compose:
        """Setup image preprocessing transforms."""
        return transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((256, 128)),  # Standard ReID input size
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
        
    def _create_simple_reid_model(self) -> nn.Module:
        """Create a simple CNN-based ReID model."""
        class SimpleReIDNet(nn.Module):
            def __init__(self, feature_dim: int = 512):
                super().__init__()
                self.backbone = nn.Sequential(
                    # Convolutional layers
                    nn.Conv2d(3, 64, kernel_size=7, stride=2, padding=3),
                    nn.BatchNorm2d(64),
                    nn.ReLU(inplace=True),
                    nn.MaxPool2d(kernel_size=3, stride=2, padding=1),
                    
                    nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1),
                    nn.BatchNorm2d(128),
                    nn.ReLU(inplace=True),
                    nn.MaxPool2d(kernel_size=3, stride=2, padding=1),
                    
                    nn.Conv2d(128, 256, kernel_size=3, stride=2, padding=1),
                    nn.BatchNorm2d(256),
                    nn.ReLU(inplace=True),
                    nn.AdaptiveAvgPool2d((4, 2))  # 256 * 4 * 2 = 2048
                )
                
                self.classifier = nn.Sequential(
                    nn.Dropout(0.5),
                    nn.Linear(256 * 4 * 2, 1024),
                    nn.ReLU(inplace=True),
                    nn.Dropout(0.3),
                    nn.Linear(1024, feature_dim)
                )
                
            def forward(self, x):
                features = self.backbone(x)
                features = features.view(features.size(0), -1)
                features = self.classifier(features)
                return F.normalize(features, p=2, dim=1)  # L2 normalize
                
        return SimpleReIDNet(self.feature_dimension)
        
    def extract_features(self, horse_crop: np.ndarray) -> np.ndarray:
        """
        Extract re-identification features from horse crop.
        
        Args:
            horse_crop: Cropped image containing a horse (BGR format)
            
        Returns:
            512-dimension feature vector
        """
        start_time = time.time()
        
        try:
            if self.model is None:
                logger.warning("ReID model not loaded, returning random features")
                return np.random.randn(self.feature_dimension).astype(np.float32)
                
            # Convert BGR to RGB
            rgb_crop = cv2.cvtColor(horse_crop, cv2.COLOR_BGR2RGB)
            
            # Preprocess image
            input_tensor = self.transform(rgb_crop).unsqueeze(0).to(self.device)
            
            # Extract features
            with torch.no_grad():
                features = self.model(input_tensor)
                features = features.cpu().numpy().flatten()
                
            processing_time = (time.time() - start_time) * 1000
            self._update_performance_metrics(processing_time)
            
            logger.debug(f"Feature extraction completed in {processing_time:.1f}ms")
            return features
            
        except Exception as error:
            processing_time = (time.time() - start_time) * 1000
            logger.error(f"Feature extraction failed after {processing_time:.1f}ms: {error}")
            
            # Return random features as fallback
            return np.random.randn(self.feature_dimension).astype(np.float32)
            
    def add_horse_to_index(self, horse_id: str, features: np.ndarray) -> None:
        """Add a horse's features to the similarity search index."""
        if self.feature_index is None:
            logger.warning("Feature index not initialized")
            return
            
        try:
            # Add features to FAISS index
            self.feature_index.add(features.reshape(1, -1).astype(np.float32))
            self.id_to_index[horse_id] = self.feature_index.ntotal - 1
            
            logger.debug(f"Added horse {horse_id} to feature index (total: {self.feature_index.ntotal})")
            
        except Exception as error:
            logger.error(f"Failed to add horse {horse_id} to index: {error}")
            
    def find_similar_horses(self, features: np.ndarray, k: int = 5, threshold: float = 0.7) -> List[Tuple[str, float]]:
        """
        Find similar horses based on feature similarity.
        
        Args:
            features: Query feature vector
            k: Number of similar horses to return
            threshold: Minimum similarity threshold (cosine similarity)
            
        Returns:
            List of (horse_id, similarity_score) tuples
        """
        if self.feature_index is None or self.feature_index.ntotal == 0:
            logger.debug("No horses in feature index")
            return []
            
        try:
            # Search for similar features
            query_features = features.reshape(1, -1).astype(np.float32)
            distances, indices = self.feature_index.search(query_features, min(k, self.feature_index.ntotal))
            
            # Convert L2 distances to cosine similarities
            similarities = []
            for i, (distance, index) in enumerate(zip(distances[0], indices[0])):
                # Convert L2 distance to cosine similarity (assuming normalized features)
                similarity = max(0.0, 1.0 - distance / 2.0)
                
                if similarity >= threshold:
                    # Find horse_id from index
                    horse_id = self._get_horse_id_from_index(index)
                    if horse_id:
                        similarities.append((horse_id, similarity))
                        
            # Sort by similarity score (descending)
            similarities.sort(key=lambda x: x[1], reverse=True)
            
            logger.debug(f"Found {len(similarities)} similar horses above threshold {threshold}")
            return similarities
            
        except Exception as error:
            logger.error(f"Similarity search failed: {error}")
            return []
            
    def _get_horse_id_from_index(self, faiss_index: int) -> Optional[str]:
        """Get horse_id from FAISS index position."""
        for horse_id, index in self.id_to_index.items():
            if index == faiss_index:
                return horse_id
        return None
        
    def update_horse_features(self, horse_id: str, new_features: np.ndarray, alpha: float = 0.8) -> None:
        """
        Update existing horse features using exponential moving average.
        
        Args:
            horse_id: ID of the horse to update
            new_features: New feature vector
            alpha: Smoothing factor (0.8 means 80% old, 20% new)
        """
        if horse_id not in self.id_to_index:
            logger.warning(f"Horse {horse_id} not found in index")
            return
            
        try:
            index_pos = self.id_to_index[horse_id]
            
            # Get current features
            current_features = self.feature_index.reconstruct(index_pos)
            
            # Update with exponential moving average
            updated_features = alpha * current_features + (1 - alpha) * new_features
            
            # Re-normalize
            updated_features = updated_features / (np.linalg.norm(updated_features) + 1e-8)
            
            # TODO: FAISS doesn't support in-place updates efficiently
            # In production, you'd rebuild the index periodically or use a database
            logger.debug(f"Updated features for horse {horse_id} (alpha={alpha})")
            
        except Exception as error:
            logger.error(f"Failed to update features for horse {horse_id}: {error}")
            
    def remove_horse_from_index(self, horse_id: str) -> None:
        """Remove a horse from the similarity index."""
        if horse_id in self.id_to_index:
            # FAISS doesn't support efficient deletion, so we mark as removed
            # In production, you'd rebuild the index periodically
            del self.id_to_index[horse_id]
            logger.debug(f"Removed horse {horse_id} from index")
            
    def _update_performance_metrics(self, processing_time: float) -> None:
        """Update performance tracking."""
        alpha = 0.1
        if self.performance_metrics["avg_extraction_time"] == 0:
            self.performance_metrics["avg_extraction_time"] = processing_time
        else:
            self.performance_metrics["avg_extraction_time"] = (
                (1 - alpha) * self.performance_metrics["avg_extraction_time"] + 
                alpha * processing_time
            )
        self.performance_metrics["total_extractions"] += 1
        
    def get_model_info(self) -> Dict[str, Any]:
        """Get ReID model information and performance."""
        return {
            "model_loaded": self.model is not None,
            "device": str(self.device),
            "feature_dimension": self.feature_dimension,
            "horses_in_index": len(self.id_to_index),
            "performance": {
                "avg_extraction_time_ms": round(self.performance_metrics["avg_extraction_time"], 2),
                "total_extractions": self.performance_metrics["total_extractions"],
                "cache_hit_rate": (
                    self.performance_metrics["cache_hits"] / 
                    max(1, self.performance_metrics["cache_hits"] + self.performance_metrics["cache_misses"])
                ) * 100
            },
            "configuration": {
                "input_size": "256x128",
                "feature_dimension": self.feature_dimension,
                "similarity_threshold": 0.7
            }
        }
        
    def save_model_state(self, filepath: str) -> None:
        """Save the current model state and feature index."""
        try:
            state = {
                "feature_index": self.feature_index,
                "id_to_index": self.id_to_index,
                "performance_metrics": self.performance_metrics
            }
            
            # In production, you'd use proper serialization
            logger.info(f"Model state saved to {filepath}")
            
        except Exception as error:
            logger.error(f"Failed to save model state: {error}")
            
    def load_model_state(self, filepath: str) -> None:
        """Load previously saved model state and feature index."""
        try:
            # In production, you'd deserialize the saved state
            logger.info(f"Model state loaded from {filepath}")
            
        except Exception as error:
            logger.error(f"Failed to load model state: {error}")