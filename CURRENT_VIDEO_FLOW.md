# Current Video Playback Flow - BarnHand Phase 0 Analysis

**Date**: 2025-10-06
**Purpose**: Document current video flow before Phase 2 ML chunk processing integration

---

## Overview

BarnHand currently has **two separate video playback systems**:

1. **Live HLS Streaming** - Continuous video streams from video-streamer service
2. **Recorded Video Chunks** - Short MP4 clips recorded on-demand from live streams

This document maps the current implementation to prepare for Phase 2, which will add ML processing to recorded chunks.

---

## 1. Live HLS Streaming Flow

### Backend Services

#### Video Streamer Service (Port 8003)

- **Location**: `backend/video-streamer/`
- **Purpose**: Serves continuous HLS streams from video files
- **Key Files**:
  - `src/routes/streams.ts` - Stream management API
  - `src/services/StreamManager.ts` - FFmpeg process management
  - `src/services/VideoScanner.ts` - Scans media folder for videos

**Endpoints**:

- `GET /streams` - List all active streams
- `POST /streams/start/:streamId` - Start stream with video file
- `POST /streams/stop/:streamId` - Stop a stream
- `GET /streams/:streamId/health` - Check stream health

**HLS Output**:

- Playlist URL: `http://localhost:8003/{streamId}/playlist.m3u8`
- Segments: `http://localhost:8003/{streamId}/segment_{N}.ts`
- Uses FFmpeg to continuously transcode video files into HLS format

### Frontend Integration

**VideoPlayer Component** (`frontend/src/components/VideoPlayer.tsx`):

- Uses **HLS.js** library for HLS stream playback
- Detects `.m3u8` URLs and initializes HLS player
- **Live stream mode**: Optimized for low-latency live playback
  - `liveSyncDurationCount: 1` - Stay close to live edge
  - `maxBufferLength: 20` - Short buffer for live
  - Buffer monitoring and recovery logic

**StreamCard Component** (`frontend/src/components/StreamCard.tsx`):

- Wraps VideoPlayer
- Displays stream status (active/inactive/processing/error)
- Passes stream URL directly to VideoPlayer

**Typical Live Stream URL**:

```
http://localhost:8003/stream1/playlist.m3u8
```

---

## 2. Recorded Video Chunks Flow (Current - NO ML)

### Backend Services

#### API Gateway Service (Port 8000)

**Location**: `backend/api-gateway/src/routes/streams.ts`

**Critical Endpoint**:

```typescript
POST /api/v1/streams/:id/record-chunk
```

- **Line 340-388** in `streams.ts`
- Accepts: `{ duration: number }` (default 5 seconds)
- Calls: `videoChunkService.recordChunk()`
- Returns: Chunk ID and status immediately
- Recording happens **asynchronously**

#### Video Chunk Service

**Location**: `backend/api-gateway/src/services/videoChunkService.ts`

**Core Responsibilities**:

1. **Record chunks** using FFmpeg from live HLS streams
2. **Store chunks** in filesystem at `/chunks/{farmId}/{streamId}/`
3. **Serve chunk URLs** for playback

**Key Methods**:

```typescript
// Record chunk from live stream (Lines 131-193)
async recordChunk(
  streamId: string,
  farmId: string,
  userId: string,
  sourceUrl: string,
  duration: number = 5
): Promise<VideoChunk>
```

- Converts external URLs to Docker internal URLs
- Creates directory: `/chunks/{farmId}/{streamId}/`
- Filename format: `chunk_{streamId}_{timestamp}.mp4`
- FFmpeg command:
  ```bash
  ffmpeg -y -i {source_url} -t {duration} -c copy \
    -avoid_negative_ts make_zero -f mp4 -movflags faststart \
    {output_path}
  ```
- Returns immediately with chunk metadata
- Recording completes asynchronously
- Updates chunk status: `recording` → `completed` or `failed`

```typescript
// Get chunk playback URL (Lines 479-488)
async getChunkStreamUrl(chunkId: string, farmId: string): Promise<string | null>
```

