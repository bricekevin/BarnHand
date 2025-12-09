"""FastAPI ML service for horse detection and pose analysis."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any, Optional
import time
from loguru import logger

from .config.settings import settings
from .config.logging import setup_logging
from .services.processor import ChunkProcessor
from .services.reprocessor import ReprocessorService
from .services.snapshot_detector import get_snapshot_detector, SnapshotDetector


# Request/Response models
class ChunkProcessRequest(BaseModel):
    chunk_path: str
    stream_id: str
    chunk_id: Optional[str] = None
    start_time: float = 0.0
    metadata: Dict[str, Any] = {}


class ChunkWithVideoProcessRequest(BaseModel):
    chunk_path: str
    stream_id: str
    farm_id: str
    chunk_id: str
    output_video_path: str
    output_json_path: str
    start_time: float = 0.0
    frame_interval: int = 1
    metadata: Dict[str, Any] = {}


class BatchProcessRequest(BaseModel):
    chunks: List[ChunkProcessRequest]


class ProcessingResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    chunk_id: str
    stream_id: str
    status: str
    processing_time_ms: float
    detections: List[Dict[str, Any]]
    tracked_horses: List[Dict[str, Any]] = []
    overlay_data: Dict[str, Any]
    model_info: Dict[str, Any]
    tracking_stats: Dict[str, Any] = {}


class ThresholdUpdateRequest(BaseModel):
    threshold: float


class HorseMergeRequest(BaseModel):
    primary_id: str
    secondary_id: str


class HorseSplitRequest(BaseModel):
    horse_id: str
    split_timestamp: float


class CorrectionPayload(BaseModel):
    """Manual correction payload."""
    detection_index: int
    frame_index: int
    correction_type: str  # 'reassign', 'new_guest', 'mark_incorrect'
    original_horse_id: str
    corrected_horse_id: Optional[str] = None
    corrected_horse_name: Optional[str] = None


class ReprocessRequest(BaseModel):
    """Re-processing request."""
    chunk_id: str
    corrections: List[CorrectionPayload]


class ReprocessingStatus(BaseModel):
    """Re-processing status response."""
    chunk_id: str
    status: str  # 'pending', 'running', 'completed', 'failed'
    progress: int  # 0-100
    step: str
    error: Optional[str] = None


class SnapshotDetection(BaseModel):
    """Individual detection in snapshot."""
    bbox: List[float]  # [x1, y1, x2, y2]
    confidence: float
    class_name: Optional[str] = "horse"


class SnapshotDetectionResponse(BaseModel):
    """Response from snapshot detection endpoint."""
    horses_detected: bool
    count: int
    detections: List[SnapshotDetection]
    processing_time_ms: float
    error: Optional[str] = None


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
reprocessor: Optional[ReprocessorService] = None
snapshot_detector: Optional[SnapshotDetector] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    global processor, reprocessor, snapshot_detector

    # Startup
    setup_logging()
    logger.info("Starting BarnHand ML service")

    try:
        processor = ChunkProcessor()
        await processor.initialize()

        reprocessor = ReprocessorService()
        await reprocessor.initialize()

        # Initialize snapshot detector - shares detection model with processor for efficiency
        snapshot_detector = SnapshotDetector(detection_model=processor.detection_model)
        snapshot_detector._model_loaded = True  # Model already loaded by processor
        logger.info("Snapshot detector initialized (sharing detection model)")

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
    description="Horse detection, pose analysis, and re-identification using YOLOv5 + RTMPose + DeepSort",
    version="0.4.0",
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
        "version": "0.4.0",
        "description": "Horse detection and pose analysis using YOLOv5 + RTMPose",
        "endpoints": {
            "process": "/api/process",
            "batch": "/api/batch",
            "detect_snapshot": "/detect-snapshot",
            "health": "/health",
            "models": "/api/models",
            "tracking": "/api/tracking"
        },
        "configuration": {
            "device": str(settings.ml_device),
            "target_fps": settings.target_fps,
            "batch_size": settings.batch_size,
            "confidence_threshold": settings.confidence_threshold,
            "pose_threshold": settings.pose_confidence_threshold,
            "similarity_threshold": 0.7
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
        
        # Transform processor result to match ProcessingResponse model
        response_data = {
            "chunk_id": result.get("chunk_id"),
            "stream_id": result.get("stream_id"), 
            "status": result.get("status"),
            "processing_time_ms": result.get("processing_time_ms"),
            "detections": result.get("frame_results", []),  # Use frame_results as detections
            "tracked_horses": [],  # TODO: Extract from tracking_stats
            "overlay_data": result.get("overlay_data", {}),
            "model_info": result.get("model_info", {}),
            "tracking_stats": result.get("tracking_stats", {})
        }
            
        return ProcessingResponse(**response_data)
        
    except Exception as error:
        logger.error(f"Chunk processing API error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/api/process-chunk")
async def process_chunk_with_video(request: ChunkWithVideoProcessRequest):
    """
    Process chunk and output both processed video with overlays and detections JSON.
    This is the Phase 2 enhancement endpoint that outputs files for serving.
    """
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")

    try:
        chunk_metadata = {
            "stream_id": request.stream_id,
            "farm_id": request.farm_id,
            "chunk_id": request.chunk_id,
            "start_time": request.start_time,
            "frame_interval": request.frame_interval,
            **request.metadata
        }

        result = await processor.process_chunk_with_video_output(
            chunk_path=request.chunk_path,
            chunk_metadata=chunk_metadata,
            output_video_path=request.output_video_path,
            output_json_path=request.output_json_path,
            frame_interval=request.frame_interval
        )

        if result["status"] == "failed":
            raise HTTPException(status_code=500, detail=f"Processing failed: {result.get('error')}")

        return result

    except Exception as error:
        logger.error(f"Chunk processing with video output API error: {error}")
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


@app.post("/detect-snapshot", response_model=SnapshotDetectionResponse)
async def detect_snapshot(
    image: UploadFile = File(...),
    confidence_threshold: float = Form(0.3)
):
    """
    Fast horse detection on a single snapshot image.

    This endpoint is optimized for the PTZ auto-scan feature:
    - YOLO detection only (no pose estimation, no ReID)
    - Lower confidence threshold (default 0.3) for higher recall
    - Target response time: <500ms for 1080p image

    Args:
        image: JPEG or PNG image file
        confidence_threshold: Detection confidence threshold (default 0.3)

    Returns:
        SnapshotDetectionResponse with detection results
    """
    if not snapshot_detector:
        raise HTTPException(status_code=503, detail="Snapshot detector not initialized")

    try:
        # Read image bytes
        image_bytes = await image.read()

        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty image file")

        # Run detection
        result = snapshot_detector.detect_horses_in_snapshot(
            image_bytes=image_bytes,
            confidence_threshold=confidence_threshold
        )

        # Convert detections to response model format
        detections = [
            SnapshotDetection(
                bbox=d["bbox"],
                confidence=d["confidence"],
                class_name=d.get("class_name", "horse")
            )
            for d in result.get("detections", [])
        ]

        return SnapshotDetectionResponse(
            horses_detected=result["horses_detected"],
            count=result["count"],
            detections=detections,
            processing_time_ms=result["processing_time_ms"],
            error=result.get("error")
        )

    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Snapshot detection error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/api/models", response_model=Dict[str, Any])
async def get_model_info():
    """Get information about loaded ML models."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    try:
        detection_info = processor.detection_model.get_model_info()
        pose_info = processor.pose_model.get_performance_info()
        
        tracking_stats = processor.horse_tracker.get_tracking_stats()
        
        return {
            "detection_model": detection_info,
            "pose_model": pose_info,
            "tracking_model": processor.horse_tracker.reid_model.get_model_info(),
            "device": str(settings.ml_device),
            "tracking_stats": tracking_stats,
            "configuration": {
                "confidence_threshold": settings.confidence_threshold,
                "pose_threshold": settings.pose_confidence_threshold,
                "similarity_threshold": tracking_stats.get("similarity_threshold", 0.7),
                "target_fps": settings.target_fps,
                "batch_size": settings.batch_size
            }
        }
    except Exception as error:
        logger.error(f"Get model info error: {error}")
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
                "pose_model": processor.pose_model.get_performance_info(),
            }

            # Add tracking model info if ReID model exists
            if processor.horse_tracker and hasattr(processor.horse_tracker, 'reid_model') and processor.horse_tracker.reid_model:
                models_info["tracking_model"] = processor.horse_tracker.reid_model.get_model_info()
            else:
                models_info["tracking_model"] = {"status": "not loaded", "type": "reid"}

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
            "gpu": _get_gpu_info()
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


