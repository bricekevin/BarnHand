# Behavioral Analysis Troubleshooting Guide

This guide covers common issues and solutions for the BarnHand behavioral analysis system.

## Quick Diagnostics

### Health Check Commands

```bash
# Check all services status
docker-compose ps

# Verify API Gateway behavioral endpoints
curl http://localhost:8000/api/v1/horses/123/timeline

# Check ML service health with behavioral info
curl http://localhost:8002/health

# Test WebSocket behavioral events
wscat -c ws://localhost:8000 -s "echo-protocol"
```

### Log Analysis

```bash
# ML Service behavioral logs
docker-compose logs ml-service | grep -i behavioral

# API Gateway behavioral route logs
docker-compose logs api-gateway | grep behavioral

# Database behavioral query logs
docker-compose logs postgres | grep -E "(horse_moments|horse_actions|horse_pose_frames)"
```

## Common Issues & Solutions

### 1. Behavioral Analysis Not Working

**Symptoms:**

- No behavioral events in timeline
- Empty behavioral API responses
- ML service errors about state detection

**Solutions:**

```bash
# 1. Check environment variables
grep -E "BEHAVIORAL|STATE_DETECTION|REID" .env

# Required variables:
# ENABLE_HIERARCHICAL_STATE_DETECTION=true
# ENABLE_ADVANCED_STATE_DETECTION=true
# BEHAVIORAL_CONFIDENCE_THRESHOLD=0.7

# 2. Verify ML models are loaded
docker-compose logs ml-service | grep -E "(HierarchicalStateDetector|AdvancedStateDetector)"

# 3. Check database migration
npm run db:migrate
psql postgresql://admin:password@localhost:5432/barnhand -c "\dt horse*"

# 4. Test behavioral analysis manually
curl -X POST http://localhost:8000/api/v1/horses/123/moments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"moment_type": "test", "primary_state": "standing", "confidence": 0.8}'
```

### 2. MegaDescriptor ReID Issues

**Symptoms:**

- Horse IDs changing frequently
- Low re-identification accuracy
- ReID model loading errors

**Solutions:**

```bash
# 1. Check ReID configuration
grep -E "REID_MODEL_TYPE|SIMILARITY_THRESHOLD|FEATURE_DIMS" .env

# Recommended settings:
# REID_MODEL_TYPE=megadescriptor
# REID_SIMILARITY_THRESHOLD=0.6
# REID_FEATURE_DIMS=768

# 2. Download MegaDescriptor model
cd backend/ml-service
python -c "from transformers import AutoModel; AutoModel.from_pretrained('BVRA/MegaDescriptor-T-224')"

# 3. Test ReID functionality
python -c "
from src.models.horse_reid import HorseReIDModel
reid = HorseReIDModel()
print(f'Model type: {reid.model_type}')
print(f'Feature dims: {reid.feature_dims}')
"

# 4. Check similarity threshold
# Lower threshold = more sensitive matching
# Higher threshold = more strict matching
# MegaDescriptor: 0.6, CNN: 0.7
```

### 3. Cross-Chunk Continuity Problems

**Symptoms:**

- Horses losing identity between chunks
- Redis connection errors
- High ID switching rate

**Solutions:**

```bash
# 1. Check Redis connection
redis-cli ping
redis-cli get test

# 2. Verify cross-chunk settings
grep -E "HORSE_REGISTRY_TTL|CROSS_CHUNK_CONTINUITY" .env

# Recommended settings:
# HORSE_REGISTRY_TTL=300
# CROSS_CHUNK_CONTINUITY=true
# MAX_HORSE_REGISTRY_SIZE=100

# 3. Monitor Redis horse registry
redis-cli keys "horse:*:*:state"
redis-cli get "horse:stream-123:horse-456:state"

# 4. Test cross-chunk continuity stats
curl http://localhost:8002/health | jq '.cross_chunk_stats'
```

### 4. Database Performance Issues

**Symptoms:**

- Slow behavioral API responses
- Database connection timeouts
- High memory usage

**Solutions:**

```bash
# 1. Check database performance
psql postgresql://admin:password@localhost:5432/barnhand -c "
SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND tablename LIKE 'horse%';
"

# 2. Analyze slow queries
psql postgresql://admin:password@localhost:5432/barnhand -c "
SELECT query, mean_time, calls
FROM pg_stat_statements
WHERE query LIKE '%horse%'
ORDER BY mean_time DESC LIMIT 10;
"

# 3. Check TimescaleDB hypertables
psql postgresql://admin:password@localhost:5432/barnhand -c "
SELECT * FROM timescaledb_information.hypertables;
"

# 4. Optimize database settings
# Add to postgresql.conf:
# shared_buffers = 256MB
# work_mem = 4MB
# maintenance_work_mem = 64MB
```

### 5. WebSocket Behavioral Events Not Working

**Symptoms:**

- No real-time behavioral updates
- WebSocket connection failures
- Missing event subscriptions

**Solutions:**

```bash
# 1. Test WebSocket connection
wscat -c ws://localhost:8000

# 2. Subscribe to behavioral events
# Send: {"action": "subscribe", "room": "horse:123:behavioral"}

# 3. Check WebSocket server logs
docker-compose logs api-gateway | grep -i websocket

# 4. Test behavioral event emission
curl -X POST http://localhost:8000/api/v1/horses/123/actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "action_type": "walking",
    "action_intensity": "medium",
    "detection_confidence": 0.85,
    "start_time": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
    "end_time": "'$(date -u -d '+10 seconds' +%Y-%m-%dT%H:%M:%S.%3NZ)'",
    "duration_seconds": 10
  }'
```

