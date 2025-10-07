-- Add ML processing columns to video_chunks table
-- Migration for Phase 2: ML Chunk Processing

-- Add new columns for ML processing tracking
ALTER TABLE video_chunks
    ADD COLUMN IF NOT EXISTS detections_path TEXT,
    ADD COLUMN IF NOT EXISTS ml_processed BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS processing_status VARCHAR(50) DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'queued', 'processing', 'complete', 'failed', 'timeout')),
    ADD COLUMN IF NOT EXISTS processing_time_seconds FLOAT,
    ADD COLUMN IF NOT EXISTS ml_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ml_completed_at TIMESTAMPTZ;

-- Add index for querying processed chunks
CREATE INDEX IF NOT EXISTS idx_video_chunks_ml_processed ON video_chunks(ml_processed, processing_status);

-- Add index for processing queue (pending/queued chunks ordered by creation)
CREATE INDEX IF NOT EXISTS idx_video_chunks_processing_queue ON video_chunks(processing_status, created_at)
    WHERE processing_status IN ('pending', 'queued');

-- Add comment explaining the column usage
COMMENT ON COLUMN video_chunks.detections_path IS 'Path to JSON file containing frame-by-frame detection data';
COMMENT ON COLUMN video_chunks.ml_processed IS 'True if ML processing completed successfully';
COMMENT ON COLUMN video_chunks.processing_status IS 'Current ML processing status: pending (not started), queued (waiting), processing (in progress), complete (success), failed (error), timeout (exceeded time limit)';
COMMENT ON COLUMN video_chunks.processing_time_seconds IS 'Total time taken for ML processing in seconds';
COMMENT ON COLUMN video_chunks.ml_started_at IS 'Timestamp when ML processing began';
COMMENT ON COLUMN video_chunks.ml_completed_at IS 'Timestamp when ML processing finished (success or failure)';

-- Note: processed_path and original_path already exist in the schema
-- processed_path will store the path to the processed video with overlays
-- original_path stores the raw recorded chunk
