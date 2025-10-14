-- Add avatar storage and per-stream horse optimization
-- Migration for Phase 3: Stream Horse Registry

-- Add stream_id to horses table for direct stream association
ALTER TABLE horses
    ADD COLUMN IF NOT EXISTS stream_id UUID REFERENCES streams(id) ON DELETE CASCADE;

-- Add avatar thumbnail column for horse images
ALTER TABLE horses
    ADD COLUMN IF NOT EXISTS avatar_thumbnail BYTEA;

-- Add index on stream_id for fast per-stream horse queries
CREATE INDEX IF NOT EXISTS idx_horses_stream_id ON horses(stream_id);

-- Add combined index for stream + last_seen queries
CREATE INDEX IF NOT EXISTS idx_horses_stream_last_seen ON horses(stream_id, last_seen DESC);

-- Add check constraint to ensure avatar thumbnails are reasonably sized (< 100KB)
-- Note: This is advisory - application should compress images before storage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_avatar_size'
    ) THEN
        ALTER TABLE horses
            ADD CONSTRAINT check_avatar_size
            CHECK (avatar_thumbnail IS NULL OR octet_length(avatar_thumbnail) <= 102400);
    END IF;
END $$;

-- Add comments explaining the new columns
COMMENT ON COLUMN horses.stream_id IS 'Direct stream association for per-stream horse registry (Phase 3)';
COMMENT ON COLUMN horses.avatar_thumbnail IS 'JPEG thumbnail image (base64), compressed to <50KB, 200x200 pixels';

-- Update horses table to support both farm-level (via farm_id) and stream-level (via stream_id) horses
-- A horse can be:
-- 1. Farm-level only (farm_id set, stream_id NULL) - identified horse in global registry
-- 2. Stream-level only (stream_id set, farm_id derived from stream) - detected but unidentified
-- 3. Both (farm_id and stream_id set) - identified horse appearing in specific stream
COMMENT ON TABLE horses IS 'Horse registry supporting both farm-level (identified) and stream-level (detected) horses';
