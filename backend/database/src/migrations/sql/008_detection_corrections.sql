-- Detection Corrections and Re-Processing Support
-- Migration for Phase 4: Detection Correction & Re-Processing

-- Create detection_corrections table for tracking manual horse assignment corrections
CREATE TABLE IF NOT EXISTS detection_corrections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chunk_id UUID REFERENCES video_chunks(id) ON DELETE CASCADE,
    detection_index INTEGER NOT NULL,
    frame_index INTEGER NOT NULL,
    correction_type VARCHAR(50) NOT NULL CHECK (correction_type IN ('reassign', 'new_guest', 'mark_incorrect')),
    original_horse_id VARCHAR(255),
    corrected_horse_id VARCHAR(255),
    corrected_horse_name VARCHAR(255),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    applied_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed')),
    error_message TEXT,
    CONSTRAINT fk_chunk FOREIGN KEY (chunk_id) REFERENCES video_chunks(id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for efficient correction queries
CREATE INDEX IF NOT EXISTS idx_corrections_chunk_id ON detection_corrections(chunk_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON detection_corrections(status);
CREATE INDEX IF NOT EXISTS idx_corrections_chunk_status ON detection_corrections(chunk_id, status);
CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON detection_corrections(user_id);
CREATE INDEX IF NOT EXISTS idx_corrections_created_at ON detection_corrections(created_at DESC);

-- Add correction tracking columns to video_chunks table
ALTER TABLE video_chunks
    ADD COLUMN IF NOT EXISTS last_corrected TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS correction_count INTEGER DEFAULT 0 CHECK (correction_count >= 0);

-- Create index for finding recently corrected chunks
CREATE INDEX IF NOT EXISTS idx_chunks_last_corrected ON video_chunks(last_corrected DESC) WHERE last_corrected IS NOT NULL;

-- Add comments explaining the new table and columns
COMMENT ON TABLE detection_corrections IS 'Manual corrections to horse detection assignments, triggering chunk re-processing';
COMMENT ON COLUMN detection_corrections.chunk_id IS 'Reference to the video chunk being corrected';
COMMENT ON COLUMN detection_corrections.detection_index IS 'Index of the detection within the chunk''s detection array';
COMMENT ON COLUMN detection_corrections.frame_index IS 'Frame number within the chunk (0-based)';
COMMENT ON COLUMN detection_corrections.correction_type IS 'Type of correction: reassign (to existing horse), new_guest (create new horse), mark_incorrect (remove detection)';
COMMENT ON COLUMN detection_corrections.original_horse_id IS 'Horse ID before correction';
COMMENT ON COLUMN detection_corrections.corrected_horse_id IS 'Horse ID after correction (for reassign type)';
COMMENT ON COLUMN detection_corrections.corrected_horse_name IS 'Generated name for new guest horses (for new_guest type)';
COMMENT ON COLUMN detection_corrections.user_id IS 'User who submitted the correction';
COMMENT ON COLUMN detection_corrections.applied_at IS 'Timestamp when re-processing completed and correction was applied';
COMMENT ON COLUMN detection_corrections.status IS 'Correction status: pending (queued), applied (completed), failed (error during re-processing)';
COMMENT ON COLUMN detection_corrections.error_message IS 'Error details if re-processing failed';

COMMENT ON COLUMN video_chunks.last_corrected IS 'Timestamp of most recent correction applied to this chunk';
COMMENT ON COLUMN video_chunks.correction_count IS 'Total number of corrections applied to this chunk (for audit trail)';
