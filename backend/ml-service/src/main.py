"""FastAPI ML service for horse detection and pose analysis."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import time
from loguru import logger

from .config.settings import settings
from .config.logging import setup_logging
from .services.processor import ChunkProcessor


# Request/Response models
class ChunkProcessRequest(BaseModel):
    chunk_path: str
    stream_id: str
    chunk_id: Optional[str] = None
    start_time: float = 0.0
    metadata: Dict[str, Any] = {}


class BatchProcessRequest(BaseModel):
    chunks: List[ChunkProcessRequest]


class ProcessingResponse(BaseModel):
    chunk_id: str
    stream_id: str
    status: str
    processing_time_ms: float
    detections: List[Dict[str, Any]]
    overlay_data: Dict[str, Any]
    model_info: Dict[str, Any]


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str
    version: str
    uptime: float
    models: Dict[str, Any]
    performance: Dict[str, Any]
    system: Dict[str, Any]


# Global processor instance
processor: Optional[ChunkProcessor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    global processor
    
    # Startup
    setup_logging()
    logger.info("Starting BarnHand ML service")
    
    try:
        processor = ChunkProcessor()
        await processor.initialize()
        logger.info("ML service startup completed")
        yield
    except Exception as error:
        logger.error(f"ML service startup failed: {error}")
        raise
    finally:
        # Shutdown
        logger.info("ML service shutting down")


# Create FastAPI app
app = FastAPI(
    title="BarnHand ML Service",
    description="Horse detection and pose analysis using YOLO11/YOLOv5 + RTMPose",
    version="0.3.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000", "http://localhost:8001"],  # Frontend, API Gateway, Stream Service
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


@app.get("/", response_model=Dict[str, Any])
async def root():
    """Service information endpoint."""
    return {
        "name": "BarnHand ML Service",
        "version": "0.3.0", 
        "description": "Horse detection and pose analysis using YOLO11/YOLOv5 + RTMPose",
        "endpoints": {
            "process": "/api/process",
            "batch": "/api/batch", 
            "health": "/health",
            "models": "/api/models"
        },
        "configuration": {
            "device": str(settings.ml_device),
            "target_fps": settings.target_fps,
            "batch_size": settings.batch_size,
            "confidence_threshold": settings.confidence_threshold,
            "pose_threshold": settings.pose_confidence_threshold
        },
        "environment": settings.environment
    }


@app.post("/api/process", response_model=ProcessingResponse)
async def process_chunk(request: ChunkProcessRequest):
    """Process a single video chunk for horse detection and pose analysis."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    try:
        chunk_metadata = {
            "stream_id": request.stream_id,
            "chunk_id": request.chunk_id,
            "start_time": request.start_time,
            **request.metadata
        }
        
        result = await processor.process_chunk(request.chunk_path, chunk_metadata)
        
        if result["status"] == "failed":
            raise HTTPException(status_code=500, detail=f"Processing failed: {result.get('error')}")
            
        return ProcessingResponse(**result)
        
    except Exception as error:
        logger.error(f"Chunk processing API error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/api/batch", response_model=List[ProcessingResponse])
async def batch_process_chunks(request: BatchProcessRequest):
    """Process multiple video chunks in batch."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    if len(request.chunks) > settings.batch_size:
        raise HTTPException(
            status_code=400, 
            detail=f"Batch size too large. Maximum: {settings.batch_size}, received: {len(request.chunks)}"
        )
        
    try:
        chunk_paths = [chunk.chunk_path for chunk in request.chunks]
        chunk_metadata_list = [
            {
                "stream_id": chunk.stream_id,
                "chunk_id": chunk.chunk_id, 
                "start_time": chunk.start_time,
                **chunk.metadata
            }
            for chunk in request.chunks
        ]
        
        results = await processor.batch_process_chunks(chunk_paths, chunk_metadata_list)
        
        # Convert results to response models
        responses = []
        for result in results:
            if result.get("status") == "completed":
                responses.append(ProcessingResponse(**result))
            else:
                # Handle failed chunks
                responses.append(ProcessingResponse(
                    chunk_id=result.get("chunk_id", "unknown"),
                    stream_id=result.get("stream_id", "unknown"),
                    status="failed",
                    processing_time_ms=result.get("processing_time_ms", 0),
                    detections=[],
                    overlay_data={},
                    model_info={}
                ))
                
        return responses
        
    except Exception as error:
        logger.error(f"Batch processing API error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/api/models", response_model=Dict[str, Any])
async def get_model_info():
    """Get information about loaded ML models."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    try:
        detection_info = processor.detection_model.get_model_info()
        pose_info = processor.pose_model.get_performance_info()
        
        return {
            "detection_model": detection_info,
            "pose_model": pose_info,
            "device": str(settings.ml_device),
            "configuration": {
                "confidence_threshold": settings.confidence_threshold,
                "pose_threshold": settings.pose_confidence_threshold,
                "target_fps": settings.target_fps,
                "batch_size": settings.batch_size
            }
        }
    except Exception as error:
        logger.error(f"Get model info error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/api/models/switch")
async def switch_detection_model(model_type: str):
    """Switch between primary and fallback detection models."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    if model_type not in ["primary", "fallback"]:
        raise HTTPException(status_code=400, detail="model_type must be 'primary' or 'fallback'")
        
    try:
        success = processor.detection_model.switch_model(model_type)
        if success:
            return {"message": f"Switched to {model_type} model successfully"}
        else:
            raise HTTPException(status_code=400, detail=f"{model_type} model not available")
    except Exception as error:
        logger.error(f"Model switch error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with model and performance information."""
    try:
        uptime = time.time() - (getattr(app.state, "start_time", time.time()))
        
        # Get model status
        models_info = {}
        performance_info = {}
        
        if processor:
            models_info = {
                "detection_model": processor.detection_model.get_model_info(),
                "pose_model": processor.pose_model.get_performance_info()
            }
            performance_info = processor.get_stats()
        
        # System information
        import psutil
        system_info = {
            "cpu_percent": psutil.cpu_percent(),
            "memory": {
                "used": psutil.virtual_memory().used,
                "total": psutil.virtual_memory().total,
                "percent": psutil.virtual_memory().percent
            },
            "gpu": self._get_gpu_info()
        }
        
        status = "healthy" if processor else "unhealthy"
        
        return HealthResponse(
            status=status,
            service="ml-service",
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
            version="0.3.0",
            uptime=uptime,
            models=models_info,
            performance=performance_info,
            system=system_info
        )
        
    except Exception as error:
        logger.error(f"Health check error: {error}")
        raise HTTPException(status_code=503, detail="Health check failed")


def _get_gpu_info() -> Dict[str, Any]:
    """Get GPU information if available."""
    try:
        import torch
        if torch.cuda.is_available():
            return {
                "available": True,
                "count": torch.cuda.device_count(),
                "current_device": torch.cuda.current_device(),
                "device_name": torch.cuda.get_device_name(),
                "memory_allocated": torch.cuda.memory_allocated(),
                "memory_reserved": torch.cuda.memory_reserved()
            }
    except Exception:
        pass
        
    return {"available": False}


# Store startup time for uptime calculation
@app.on_event("startup")
async def startup_event():
    """Store startup time for uptime calculation."""
    app.state.start_time = time.time()
    logger.info("ML service ready for processing")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app", 
        host=settings.host, 
        port=settings.port, 
        reload=settings.environment == "development"
    )