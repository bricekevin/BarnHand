-- Migration 006: Official Horses System
-- Adds barn capacity tracking and official horse designation

-- Add expected_horse_count to farms table
ALTER TABLE farms ADD COLUMN expected_horse_count INTEGER DEFAULT 0 CHECK (expected_horse_count >= 0);

COMMENT ON COLUMN farms.expected_horse_count IS 'Expected number of horses in this barn. Used as a cap for Re-ID to prevent over-detection.';

-- Add is_official flag to horses table
ALTER TABLE horses ADD COLUMN is_official BOOLEAN DEFAULT FALSE;
ALTER TABLE horses ADD COLUMN made_official_at TIMESTAMPTZ;
ALTER TABLE horses ADD COLUMN made_official_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN horses.is_official IS 'True if this horse has been confirmed as one of the official barn horses. False for guest/transient horses.';
COMMENT ON COLUMN horses.made_official_at IS 'Timestamp when the horse was marked as official';
COMMENT ON COLUMN horses.made_official_by IS 'User who marked the horse as official';

-- Create index for querying official horses
CREATE INDEX idx_horses_official ON horses(farm_id, is_official) WHERE is_official = TRUE;

-- Create index for guest horses (non-official active horses)
CREATE INDEX idx_horses_guest ON horses(farm_id, is_official, last_seen DESC) WHERE is_official = FALSE;

-- Add view for official horse allocation status per farm
CREATE VIEW farm_horse_allocation AS
SELECT
    f.id as farm_id,
    f.name as farm_name,
    f.expected_horse_count,
    COUNT(h.id) FILTER (WHERE h.is_official = TRUE) as official_horse_count,
    COUNT(h.id) FILTER (WHERE h.is_official = FALSE AND h.last_seen > CURRENT_TIMESTAMP - INTERVAL '24 hours') as recent_guest_count,
    f.expected_horse_count - COUNT(h.id) FILTER (WHERE h.is_official = TRUE) as remaining_slots
FROM farms f
LEFT JOIN horses h ON h.farm_id = f.id
GROUP BY f.id, f.name, f.expected_horse_count;

COMMENT ON VIEW farm_horse_allocation IS 'Shows official horse allocation status: how many official horses are designated vs expected capacity';

-- Update find_similar_horses function to prioritize official horses
CREATE OR REPLACE FUNCTION find_similar_horses(
    query_vector VECTOR(512),
    query_farm_id UUID,
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    horse_id UUID,
    similarity FLOAT,
    name VARCHAR(255),
    last_seen TIMESTAMPTZ,
    is_official BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.id,
        1 - (h.feature_vector <=> query_vector) AS similarity,
        h.name,
        h.last_seen,
        h.is_official
    FROM horses h
    WHERE h.feature_vector IS NOT NULL
        AND h.farm_id = query_farm_id
        AND 1 - (h.feature_vector <=> query_vector) >= similarity_threshold
    ORDER BY
        h.is_official DESC,  -- Official horses first
        h.feature_vector <=> query_vector  -- Then by similarity
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_similar_horses IS 'Find similar horses within a farm, prioritizing official horses over guests';