# Horse tracking API endpoints
@app.post("/api/tracking/threshold")
async def update_similarity_threshold(request: ThresholdUpdateRequest):
    """Update similarity threshold for horse tracking."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    try:
        success = await processor.update_similarity_threshold(request.threshold)
        if success:
            return {"message": f"Similarity threshold updated to {request.threshold}"}
        else:
            raise HTTPException(status_code=400, detail="Invalid threshold value")
    except Exception as error:
        logger.error(f"Threshold update error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/api/tracking/horses")
async def get_tracked_horses(include_lost: bool = False):
    """Get all currently tracked horses."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    try:
        horses = processor.horse_tracker.get_all_tracks(include_lost=include_lost)
        return {
            "horses": horses,
            "tracking_stats": processor.horse_tracker.get_tracking_stats()
        }
    except Exception as error:
        logger.error(f"Get tracked horses error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/api/tracking/horses/{horse_id}")
async def get_horse_details(horse_id: str):
    """Get detailed information about a specific horse."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    try:
        track = processor.horse_tracker.get_track_by_id(horse_id)
        if not track:
            raise HTTPException(status_code=404, detail=f"Horse {horse_id} not found")
            
        # Get appearance history from database
        appearance_history = await processor.horse_db.get_horse_appearance_history(horse_id)
        
        return {
            "track": track,
            "appearance_history": appearance_history
        }
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Get horse details error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/api/tracking/merge")
async def merge_horses(request: HorseMergeRequest):
    """Merge two horse tracks that are the same horse."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    try:
        success = await processor.merge_horses(request.primary_id, request.secondary_id)
        if success:
            return {"message": f"Successfully merged {request.secondary_id} into {request.primary_id}"}
        else:
            raise HTTPException(status_code=400, detail="Failed to merge horses")
    except Exception as error:
        logger.error(f"Horse merge error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/api/tracking/split")
