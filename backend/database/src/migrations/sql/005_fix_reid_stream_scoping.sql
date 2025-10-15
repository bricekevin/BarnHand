-- Migration 005: Fix Re-ID cross-stream matching
-- Add stream_id parameter to find_similar_horses function for stream-scoped Re-identification

-- Drop existing function
DROP FUNCTION IF EXISTS find_similar_horses(VECTOR(512), FLOAT, INTEGER);

-- Create new version with optional stream_id parameter
CREATE OR REPLACE FUNCTION find_similar_horses(
    query_vector VECTOR(512),
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 10,
    filter_stream_id UUID DEFAULT NULL,
    filter_farm_id UUID DEFAULT NULL
)
RETURNS TABLE(
    horse_id UUID,
    similarity FLOAT,
    name VARCHAR(255),
    last_seen TIMESTAMPTZ,
    stream_id UUID,
    farm_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h.id,
        1 - (h.feature_vector <=> query_vector) AS similarity,
        h.name,
        h.last_seen,
        h.stream_id,
        h.farm_id
    FROM horses h
    WHERE h.feature_vector IS NOT NULL
        AND 1 - (h.feature_vector <=> query_vector) >= similarity_threshold
        -- Filter by stream_id if provided (strict stream isolation)
        AND (filter_stream_id IS NULL OR h.stream_id = filter_stream_id)
        -- Filter by farm_id if provided (barn-level matching)
        AND (filter_farm_id IS NULL OR h.farm_id = filter_farm_id)
    ORDER BY h.feature_vector <=> query_vector
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comment
COMMENT ON FUNCTION find_similar_horses IS 'Find similar horses using Re-ID feature vectors.
Supports optional stream_id filter (strict stream isolation) or farm_id filter (barn-level matching).
Default behavior (no filters) searches across all horses for backward compatibility.';
