"""Enhanced database service with Redis support for cross-chunk horse continuity."""
import asyncio
import json
import uuid
import time
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import psycopg2
import psycopg2.extras
import redis
from psycopg2.pool import ThreadedConnectionPool
from loguru import logger

from ..config.settings import settings


class HorseDatabaseService:
    """Enhanced service for managing horse data with Redis cross-chunk persistence."""
    
    def __init__(self) -> None:
        self.pool: Optional[ThreadedConnectionPool] = None
        self.redis_client: Optional[redis.Redis] = None
        self.similarity_threshold = 0.7
        self.redis_ttl = 300  # 300 seconds TTL for cross-chunk persistence
        
    async def initialize(self) -> None:
        """Initialize database connection pool and Redis client."""
        try:
            # Initialize PostgreSQL connection pool
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
            
            # Initialize Redis client for cross-chunk persistence
            self.redis_client = redis.Redis.from_url(
                settings.redis_url,
                decode_responses=True
            )
            
            # Test Redis connection
            self.redis_client.ping()
            logger.info("Redis client initialized for cross-chunk horse persistence")
            
            # Ensure required tables exist
            await self._create_tables_if_needed()
            
        except Exception as error:
            logger.error(f"Failed to initialize enhanced database service: {error}")
            raise
    
    # *** NEW: Cross-Chunk Horse Persistence Methods ***
    
    async def save_horse_state_to_redis(self, stream_id: str, horse_id: str, 
                                       horse_state: Dict[str, Any]) -> bool:
        """
        Save horse state to Redis for cross-chunk continuity.
        Schema: horse:{stream_id}:{horse_id}:state (TTL: 300s)
        """
        if not self.redis_client:
            logger.warning("Redis client not initialized")
            return False
            
        try:
            redis_key = f"horse:{stream_id}:{horse_id}:state"
            
            # Prepare state data
            state_data = {
                "horse_id": horse_id,
                "stream_id": stream_id,
                "last_updated": time.time(),
                "bbox": horse_state.get("bbox", {}),
                "confidence": horse_state.get("confidence", 0.0),
                "total_detections": horse_state.get("total_detections", 0),
                "features": horse_state.get("features", []),
                "behavioral_state": horse_state.get("behavioral_state", {}),
                "tracking_confidence": horse_state.get("tracking_confidence", 1.0)
            }
            
            # Save to Redis with TTL
            self.redis_client.setex(
                redis_key,
                self.redis_ttl,
                json.dumps(state_data, default=str)
            )
            
            logger.debug(f"Saved horse state to Redis: {redis_key}")
            return True
            
        except Exception as error:
            logger.error(f"Failed to save horse state to Redis: {error}")
            return False
    
    async def load_horse_state_from_redis(self, stream_id: str, horse_id: str) -> Optional[Dict[str, Any]]:
        """
        Load horse state from Redis for cross-chunk continuity.
        """
        if not self.redis_client:
            logger.warning("Redis client not initialized")
            return None
            
        try:
            redis_key = f"horse:{stream_id}:{horse_id}:state"
            
            # Get from Redis
            state_json = self.redis_client.get(redis_key)
            if not state_json:
                return None
                
            state_data = json.loads(state_json)
            
            # Check if state is still valid (within TTL)
            last_updated = state_data.get("last_updated", 0)
            if time.time() - last_updated > self.redis_ttl:
                # State expired, remove it
                self.redis_client.delete(redis_key)
                return None
            
            logger.debug(f"Loaded horse state from Redis: {redis_key}")
            return state_data
            
        except Exception as error:
            logger.debug(f"Failed to load horse state from Redis: {error}")
            return None
    
    async def load_stream_horse_registry(self, stream_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Load all active horses for a stream from Redis.
        Returns dict of {horse_id: horse_state}
        """
        if not self.redis_client:
            logger.warning("Redis client not initialized")
            return {}
            
        try:
            # Find all horse keys for this stream
            pattern = f"horse:{stream_id}:*:state"
            keys = self.redis_client.keys(pattern)
            
            horses = {}
            for key in keys:
                try:
                    state_json = self.redis_client.get(key)
                    if state_json:
                        state_data = json.loads(state_json)
                        horse_id = state_data.get("horse_id")
                        if horse_id:
                            horses[horse_id] = state_data
                except Exception as e:
                    logger.debug(f"Failed to load horse state from key {key}: {e}")
                    continue
            
            logger.info(f"Loaded {len(horses)} horses from Redis for stream {stream_id}")
            return horses
            
        except Exception as error:
            logger.error(f"Failed to load stream horse registry: {error}")
            return {}

    async def load_barn_horse_registry(self, stream_id: str, farm_id: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        """
        Load all active horses for a barn/farm (across all streams in that barn).
        This enables barn-based RE-ID pooling where horses detected in any stream
        assigned to a barn can be re-identified in all streams in that barn.

        Returns dict of {horse_id: horse_state}
        """
        try:
            # Get farm_id if not provided
            if not farm_id:
                farm_id = await self._get_farm_id_from_stream(stream_id)
                if not farm_id:
                    logger.warning(f"Could not determine farm_id for stream {stream_id}, falling back to stream-only")
                    return await self.load_stream_horse_registry(stream_id)

            horses = {}

            # Step 1: Load horses from PostgreSQL for this farm
            # This ensures we get ALL horses ever seen in this barn, even if not in Redis
            if self.pool:
                conn = self.pool.getconn()
                try:
                    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                    cursor.execute("""
                        SELECT
                            id, tracking_id, stream_id, farm_id, name, color_hex, last_seen,
                            total_detections, feature_vector, metadata, track_confidence, status, is_official
                        FROM horses
                        WHERE farm_id = %s AND status = 'active'
                        ORDER BY is_official DESC, last_seen DESC
                    """, (farm_id,))

                    rows = cursor.fetchall()
                    for row in rows:
                        horse_id = row['tracking_id']
                        # Convert PostgreSQL row to horse_state format
                        # Note: psycopg2 automatically deserializes JSON/JSONB columns
                        feature_vector = row['feature_vector'] if row['feature_vector'] else []
                        metadata = row['metadata'] if row['metadata'] else {}

                        # Handle case where they might still be strings (older psycopg versions)
                        if isinstance(feature_vector, str):
                            feature_vector = json.loads(feature_vector)
                        if isinstance(metadata, str):
                            metadata = json.loads(metadata)

                        horses[horse_id] = {
                            "id": str(row['id']),  # Database UUID
                            "horse_id": horse_id,
                            "tracking_id": horse_id,
                            "stream_id": row['stream_id'],
                            "farm_id": row['farm_id'],
                            "name": row['name'],  # Horse name (for official horses)
                            "is_official": row['is_official'],  # Official vs guest
                            "color": row['color_hex'],
                            "confidence": 1.0,  # Default confidence
                            "features": feature_vector,
                            "bbox": metadata.get("bbox", {}),
                            "total_detections": row['total_detections'],
                            "tracking_confidence": row['track_confidence'],
                            "last_updated": row['last_seen'].timestamp() if row['last_seen'] else time.time(),
                            "status": row['status']
                        }

                    logger.info(f"Loaded {len(horses)} horses from PostgreSQL for farm {farm_id}")

                except Exception as error:
                    logger.error(f"Failed to load horses from PostgreSQL for farm {farm_id}: {error}")
                finally:
                    self.pool.putconn(conn)

            # Step 2: Overlay with Redis data (which has fresher state)
            # Redis horses take precedence over PostgreSQL for active tracks
            if self.redis_client and self.pool:
                try:
                    # Get all streams for this farm
                    conn = self.pool.getconn()
                    try:
                        cursor = conn.cursor()
                        cursor.execute("SELECT id FROM streams WHERE farm_id = %s", (farm_id,))
                        stream_ids = [row[0] for row in cursor.fetchall()]
                        logger.debug(f"Found {len(stream_ids)} streams in farm {farm_id}: {stream_ids}")
                    finally:
                        self.pool.putconn(conn)

                    # Load Redis horses from ALL streams in this farm
                    redis_count = 0
                    for sid in stream_ids:
                        pattern = f"horse:{sid}:*:state"
                        keys = self.redis_client.keys(pattern)

                        for key in keys:
                            try:
                                state_json = self.redis_client.get(key)
                                if state_json:
                                    state_data = json.loads(state_json)
                                    horse_id = state_data.get("horse_id")
                                    if horse_id:
                                        # Redis data overrides PostgreSQL (fresher)
                                        horses[horse_id] = state_data
                                        redis_count += 1
                            except Exception as e:
                                logger.debug(f"Failed to load horse state from Redis key {key}: {e}")
                                continue

                    logger.info(f"Loaded {redis_count} horses from Redis across {len(stream_ids)} streams in farm {farm_id}")

                except Exception as error:
                    logger.error(f"Failed to load horses from Redis for farm {farm_id}: {error}")

            logger.info(f"🏠 Barn-level registry: {len(horses)} total horses available for RE-ID in farm {farm_id}")
            return horses

        except Exception as error:
            logger.error(f"Failed to load barn horse registry: {error}")
            import traceback
            traceback.print_exc()
            # Fallback to stream-only registry
            return await self.load_stream_horse_registry(stream_id)

    async def save_stream_horse_registry(self, stream_id: str, horses: Dict[str, Dict[str, Any]]) -> bool:
        """
        Save entire horse registry for a stream to Redis + PostgreSQL.
        Used for batch updates and cross-chunk handoff.
        """
        try:
            success_count = 0

            for horse_id, horse_state in horses.items():
                # Save to Redis for cross-chunk continuity
                if await self.save_horse_state_to_redis(stream_id, horse_id, horse_state):
                    success_count += 1

                # PHASE 3: Also save to PostgreSQL for permanent storage
                await self._save_horse_to_postgres_with_thumbnail(horse_state)

            logger.info(f"Saved {success_count}/{len(horses)} horses to Redis+PostgreSQL for stream {stream_id}")
            return success_count == len(horses)

        except Exception as error:
            logger.error(f"Failed to save stream horse registry: {error}")
            return False
    
    async def cleanup_expired_horse_states(self, stream_id: str) -> int:
        """
        Clean up expired horse states from Redis for a stream.
        Returns number of cleaned up horses.
        """
        if not self.redis_client:
            return 0
            
        try:
            pattern = f"horse:{stream_id}:*:state"
            keys = self.redis_client.keys(pattern)
            
            expired_count = 0
            current_time = time.time()
            
            for key in keys:
                try:
                    state_json = self.redis_client.get(key)
                    if state_json:
                        state_data = json.loads(state_json)
                        last_updated = state_data.get("last_updated", 0)
                        
                        if current_time - last_updated > self.redis_ttl:
                            self.redis_client.delete(key)
                            expired_count += 1
                except Exception:
                    # If we can't parse, delete the key
                    self.redis_client.delete(key)
                    expired_count += 1
            
            if expired_count > 0:
                logger.info(f"Cleaned up {expired_count} expired horse states for stream {stream_id}")
            
            return expired_count
            
        except Exception as error:
            logger.error(f"Failed to cleanup expired horse states: {error}")
            return 0
    
    async def get_cross_chunk_horse_continuity_stats(self, stream_id: str) -> Dict[str, Any]:
        """Get statistics about cross-chunk horse continuity."""
        try:
            horses = await self.load_stream_horse_registry(stream_id)
            
            current_time = time.time()
            recent_horses = 0
            total_detections = 0
            
            for horse_state in horses.values():
                last_updated = horse_state.get("last_updated", 0)
                if current_time - last_updated < 60:  # Active in last minute
                    recent_horses += 1
                total_detections += horse_state.get("total_detections", 0)
            
            return {
                "total_horses_in_redis": len(horses),
                "recently_active_horses": recent_horses,
                "total_detections_tracked": total_detections,
                "redis_ttl_seconds": self.redis_ttl,
                "stream_id": stream_id
            }
            
        except Exception as error:
            logger.error(f"Failed to get continuity stats: {error}")
            return {}
    
    # *** Original database methods (preserved) ***
    
    async def _create_tables_if_needed(self) -> None:
        """Create horse tracking tables if they don't exist."""
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            
            # Check if tables already exist (they should from migrations)
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'horses'
                )
            """)
            tables_exist = cursor.fetchone()[0]
            
            if tables_exist:
                logger.info("Database tables already exist, skipping table creation")
                conn.commit()
                return
            
            logger.info("Creating ML service database tables")
            
            # Enable pgvector extension if not exists
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
            
            # Horses table with feature vectors (updated for MegaDescriptor 768-dim)
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
                    feature_vector VECTOR(768),  -- Updated for MegaDescriptor
                    thumbnail_url TEXT,
                    metadata JSONB DEFAULT '{}',
                    track_confidence FLOAT DEFAULT 1.0,
                    status VARCHAR(20) DEFAULT 'active'
                )
            """)
            
            # Horse features history for temporal analysis (updated for MegaDescriptor)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS horse_features (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    horse_id UUID REFERENCES horses(id) ON DELETE CASCADE,
                    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
                    feature_vector VECTOR(768),  -- Updated for MegaDescriptor
                    confidence FLOAT,
                    bbox JSONB,
                    image_snapshot BYTEA
                )
            """)
            
            # Create indexes for performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_horses_tracking_id ON horses(tracking_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_horses_stream_id ON horses(stream_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_horses_last_seen ON horses(last_seen)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_horse_features_timestamp ON horse_features(timestamp)")
            
            conn.commit()
            logger.info("Enhanced database tables created successfully")
            
        except Exception as error:
            conn.rollback()
            logger.error(f"Failed to create database tables: {error}")
            raise
        finally:
            self.pool.putconn(conn)
    
    async def save_horse(self, horse_data: Dict[str, Any]) -> bool:
        """Save or update horse data with cross-chunk Redis persistence."""
        try:
            # Save to PostgreSQL (permanent storage)
            success = await self._save_horse_to_postgres(horse_data)
            
            # Also save to Redis for cross-chunk continuity
            stream_id = horse_data.get("stream_id", "default")
            horse_id = horse_data.get("horse_id", "unknown")
            
            await self.save_horse_state_to_redis(stream_id, horse_id, horse_data)
            
            return success
            
        except Exception as error:
            logger.error(f"Failed to save horse with cross-chunk persistence: {error}")
            return False
    
    async def _save_horse_to_postgres(self, horse_data: Dict[str, Any]) -> bool:
        """Save horse data to PostgreSQL."""
        if not self.pool:
            logger.error("Database pool not initialized")
            return False

        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()

            # Extract data
            horse_id = horse_data.get("horse_id", str(uuid.uuid4()))
            stream_id = horse_data.get("stream_id", "default")
            timestamp = horse_data.get("timestamp", time.time())
            bbox = horse_data.get("bbox", {})
            confidence = horse_data.get("confidence", 0.0)
            features = horse_data.get("features", [])
            total_detections = horse_data.get("total_detections", 1)

            # Get farm_id from stream
            farm_id = await self._get_farm_id_from_stream(stream_id)

            # Convert features to proper format
            if features and len(features) > 0:
                if isinstance(features, np.ndarray):
                    feature_vector = features.tolist()
                elif isinstance(features, list):
                    feature_vector = features
                else:
                    feature_vector = []
            else:
                feature_vector = []

            # Upsert horse record
            cursor.execute("""
                INSERT INTO horses (
                    tracking_id, stream_id, farm_id, last_seen, total_detections,
                    feature_vector, metadata, track_confidence, status
                ) VALUES (%s, %s, %s, to_timestamp(%s), %s, %s, %s, %s, %s)
                ON CONFLICT (tracking_id) DO UPDATE SET
                    last_seen = to_timestamp(%s),
                    total_detections = horses.total_detections + 1,
                    feature_vector = %s,
                    metadata = %s,
                    track_confidence = %s,
                    farm_id = EXCLUDED.farm_id
            """, (
                horse_id, stream_id, farm_id, timestamp, total_detections,
                json.dumps(feature_vector), json.dumps(bbox), confidence, 'active',
                timestamp, json.dumps(feature_vector), json.dumps(bbox), confidence
            ))

            conn.commit()
            logger.debug(f"Saved horse {horse_id} to PostgreSQL")
            return True

        except Exception as error:
            conn.rollback()
            logger.error(f"Failed to save horse to PostgreSQL: {error}")
            return False
        finally:
            self.pool.putconn(conn)

    async def _get_farm_id_from_stream(self, stream_id: str) -> Optional[str]:
        """Get farm_id from stream_id by querying streams table."""
        if not self.pool:
            return None

        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT farm_id FROM streams WHERE id = %s", (stream_id,))
            result = cursor.fetchone()
            return result[0] if result else None
        except Exception as error:
            logger.error(f"Failed to get farm_id for stream {stream_id}: {error}")
            return None
        finally:
            self.pool.putconn(conn)

    async def _save_horse_to_postgres_with_thumbnail(self, horse_state: Dict[str, Any]) -> bool:
        """
        Save horse data to PostgreSQL with optional thumbnail.
        PHASE 3: Enhanced version that saves avatar thumbnails.
        """
        if not self.pool:
            logger.error("Database pool not initialized")
            return False

        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()

            # Extract data
            horse_id = horse_state.get("horse_id", str(uuid.uuid4()))
            stream_id = horse_state.get("stream_id", "default")
            tracking_id = horse_state.get("tracking_id", 0)
            color = horse_state.get("color", "#ff6b6b")
            last_updated = horse_state.get("last_updated", time.time())
            bbox = horse_state.get("bbox", {})
            confidence = horse_state.get("confidence", 0.0)
            features = horse_state.get("features", [])
            total_detections = horse_state.get("total_detections", 1)
            track_confidence = horse_state.get("tracking_confidence", 1.0)
            thumbnail_bytes = horse_state.get("thumbnail_bytes", None)

            # Get farm_id from stream
            farm_id = await self._get_farm_id_from_stream(stream_id)

            # Convert features to proper format
            if features and len(features) > 0:
                if isinstance(features, np.ndarray):
                    feature_vector = features.tolist()
                elif isinstance(features, list):
                    feature_vector = features
                else:
                    feature_vector = []
            else:
                feature_vector = []

            # Prepare metadata
            metadata = {
                "bbox": bbox,
                "color": color,
                "tracking_id_int": tracking_id
            }

            # Upsert horse record with thumbnail
            if thumbnail_bytes:
                # Update with thumbnail
                cursor.execute("""
                    INSERT INTO horses (
                        tracking_id, stream_id, farm_id, color_hex, last_seen, total_detections,
                        feature_vector, metadata, track_confidence, status, avatar_thumbnail
                    ) VALUES (%s, %s, %s, %s, to_timestamp(%s), %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (tracking_id) DO UPDATE SET
                        last_seen = to_timestamp(%s),
                        total_detections = GREATEST(horses.total_detections, EXCLUDED.total_detections),
                        feature_vector = EXCLUDED.feature_vector,
                        metadata = EXCLUDED.metadata,
                        track_confidence = EXCLUDED.track_confidence,
                        avatar_thumbnail = EXCLUDED.avatar_thumbnail,
                        farm_id = EXCLUDED.farm_id
                """, (
                    horse_id, stream_id, farm_id, color, last_updated, total_detections,
                    json.dumps(feature_vector), json.dumps(metadata), track_confidence, 'active',
                    psycopg2.Binary(thumbnail_bytes),
                    last_updated
                ))
            else:
                # Update without thumbnail (don't overwrite existing thumbnail)
                cursor.execute("""
                    INSERT INTO horses (
                        tracking_id, stream_id, farm_id, color_hex, last_seen, total_detections,
                        feature_vector, metadata, track_confidence, status
                    ) VALUES (%s, %s, %s, %s, to_timestamp(%s), %s, %s, %s, %s, %s)
                    ON CONFLICT (tracking_id) DO UPDATE SET
                        last_seen = to_timestamp(%s),
                        total_detections = GREATEST(horses.total_detections, EXCLUDED.total_detections),
                        feature_vector = EXCLUDED.feature_vector,
                        metadata = EXCLUDED.metadata,
                        track_confidence = EXCLUDED.track_confidence,
                        farm_id = EXCLUDED.farm_id
                """, (
                    horse_id, stream_id, farm_id, color, last_updated, total_detections,
                    json.dumps(feature_vector), json.dumps(metadata), track_confidence, 'active',
                    last_updated
                ))

            conn.commit()
            logger.debug(f"Saved horse {horse_id} to PostgreSQL (thumbnail: {len(thumbnail_bytes) if thumbnail_bytes else 0} bytes)")
            return True

        except Exception as error:
            conn.rollback()
            logger.error(f"Failed to save horse with thumbnail to PostgreSQL: {error}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            self.pool.putconn(conn)
    
    async def get_horse(self, horse_id: str) -> Optional[Dict[str, Any]]:
        """Get horse data by tracking ID."""
        if not self.pool:
            return None
            
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            cursor.execute("""
                SELECT * FROM horses WHERE tracking_id = %s
            """, (horse_id,))
            
            result = cursor.fetchone()
            return dict(result) if result else None
            
        except Exception as error:
            logger.error(f"Failed to get horse {horse_id}: {error}")
            return None
        finally:
            self.pool.putconn(conn)
    
    async def find_similar_horses(self, features: List[float], stream_id: str = None, 
                                 limit: int = 10) -> List[Dict[str, Any]]:
        """Find similar horses using feature similarity."""
        if not self.pool or not features:
            return []
            
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            feature_vector_str = f"[{','.join(map(str, features))}]"
            
            if stream_id:
                cursor.execute("""
                    SELECT *, (feature_vector <-> %s::vector) as distance
                    FROM horses 
                    WHERE stream_id = %s AND feature_vector IS NOT NULL
                    ORDER BY distance ASC
                    LIMIT %s
                """, (feature_vector_str, stream_id, limit))
            else:
                cursor.execute("""
                    SELECT *, (feature_vector <-> %s::vector) as distance
                    FROM horses 
                    WHERE feature_vector IS NOT NULL
                    ORDER BY distance ASC
                    LIMIT %s
                """, (feature_vector_str, limit))
            
            results = cursor.fetchall()
            return [dict(row) for row in results]
            
        except Exception as error:
            logger.error(f"Failed to find similar horses: {error}")
            return []
        finally:
            self.pool.putconn(conn)
    
    async def get_active_horses(self, stream_id: str = None, hours: int = 24) -> List[Dict[str, Any]]:
        """Get horses active within specified hours."""
        if not self.pool:
            return []
            
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            if stream_id:
                cursor.execute("""
                    SELECT * FROM horses 
                    WHERE stream_id = %s 
                    AND last_seen >= NOW() - INTERVAL '%s hours'
                    AND status = 'active'
                    ORDER BY last_seen DESC
                """, (stream_id, hours))
            else:
                cursor.execute("""
                    SELECT * FROM horses 
                    WHERE last_seen >= NOW() - INTERVAL '%s hours'
                    AND status = 'active'
                    ORDER BY last_seen DESC
                """, (hours,))
            
            results = cursor.fetchall()
            return [dict(row) for row in results]
            
        except Exception as error:
            logger.error(f"Failed to get active horses: {error}")
            return []
        finally:
            self.pool.putconn(conn)
    
    async def update_horse_status(self, horse_id: str, status: str) -> bool:
        """Update horse status (active, inactive, archived)."""
        if not self.pool:
            return False
            
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE horses SET status = %s WHERE tracking_id = %s
            """, (status, horse_id))
            
            conn.commit()
            return cursor.rowcount > 0
            
        except Exception as error:
            conn.rollback()
            logger.error(f"Failed to update horse status: {error}")
            return False
        finally:
            self.pool.putconn(conn)
    
    async def get_database_stats(self) -> Dict[str, Any]:
        """Get database statistics."""
        if not self.pool:
            return {}
            
        conn = self.pool.getconn()
        try:
            cursor = conn.cursor()
            
            # Count horses
            cursor.execute("SELECT COUNT(*) FROM horses")
            total_horses = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM horses WHERE status = 'active'")
            active_horses = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM horse_features")
            total_features = cursor.fetchone()[0]
            
            return {
                "total_horses": total_horses,
                "active_horses": active_horses,
                "total_features": total_features,
                "similarity_threshold": self.similarity_threshold
            }
            
        except Exception as error:
            logger.error(f"Failed to get database stats: {error}")
            return {}
        finally:
            self.pool.putconn(conn)
    
    async def close(self) -> None:
        """Close database connections."""
        try:
            if self.pool:
                self.pool.closeall()
                logger.info("Database connection pool closed")
                
            if self.redis_client:
                self.redis_client.close()
                logger.info("Redis client closed")
        except Exception as error:
            logger.error(f"Error closing database connections: {error}")
    
    def __del__(self):
        """Cleanup on destruction."""
        try:
            if hasattr(self, 'pool') and self.pool:
                self.pool.closeall()
            if hasattr(self, 'redis_client') and self.redis_client:
                self.redis_client.close()
        except:
            pass