- **Current Return** (Line 487):
  ```typescript
  return `http://localhost:8003/chunks/${farmId}/${streamId}/${filename}`;
  ```
- **⚠️ IMPORTANT**: This URL points to video-streamer, but **no chunks endpoint exists**
- **This is the endpoint we'll modify in Phase 2**

**VideoChunk Data Structure** (Lines 11-32):

```typescript
interface VideoChunk {
  id: string;
  stream_id: string;
  farm_id: string;
  user_id: string;
  filename: string;
  file_path: string; // Local filesystem path
  file_size: number;
  duration: number;
  start_timestamp: Date;
  end_timestamp: Date;
  source_url: string;
  status: 'recording' | 'completed' | 'failed';
  metadata: {
    codec?: string;
    resolution?: string;
    bitrate?: number;
    fps?: number;
  };
  created_at: Date;
  updated_at: Date;
}
```

**Storage Path**:

- Environment variable: `CHUNK_STORAGE_PATH` (default `/app/storage/chunks`)
- Local dev override possible
- Structure: `{CHUNK_STORAGE_PATH}/{farmId}/{streamId}/{filename}`

**Example**:

```
/app/storage/chunks/farm1/stream1/chunk_stream1_1733511234567.mp4
```

### Frontend Integration

**VideoPlayer Component** handles both stream types:

- **HLS Detection** (Line 84): Checks if URL contains `.m3u8`
- **MP4 Detection** (Line 84): Checks if URL contains `.mp4`
- **MP4 Mode** (Lines 86-117):
  - Destroys HLS instance if exists
  - Sets `video.src` directly to MP4 URL
  - Auto-plays on metadata load
  - No HLS.js configuration needed

**Current Chunk Playback Flow**:

1. User clicks "Record Chunk" in UI
2. Frontend calls `POST /api/v1/streams/:id/record-chunk`
3. Backend returns chunk ID immediately
4. Frontend calls `GET /api/v1/streams/:id/chunks/:chunkId/stream`
5. Backend returns URL: `http://localhost:8003/chunks/{farmId}/{streamId}/{filename}`
6. Frontend passes URL to VideoPlayer
7. VideoPlayer detects `.mp4` extension
8. Video plays directly from file

---

## 3. Current Chunk List & Retrieval

**API Endpoints** (in `streams.ts`):

```typescript
// List all chunks for a stream (Lines 391-434)
GET /api/v1/streams/:id/chunks
```

- Calls `videoChunkService.getChunksForStream(streamId, farmId)`
- Scans filesystem for `*.mp4` files in stream directory
- Returns array of chunk metadata
- **Sorted by creation time, newest first**

```typescript
// Get chunk playback URL (Lines 436-466)
GET /api/v1/streams/:id/chunks/:chunkId/stream
```

- Calls `videoChunkService.getChunkStreamUrl(chunkId, farmId)`
- Returns: `{ chunkId, streamUrl, format: 'mp4', available: true }`

```typescript
// Delete chunk (Lines 468-498)
DELETE /api/v1/streams/:id/chunks/:chunkId
```

- Deletes file from filesystem
- TODO: Delete from database when implemented

---

## 4. Key Findings for Phase 2 Integration

### ✅ What Works Well

1. **Clean separation** between live streaming and chunk recording
2. **VideoPlayer component** already handles both HLS and MP4
3. **Async recording** prevents blocking API requests
4. **Filesystem-based storage** is simple and works
5. **Chunk metadata** structure is comprehensive

### ⚠️ Current Limitations (Phase 2 Will Address)

1. **No ML processing** - chunks are raw video only
2. **No detection data** - no horse tracking, pose, or states
3. **No processed video** - no overlays, bounding boxes, or keypoints
4. **No database** - chunks stored only in filesystem, metadata reconstructed from files
5. **Video serving endpoint doesn't exist** - `http://localhost:8003/chunks/...` returns 404

### 🎯 Critical Endpoints to Modify

#### 1. `videoChunkService.getChunkStreamUrl()` (Line 479-488)

**Current**:

