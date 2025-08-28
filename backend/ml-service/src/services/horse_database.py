"""Database service for horse tracking and re-identification."""
import asyncio
import json
import uuid
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool
from loguru import logger

from ..config.settings import settings


class HorseDatabaseService:
    """Service for managing horse data in PostgreSQL with pgvector."""
    
    def __init__(self) -> None:
        self.pool: Optional[ThreadedConnectionPool] = None
        self.similarity_threshold = 0.7
        
    async def initialize(self) -> None:
        """Initialize database connection pool."""
        try:
            # Create connection pool
            self.pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=10,
                host=settings.database_host,
                port=settings.database_port,
                database=settings.database_name,
                user=settings.database_user,
                password=settings.database_password
            )
            
            logger.info("Database connection pool initialized")
            
            # Ensure required tables exist
            await self._create_tables_if_needed()
            
        except Exception as error:
            logger.error(f"Failed to initialize database service: {error}")
            raise
            
    async def _create_tables_if_needed(self) -> None:
        """Create horse tracking tables if they don't exist."""
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            
            # Enable pgvector extension if not exists
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
            
            # Horses table with feature vectors
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS horses (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(255),
                    stream_id UUID,
                    tracking_id VARCHAR(50) UNIQUE,
                    color_hex VARCHAR(7),
                    first_detected TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    total_detections INTEGER DEFAULT 0,
                    feature_vector VECTOR(512),
                    thumbnail_url TEXT,
                    metadata JSONB DEFAULT '{}',
                    track_confidence FLOAT DEFAULT 1.0,
                    status VARCHAR(20) DEFAULT 'active'
                )
            """)
            
            # Horse features history for temporal analysis
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS horse_features (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    horse_id UUID REFERENCES horses(id) ON DELETE CASCADE,
                    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                    feature_vector VECTOR(512),
                    confidence FLOAT,
                    bbox JSONB,
                    image_snapshot BYTEA
                )
            """)
            
            # Create indexes for fast similarity search
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_horses_features 
                USING ivfflat (feature_vector vector_cosine_ops)
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_horse_features_vector 
                USING ivfflat (feature_vector vector_cosine_ops)
            """)
            
            # Time-based indexes
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_horses_last_seen 
                ON horses(last_seen DESC)
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_horse_features_time 
                ON horse_features(horse_id, timestamp DESC)
            """)
            
            conn.commit()
            logger.info("Database tables and indexes created/verified")
            
        except Exception as error:
            conn.rollback()
            logger.error(f"Failed to create tables: {error}")
            raise
        finally:
            self.pool.putconn(conn)
            
    async def save_horse(self, horse_data: Dict[str, Any]) -> str:
        """
        Save a new horse or update existing one.
        
        Args:
            horse_data: Horse information including features
            
        Returns:
            Horse UUID
        """
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            # Check if horse already exists by tracking_id
            tracking_id = horse_data.get("tracking_id")
            if tracking_id:
                cursor.execute(
                    "SELECT id FROM horses WHERE tracking_id = %s",
                    (tracking_id,)
                )
                existing = cursor.fetchone()
                
                if existing:
                    # Update existing horse
                    horse_id = existing["id"]
                    await self._update_existing_horse(cursor, horse_id, horse_data)
                    logger.debug(f"Updated existing horse: {horse_id}")
                else:
                    # Create new horse
                    horse_id = await self._create_new_horse(cursor, horse_data)
                    logger.info(f"Created new horse: {horse_id}")
            else:
                # No tracking_id, create new
                horse_id = await self._create_new_horse(cursor, horse_data)
                logger.info(f"Created new horse: {horse_id}")
                
            conn.commit()
            return str(horse_id)
            
        except Exception as error:
            conn.rollback()
            logger.error(f"Failed to save horse: {error}")
            raise
        finally:
            self.pool.putconn(conn)
            
    async def _create_new_horse(self, cursor, horse_data: Dict[str, Any]) -> str:
        """Create a new horse record."""
        horse_id = str(uuid.uuid4())
        feature_vector = horse_data.get("feature_vector")
        
        cursor.execute("""
            INSERT INTO horses (
                id, name, stream_id, tracking_id, color_hex, 
                feature_vector, total_detections, track_confidence, metadata
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            horse_id,
            horse_data.get("name"),
            horse_data.get("stream_id"),
            horse_data.get("tracking_id"),
            horse_data.get("color"),
            feature_vector.tolist() if isinstance(feature_vector, np.ndarray) else feature_vector,
            horse_data.get("total_detections", 1),
            horse_data.get("track_confidence", 1.0),
            json.dumps(horse_data.get("metadata", {}))
        ))
        
        return horse_id
        
    async def _update_existing_horse(self, cursor, horse_id: str, horse_data: Dict[str, Any]) -> None:
        """Update existing horse record."""
        feature_vector = horse_data.get("feature_vector")
        
        cursor.execute("""
            UPDATE horses SET 
                last_seen = CURRENT_TIMESTAMP,
                total_detections = total_detections + 1,
                track_confidence = %s,
                feature_vector = %s,
                metadata = %s
            WHERE id = %s
        """, (
            horse_data.get("track_confidence", 1.0),
            feature_vector.tolist() if isinstance(feature_vector, np.ndarray) else feature_vector,
            json.dumps(horse_data.get("metadata", {})),
            horse_id
        ))
        
    async def save_horse_appearance(self, horse_id: str, appearance_data: Dict[str, Any]) -> None:
        """Save horse appearance data for historical tracking."""
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            
            feature_vector = appearance_data.get("features")
            
            cursor.execute("""
                INSERT INTO horse_features (
                    horse_id, timestamp, feature_vector, confidence, bbox
                ) VALUES (%s, %s, %s, %s, %s)
            """, (
                horse_id,
                appearance_data.get("timestamp"),
                feature_vector.tolist() if isinstance(feature_vector, np.ndarray) else feature_vector,
                appearance_data.get("confidence"),
                json.dumps(appearance_data.get("bbox", {}))
            ))
            
            conn.commit()
            
        except Exception as error:
            conn.rollback()
            logger.error(f"Failed to save horse appearance: {error}")
        finally:
            self.pool.putconn(conn)
            
    async def find_similar_horses(self, feature_vector: np.ndarray, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Find horses with similar features using pgvector similarity search.
        
        Args:
            feature_vector: Query feature vector
            limit: Maximum number of similar horses to return
            
        Returns:
            List of similar horses with similarity scores
        """
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            # Convert numpy array to list for PostgreSQL
            feature_list = feature_vector.tolist()
            
            # Use pgvector cosine similarity search
            cursor.execute("""
                SELECT 
                    id, name, tracking_id, color_hex, last_seen, 
                    total_detections, track_confidence, metadata,
                    1 - (feature_vector <=> %s::vector) as similarity
                FROM horses 
                WHERE status = 'active' 
                    AND (1 - (feature_vector <=> %s::vector)) > %s
                ORDER BY feature_vector <=> %s::vector
                LIMIT %s
            """, (feature_list, feature_list, self.similarity_threshold, feature_list, limit))
            
            results = cursor.fetchall()
            
            # Convert to dict list
            similar_horses = []
            for row in results:
                similar_horses.append({
                    "id": str(row["id"]),
                    "name": row["name"],
                    "tracking_id": row["tracking_id"],
                    "color": row["color_hex"],
                    "last_seen": row["last_seen"],
                    "total_detections": row["total_detections"],
                    "track_confidence": row["track_confidence"],
                    "similarity": float(row["similarity"]),
                    "metadata": row["metadata"]
                })
                
            logger.debug(f"Found {len(similar_horses)} similar horses")
            return similar_horses
            
        except Exception as error:
            logger.error(f"Similarity search failed: {error}")
            return []
        finally:
            self.pool.putconn(conn)
            
    async def get_horse_by_tracking_id(self, tracking_id: str) -> Optional[Dict[str, Any]]:
        """Get horse by tracking ID."""
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            cursor.execute("""
                SELECT * FROM horses WHERE tracking_id = %s
            """, (tracking_id,))
            
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None
            
        except Exception as error:
            logger.error(f"Failed to get horse by tracking_id {tracking_id}: {error}")
            return None
        finally:
            self.pool.putconn(conn)
            
    async def get_horse_appearance_history(self, horse_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get appearance history for a horse."""
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            cursor.execute("""
                SELECT timestamp, confidence, bbox, feature_vector
                FROM horse_features 
                WHERE horse_id = %s 
                ORDER BY timestamp DESC 
                LIMIT %s
            """, (horse_id, limit))
            
            results = cursor.fetchall()
            return [dict(row) for row in results]
            
        except Exception as error:
            logger.error(f"Failed to get appearance history for {horse_id}: {error}")
            return []
        finally:
            self.pool.putconn(conn)
            
    async def merge_horse_tracks(self, primary_id: str, secondary_id: str) -> bool:
        """
        Merge two horse tracks that are determined to be the same horse.
        
        Args:
            primary_id: ID of the horse to keep
            secondary_id: ID of the horse to merge into primary
            
        Returns:
            True if merge successful
        """
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            
            # Start transaction
            cursor.execute("BEGIN")
            
            # Move all appearance history from secondary to primary
            cursor.execute("""
                UPDATE horse_features 
                SET horse_id = %s 
                WHERE horse_id = %s
            """, (primary_id, secondary_id))
            
            # Update detection records
            cursor.execute("""
                UPDATE detections 
                SET horse_id = %s 
                WHERE horse_id = %s
            """, (primary_id, secondary_id))
            
            # Update primary horse statistics
            cursor.execute("""
                UPDATE horses SET 
                    total_detections = (
                        SELECT COUNT(*) FROM detections WHERE horse_id = %s
                    ),
                    last_seen = GREATEST(last_seen, (
                        SELECT last_seen FROM horses WHERE id = %s
                    ))
                WHERE id = %s
            """, (primary_id, secondary_id, primary_id))
            
            # Mark secondary horse as merged
            cursor.execute("""
                UPDATE horses SET 
                    status = 'merged',
                    metadata = metadata || %s::jsonb
                WHERE id = %s
            """, (json.dumps({"merged_into": primary_id}), secondary_id))
            
            cursor.execute("COMMIT")
            
            logger.info(f"Successfully merged horse {secondary_id} into {primary_id}")
            return True
            
        except Exception as error:
            cursor.execute("ROLLBACK")
            logger.error(f"Failed to merge horses {primary_id} and {secondary_id}: {error}")
            return False
        finally:
            self.pool.putconn(conn)
            
    async def split_horse_track(self, original_id: str, split_timestamp: float) -> Optional[str]:
        """
        Split a horse track at a specific timestamp (for cases where one track was actually two horses).
        
        Args:
            original_id: Original horse ID
            split_timestamp: Timestamp to split at
            
        Returns:
            ID of the new horse created from the split
        """
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            # Get original horse data
            cursor.execute("SELECT * FROM horses WHERE id = %s", (original_id,))
            original_horse = cursor.fetchone()
            
            if not original_horse:
                logger.warning(f"Horse {original_id} not found for split")
                return None
                
            # Create new horse for the split portion
            new_horse_id = str(uuid.uuid4())
            new_tracking_id = f"horse_{int(time.time())}"  # Temporary ID
            
            cursor.execute("BEGIN")
            
            # Create new horse record
            cursor.execute("""
                INSERT INTO horses (
                    id, name, stream_id, tracking_id, color_hex,
                    first_detected, feature_vector, metadata, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                new_horse_id,
                f"{original_horse['name']}_split" if original_horse["name"] else None,
                original_horse["stream_id"],
                new_tracking_id,
                original_horse["color_hex"],
                split_timestamp,
                original_horse["feature_vector"],
                json.dumps({"split_from": original_id, "split_at": split_timestamp}),
                "active"
            ))
            
            # Move appearance data after split_timestamp to new horse
            cursor.execute("""
                UPDATE horse_features 
                SET horse_id = %s 
                WHERE horse_id = %s 
                    AND timestamp >= %s
            """, (new_horse_id, original_id, split_timestamp))
            
            # Move detection records after split_timestamp
            cursor.execute("""
                UPDATE detections 
                SET horse_id = %s 
                WHERE horse_id = %s 
                    AND time >= %s
            """, (new_horse_id, original_id, split_timestamp))
            
            # Update statistics for both horses
            for horse_id in [original_id, new_horse_id]:
                cursor.execute("""
                    UPDATE horses SET 
                        total_detections = (
                            SELECT COUNT(*) FROM detections WHERE horse_id = %s
                        ),
                        last_seen = (
                            SELECT MAX(timestamp) FROM horse_features WHERE horse_id = %s
                        )
                    WHERE id = %s
                """, (horse_id, horse_id, horse_id))
                
            cursor.execute("COMMIT")
            
            logger.info(f"Successfully split horse {original_id} at timestamp {split_timestamp}, created {new_horse_id}")
            return new_horse_id
            
        except Exception as error:
            cursor.execute("ROLLBACK")
            logger.error(f"Failed to split horse {original_id}: {error}")
            return None
        finally:
            self.pool.putconn(conn)
            
    async def update_similarity_threshold(self, threshold: float) -> bool:
        """Update the similarity threshold for matching."""
        if 0.0 <= threshold <= 1.0:
            self.similarity_threshold = threshold
            logger.info(f"Updated similarity threshold to {threshold}")
            return True
        else:
            logger.warning(f"Invalid threshold {threshold}, must be between 0.0 and 1.0")
            return False
            
    async def get_horse_statistics(self, stream_id: Optional[str] = None) -> Dict[str, Any]:
        """Get horse tracking statistics."""
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            where_clause = "WHERE stream_id = %s" if stream_id else ""
            params = (stream_id,) if stream_id else ()
            
            # Get basic counts
            cursor.execute(f"""
                SELECT 
                    COUNT(*) as total_horses,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_horses,
                    COUNT(CASE WHEN status = 'lost' THEN 1 END) as lost_horses,
                    COUNT(CASE WHEN status = 'merged' THEN 1 END) as merged_horses,
                    AVG(total_detections) as avg_detections_per_horse,
                    AVG(track_confidence) as avg_track_confidence
                FROM horses {where_clause}
            """, params)
            
            stats = dict(cursor.fetchone())
            
            # Get recent activity
            cursor.execute(f"""
                SELECT COUNT(*) as recent_appearances
                FROM horse_features hf
                JOIN horses h ON hf.horse_id = h.id
                WHERE hf.timestamp > NOW() - INTERVAL '1 hour'
                {where_clause.replace('stream_id', 'h.stream_id') if where_clause else ''}
            """, params)
            
            recent_activity = cursor.fetchone()["recent_appearances"]
            stats["recent_appearances"] = recent_activity
            
            return stats
            
        except Exception as error:
            logger.error(f"Failed to get horse statistics: {error}")
            return {}
        finally:
            self.pool.putconn(conn)
            
    async def cleanup_old_data(self, retention_days: int = 30) -> int:
        """Clean up old horse feature data."""
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            
            # Remove old appearance data
            cursor.execute("""
                DELETE FROM horse_features 
                WHERE timestamp < NOW() - INTERVAL '%s days'
            """, (retention_days,))
            
            deleted_count = cursor.rowcount
            conn.commit()
            
            logger.info(f"Cleaned up {deleted_count} old appearance records")
            return deleted_count
            
        except Exception as error:
            conn.rollback()
            logger.error(f"Failed to cleanup old data: {error}")
            return 0
        finally:
            self.pool.putconn(conn)
            
    def close(self) -> None:
        """Close database connection pool."""
        if self.pool:
            self.pool.closeall()
            logger.info("Database connection pool closed")