async def split_horse(request: HorseSplitRequest):
    """Split a horse track that was incorrectly merged."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")
        
    try:
        new_horse_id = await processor.split_horse(request.horse_id, request.split_timestamp)
        if new_horse_id:
            return {
                "message": f"Successfully split horse {request.horse_id}",
                "new_horse_id": new_horse_id
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to split horse")
    except Exception as error:
        logger.error(f"Horse split error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/api/tracking/stats")
async def get_tracking_statistics(stream_id: Optional[str] = None):
    """Get horse tracking statistics."""
    if not processor:
        raise HTTPException(status_code=503, detail="ML service not initialized")

    try:
        db_stats = await processor.horse_db.get_horse_statistics(stream_id)
        tracker_stats = processor.horse_tracker.get_tracking_stats()

        return {
            "database_stats": db_stats,
            "tracker_stats": tracker_stats,
            "combined_stats": {
                "active_tracks": tracker_stats.get("active_tracks", 0),
                "total_horses_in_db": db_stats.get("total_horses", 0),
                "avg_track_confidence": db_stats.get("avg_track_confidence", 0),
                "recent_reidentifications": tracker_stats.get("successful_reidentifications", 0)
            }
        }
    except Exception as error:
        logger.error(f"Get tracking statistics error: {error}")
        raise HTTPException(status_code=500, detail=str(error))


# Re-processing API endpoints (Phase 4)
@app.post("/api/v1/reprocess/chunk/{chunk_id}")
async def trigger_reprocessing(chunk_id: str, request: ReprocessRequest, background_tasks: BackgroundTasks):
    """
    Trigger re-processing of a chunk with manual corrections.

    Returns 202 Accepted immediately and processes asynchronously in background.
    """
    if not reprocessor:
        raise HTTPException(status_code=503, detail="Reprocessor service not initialized")

    try:
        # Validate request
        if request.chunk_id != chunk_id:
            raise HTTPException(status_code=400, detail="Chunk ID mismatch in URL and body")

        if not request.corrections:
            raise HTTPException(status_code=400, detail="No corrections provided")

        # Convert Pydantic models to dicts
        corrections_data = [correction.model_dump() for correction in request.corrections]

        # Queue re-processing task in background
        background_tasks.add_task(
            _run_reprocessing,
            chunk_id,
            corrections_data
        )

        # Store initial status in Redis
        if reprocessor.horse_db.redis_client:
            import json
            status_key = f"reprocessing:{chunk_id}:status"
            status_data = {
                "status": "pending",
                "progress": 0,
                "step": "Queued for processing",
                "updated_at": time.time()
            }
            reprocessor.horse_db.redis_client.setex(
                status_key,
                3600,
                json.dumps(status_data)
            )

        logger.info(f"Queued re-processing for chunk {chunk_id} with {len(corrections_data)} corrections")

        # Return 202 Accepted
        return {
            "message": "Re-processing queued",
            "chunk_id": chunk_id,
            "corrections_count": len(corrections_data),
            "status_url": f"/api/v1/reprocess/chunk/{chunk_id}/status"
        }

    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Failed to trigger re-processing: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/api/v1/reprocess/chunk/{chunk_id}/status", response_model=ReprocessingStatus)
async def get_reprocessing_status(chunk_id: str):
    """
    Get re-processing status for a chunk.

    Returns real-time progress from Redis or database fallback.
    """
    if not reprocessor:
        raise HTTPException(status_code=503, detail="Reprocessor service not initialized")

    try:
        # Check Redis for real-time status
        if reprocessor.horse_db.redis_client:
            import json
            status_key = f"reprocessing:{chunk_id}:status"
            status_json = reprocessor.horse_db.redis_client.get(status_key)

            if status_json:
                status_data = json.loads(status_json)
                return ReprocessingStatus(
                    chunk_id=chunk_id,
                    status=status_data.get("status", "unknown"),
                    progress=status_data.get("progress", 0),
                    step=status_data.get("step", ""),
                    error=status_data.get("error")
                )

        # Fallback: Check database for correction status
        if reprocessor.horse_db.pool:
            conn = reprocessor.horse_db.pool.getconn()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT COUNT(*) as total,
                           COUNT(CASE WHEN status = 'applied' THEN 1 END) as applied,
                           COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
                    FROM detection_corrections
                    WHERE chunk_id = %s
                """, (chunk_id,))

                row = cursor.fetchone()
                if row and row[0] > 0:
                    total, applied, failed = row

                    if failed > 0:
                        return ReprocessingStatus(
                            chunk_id=chunk_id,
                            status="failed",
                            progress=0,
                            step="Re-processing failed",
                            error="Some corrections failed to apply"
                        )
                    elif applied == total:
                        return ReprocessingStatus(
                            chunk_id=chunk_id,
                            status="completed",
                            progress=100,
                            step="Complete"
                        )
                    else:
                        progress = int((applied / total) * 100)
                        return ReprocessingStatus(
                            chunk_id=chunk_id,
                            status="running",
                            progress=progress,
                            step=f"Applied {applied}/{total} corrections"
                        )
            finally:
                reprocessor.horse_db.pool.putconn(conn)

        # No status found
        return ReprocessingStatus(
            chunk_id=chunk_id,
            status="unknown",
            progress=0,
            step="No re-processing found for this chunk"
        )

    except Exception as error:
        logger.error(f"Failed to get re-processing status: {error}")
        raise HTTPException(status_code=500, detail=str(error))


async def _run_reprocessing(chunk_id: str, corrections: List[Dict[str, Any]]):
    """
    Background task for running re-processing.

    Args:
        chunk_id: Chunk ID
        corrections: List of correction dicts
    """
    try:
        logger.info(f"Starting background re-processing for chunk {chunk_id}")
        result = await reprocessor.reprocess_chunk(chunk_id, corrections)
        logger.info(f"Background re-processing completed: {result.to_dict()}")
    except Exception as error:
        logger.error(f"Background re-processing failed: {error}")
        import traceback
        traceback.print_exc()


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