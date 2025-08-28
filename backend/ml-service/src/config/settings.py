"""Configuration settings for ML service using Pydantic."""
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Literal
import os


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Server Configuration
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8002, description="Server port")
    environment: Literal["development", "production", "test"] = Field(
        default="development", description="Environment"
    )
    
    # ML Model Configuration
    ml_device: Literal["cpu", "cuda", "auto"] = Field(
        default="auto", description="ML processing device"
    )
    model_path: str = Field(
        default="/models", description="Path to ML models directory"
    )
    yolo_model: str = Field(
        default="yolo11m.pt", description="Primary YOLO model file"
    )
    yolo_fallback: str = Field(
        default="yolov5m.pt", description="Fallback YOLO model file"
    )
    pose_model: str = Field(
        default="rtmpose-m_ap10k-256.pth", description="RTMPose model file"
    )
    
    # Processing Configuration
    confidence_threshold: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Detection confidence threshold"
    )
    pose_confidence_threshold: float = Field(
        default=0.3, ge=0.0, le=1.0, description="Pose keypoint confidence threshold"
    )
    batch_size: int = Field(
        default=8, ge=1, le=32, description="Batch size for processing"
    )
    max_queue_size: int = Field(
        default=1000, description="Maximum queue size"
    )
    
    # Performance Configuration
    target_fps: int = Field(
        default=50, description="Target processing FPS"
    )
    enable_gpu: bool = Field(
        default=True, description="Enable GPU acceleration if available"
    )
    
    # Redis Configuration
    redis_url: str = Field(
        default="redis://localhost:6379", description="Redis connection URL"
    )
    redis_timeout: int = Field(
        default=30, description="Redis operation timeout in seconds"
    )
    
    # Storage Configuration
    chunk_input_path: str = Field(
        default="/tmp/barnhand/chunks", description="Input chunk directory"
    )
    processed_output_path: str = Field(
        default="/tmp/barnhand/processed", description="Processed chunk output directory"
    )
    retention_hours: int = Field(
        default=24, description="Chunk retention period in hours"
    )
    
    # Logging Configuration
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(
        default="INFO", description="Logging level"
    )
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
settings = Settings()

def get_settings() -> Settings:
    """Get application settings instance."""
    return settings