### 6. Frontend Behavioral Components Issues

**Symptoms:**

- Timeline not displaying
- Empty behavioral data
- Component rendering errors

**Solutions:**

```bash
# 1. Check frontend console errors
# Open browser dev tools and look for:
# - API request errors
# - WebSocket connection issues
# - Component rendering errors

# 2. Verify Zustand store updates
# In browser console:
# window.__zustand_devtools__

# 3. Test API connectivity
curl http://localhost:8000/api/v1/behavioral/horses/123/timeline \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. Check component props
# Ensure BehavioralTimeline receives valid horseId
# Verify useHorseBehavioralData hook returns data

# 5. Test with mock data
# BehavioralTimeline component includes mock data when no real data available
```

## Advanced Diagnostics

### Performance Profiling

```bash
# 1. ML Service performance
curl http://localhost:8002/metrics

# 2. Database query analysis
psql postgresql://admin:password@localhost:5432/barnhand -c "
EXPLAIN ANALYZE
SELECT * FROM get_horse_timeline(
  '123e4567-e89b-12d3-a456-426614174000'::UUID,
  NOW() - INTERVAL '24 hours',
  NOW()
);
"

# 3. API Gateway response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8000/api/v1/horses/123/timeline

# Create curl-format.txt:
echo '     time_namelookup:  %{time_namelookup}
        time_connect:  %{time_connect}
     time_appconnect:  %{time_appconnect}
    time_pretransfer:  %{time_pretransfer}
       time_redirect:  %{time_redirect}
  time_starttransfer:  %{time_starttransfer}
                     ----------
          time_total:  %{time_total}' > curl-format.txt
```

### Memory Analysis

```bash
# 1. Check ML service memory usage
docker stats ml-service

# 2. Redis memory usage
redis-cli info memory

# 3. PostgreSQL memory usage
psql postgresql://admin:password@localhost:5432/barnhand -c "
SELECT
  setting,
  unit,
  context
FROM pg_settings
WHERE name IN ('shared_buffers', 'work_mem', 'maintenance_work_mem');
"
```

### Model Debugging

```bash
# 1. Test MegaDescriptor model loading
python -c "
import torch
from transformers import AutoModel
model = AutoModel.from_pretrained('BVRA/MegaDescriptor-T-224')
print(f'Model loaded: {model.config.model_type}')
print(f'Hidden size: {model.config.hidden_size}')
"

# 2. Test state detection models
cd backend/ml-service
python -c "
from src.models.hierarchical_state_detection import HierarchicalStateDetector
from src.models.advanced_state_detection import AdvancedStateDetector
h_detector = HierarchicalStateDetector()
a_detector = AdvancedStateDetector()
print('State detectors loaded successfully')
"

# 3. Validate pose analysis
python -c "
from src.models.pose_analysis import PoseAnalyzer
analyzer = PoseAnalyzer()
print(f'Pose analyzer keypoints: {len(analyzer.keypoint_names)}')
"
```

## Monitoring & Alerts

### Health Monitoring Setup

```bash
# 1. Set up behavioral analysis health checks
# Add to docker-compose.yml:
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8002/health"]
  interval: 30s
  timeout: 10s
  retries: 3

# 2. Monitor behavioral processing metrics
curl http://localhost:8002/metrics | grep behavioral

# 3. Set up log aggregation
# Configure Fluentd or similar for behavioral analysis logs
```

### Alert Configuration

```bash
# Configure behavioral alerts in .env:
BEHAVIORAL_ALERTS_ENABLED=true
ALERT_SIGNIFICANCE_THRESHOLD=0.8
CRITICAL_ALERT_THRESHOLD=0.9
ALERT_COOLDOWN_SECONDS=60

# Test alert generation
curl -X POST http://localhost:8000/api/v1/horses/123/moments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "moment_type": "alert_test",
    "primary_state": "alert",
    "confidence": 0.95,
    "significance_score": 0.9,
    "start_time": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
  }'
```

## 🆘 Emergency Procedures

### Complete System Reset

```bash
# 1. Stop all services
docker-compose down

# 2. Clear behavioral data (CAUTION: Data loss!)
docker-compose down -v

# 3. Reset database
npm run db:reset

# 4. Clear Redis cache
redis-cli flushall

# 5. Restart services
docker-compose up -d

# 6. Run migrations
npm run db:migrate

# 7. Test basic functionality
curl http://localhost:8000/health
```

### Behavioral Analysis Service Recovery

```bash
# 1. Restart ML service only
docker-compose restart ml-service

# 2. Check service logs
docker-compose logs ml-service | tail -50

# 3. Verify behavioral models loaded
curl http://localhost:8002/health | jq '.models'

# 4. Test behavioral analysis
curl http://localhost:8000/api/v1/horses/123/current-action
```

## 📞 Getting Help

If you continue to experience issues:

1. **Check GitHub Issues**: Search existing issues for similar problems
2. **Enable Debug Logging**: Set `ENABLE_BEHAVIORAL_DEBUG=true` in `.env`
3. **Collect Diagnostics**: Run health checks and collect relevant logs
4. **Create Issue**: Include system info, error logs, and reproduction steps

### Useful Debug Information

```bash
# System information
uname -a
docker --version
docker-compose --version
node --version
python --version

# Service status
docker-compose ps

# Resource usage
docker stats

# Network configuration
docker network ls
docker network inspect barnhand_default
```