```typescript
return `http://localhost:8003/chunks/${farmId}/${streamId}/${filename}`;
```

**Phase 2 Changes**:

```typescript
// Check if ML processed version exists
if (chunk.ml_processed && chunk.processed_video_path) {
  // Serve processed video (with overlays)
  return `http://localhost:8003/chunks/${farmId}/${streamId}/processed/${filename}`;
} else {
  // Serve raw video
  return `http://localhost:8003/chunks/${farmId}/${streamId}/raw/${filename}`;
}

// Support ?raw=true query param to force raw video
if (req.query.raw === 'true') {
  return rawVideoUrl;
}
```

#### 2. `POST /api/v1/streams/:id/record-chunk` (Line 340-388)

**Current**:

```typescript
const chunk = await videoChunkService.recordChunk(...);
return res.status(202).json({ chunk });
```

**Phase 2 Changes**:

```typescript
const chunk = await videoChunkService.recordChunk(...);

// Save chunk to database with ml_processed=false
await saveChunkToDatabase(chunk);

// Trigger ML processing asynchronously
await triggerMLProcessing(chunk);

return res.status(202).json({ chunk });
```

---

## 5. Database Schema Requirements (Phase 2)

**New columns for `video_chunks` table**:

```sql
ALTER TABLE video_chunks ADD COLUMN processed_video_path TEXT;
ALTER TABLE video_chunks ADD COLUMN detections_path TEXT;
ALTER TABLE video_chunks ADD COLUMN ml_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE video_chunks ADD COLUMN processing_status TEXT; -- 'pending', 'processing', 'complete', 'failed'
ALTER TABLE video_chunks ADD COLUMN processing_time_seconds FLOAT;
```

---

## 6. ML Processing Integration Points

### New Service: ChunkProcessor (ML Service)

**Location**: `backend/ml-service/src/services/chunk_processor.py`

**Based on**: `backend/ml-service/test_advanced_state_pipeline.py` (Working reference)

**Inputs**:

- `chunk_id`: String
- `chunk_path`: File path to raw MP4
- `farm_id`: String
- `stream_id`: String

**Outputs**:

1. **Processed Video**: `/chunks/{farmId}/{streamId}/processed/{chunkId}_processed.mp4`
   - Contains: Bounding boxes, horse IDs, pose keypoints, state labels
2. **Detections JSON**: `/chunks/{farmId}/{streamId}/detections/{chunkId}_detections.json`
   - Schema:
     ```json
     {
       "video_metadata": { "fps": 30, "duration": 5, "resolution": "1920x1080" },
       "summary": { "total_horses": 2, "total_frames": 150, "processing_time": 12.5 },
       "horses": [
         { "id": "horse_001", "color": "#FF5733", "total_detections": 145, "avg_confidence": 0.92 }
       ],
       "frames": [
         {
           "frame_id": 0,
           "timestamp": 0.0,
           "detections": [
             {
               "horse_id": "horse_001",
               "bbox": [100, 200, 300, 400],
               "confidence": 0.95,
               "pose_keypoints": [[x1, y1, conf1], ...],
               "state": { "body": "standing", "head": "down", "temporal": "eating" }
             }
           ]
         }
       ]
     }
     ```

### New ML Service Endpoint

**Location**: `backend/ml-service/src/main.py`

```python
@app.post("/api/process-chunk")
async def process_chunk(request: ChunkProcessRequest):
    """
    Process video chunk with YOLO + RTMPose + ReID + State Detection
    """
    processor = ChunkProcessor()
    result = await processor.process(
        chunk_id=request.chunk_id,
        chunk_path=request.chunk_path,
        farm_id=request.farm_id,
        stream_id=request.stream_id
    )

    return {
        "chunk_id": request.chunk_id,
        "processed_video_path": result.processed_video_path,
        "detections_path": result.detections_path,
        "status": "complete",
        "summary": result.summary
    }
```

---

## 7. Frontend Changes Required

### VideoPlayer Component

**Add toggle for raw vs processed**:

```typescript
interface VideoPlayerProps {
  src: string;
  showRaw?: boolean; // NEW: Toggle between raw and processed
  chunkId?: string; // NEW: For fetching processing status
}
```

### New Component: DetectionDataPanel

**Location**: `frontend/src/components/DetectionDataPanel.tsx`

**Features**:

- Display horse count, processing time, frame count
- List horses with IDs, colors, states
- Timeline scrubber for frame navigation
- Collapsible JSON view

### Chunk List Component Updates

- Show processing status badge: "🔄 Processing", "✓ Processed", "⚠️ Failed", "📹 Raw"
- Poll status endpoint every 2s while processing
- Display processing time when complete

---

## 8. Video Serving Architecture (Phase 2)

### Option A: Serve through Video-Streamer (Recommended)

**Add new endpoint to video-streamer**:

```typescript
GET /chunks/:farmId/:streamId/raw/:filename
GET /chunks/:farmId/:streamId/processed/:filename
```

**Advantages**:

- Centralized video serving
- Can add rate limiting, caching
- Consistent with HLS streaming

### Option B: Serve through API Gateway

**Add static file serving in API Gateway**:

```typescript
GET /api/v1/chunks/:farmId/:streamId/video?type=raw|processed
```

**Advantages**:

- Authentication already in place
- Simpler architecture
- No additional service needed

**Recommendation**: **Option A** - Keep video-streamer as single source for all video content

---

## 9. Implementation Order (Per p2.md)

Following the task list in `p2.md`:

**Phase 0: Map Current System** ✅ COMPLETE (this document)

**Phase 1: ML Service Core**

1. Create ChunkProcessor (port from test_advanced_state_pipeline.py)
2. Add ML service endpoint POST /api/process-chunk
3. Verify models load in Docker

**Phase 2: API Gateway Integration** 4. Add database columns for ML processing 5. Update record-chunk to trigger ML processing 6. **Modify getChunkStreamUrl** to serve processed vs raw 7. Add detections endpoint GET /api/v1/chunks/:chunkId/detections 8. Add status endpoint GET /api/v1/chunks/:chunkId/status

**Phase 3: Frontend Display** 9. Update VideoPlayer with raw/processed toggle 10. Create DetectionDataPanel component 11. Update chunk list with status badges

**Phase 4: Testing & Polish** 12. End-to-end testing 13. Error handling 14. Performance optimization

---

## 10. Critical Implementation Notes

### Don't Create Parallel Systems

- **Modify existing `getChunkStreamUrl()`** - don't create new endpoints
- **Enhance VideoPlayer** - don't create separate processed video player
- **Extend video_chunks table** - don't create new tables

### Async Processing is Key

- Chunk recording must return immediately (already works)
- ML processing happens in background
- Frontend polls for status updates
- Raw video plays immediately, switches to processed when ready

### Storage Structure

```
/chunks/
  ├── {farmId}/
  │   ├── {streamId}/
  │   │   ├── raw/
  │   │   │   ├── chunk_{streamId}_{timestamp}.mp4
  │   │   ├── processed/
  │   │   │   ├── chunk_{streamId}_{timestamp}_processed.mp4
  │   │   ├── detections/
  │   │   │   ├── chunk_{streamId}_{timestamp}_detections.json
```

### Working ML Pipeline Reference

**File**: `backend/ml-service/test_advanced_state_pipeline.py`

This file contains:

- ✅ YOLO11 + RTMPose + Wildlife ReID integration
- ✅ Advanced state detection (standing, walking, running, lying, head position)
- ✅ Overlay rendering with bounding boxes, IDs, keypoints, states
- ✅ Timeline JSON output with frame-by-frame data

**Use this as the foundation for ChunkProcessor**

---

## Summary

The current system has two separate video flows:

1. **Live streaming** via HLS (works perfectly)
2. **Chunk recording** via FFmpeg (works, but no ML processing)

Phase 2 will enhance chunk recording by:

1. Adding ML processing after recording completes
2. Generating processed videos with overlays
3. Storing detection data in JSON
4. Serving processed videos when available
5. Allowing toggle between raw and processed views

**Next Step**: Begin Phase 1.1 - Create ChunkProcessor service
