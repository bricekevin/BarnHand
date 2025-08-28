#!/bin/bash

# BarnHand Health Check Script
# This script performs comprehensive health checks on all BarnHand services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="docker-compose.prod.yml"

# Health check configuration
TIMEOUT=10
RETRY_COUNT=3
RETRY_DELAY=2

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

failure() {
    echo -e "${RED}❌ $1${NC}"
}

# Check Docker Compose command
check_docker_compose() {
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    elif command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        error "Docker Compose is not available"
        exit 1
    fi
}

# Make HTTP request with retries
make_http_request() {
    local url="$1"
    local expected_status="${2:-200}"
    local retry_count=0
    
    while [[ $retry_count -lt $RETRY_COUNT ]]; do
        if response=$(curl -s -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null); then
            status_code="${response: -3}"
            if [[ "$status_code" == "$expected_status" ]]; then
                return 0
            fi
        fi
        
        ((retry_count++))
        if [[ $retry_count -lt $RETRY_COUNT ]]; then
            sleep "$RETRY_DELAY"
        fi
    done
    
    return 1
}

# Check container status
check_container_status() {
    cd "$PROJECT_ROOT"
    
    echo
    info "🐳 Checking container status..."
    echo
    
    local containers=(
        "postgres:PostgreSQL Database"
        "redis:Redis Cache"
        "video-streamer:Video Streamer"
        "ml-service:ML Processing Service"
        "stream-service:Stream Processing Service"
        "api-gateway:API Gateway"
        "frontend:Frontend Application"
        "nginx:Nginx Reverse Proxy"
        "prometheus:Prometheus Monitoring"
        "grafana:Grafana Dashboard"
        "fluentd:Log Aggregation"
    )
    
    local healthy_count=0
    local total_count=${#containers[@]}
    
    for container_info in "${containers[@]}"; do
        IFS=':' read -r container_name display_name <<< "$container_info"
        
        if $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps "$container_name" 2>/dev/null | grep -q "Up (healthy)"; then
            success "$display_name is healthy"
            ((healthy_count++))
        elif $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps "$container_name" 2>/dev/null | grep -q "Up"; then
            warn "$display_name is running but not healthy"
        else
            failure "$display_name is not running"
        fi
    done
    
    echo
    if [[ $healthy_count -eq $total_count ]]; then
        success "All containers are healthy ($healthy_count/$total_count)"
    else
        warn "$healthy_count/$total_count containers are healthy"
    fi
    
    return $((total_count - healthy_count))
}

# Check HTTP endpoints
check_http_endpoints() {
    echo
    info "🌐 Checking HTTP endpoints..."
    echo
    
    local endpoints=(
        "http://localhost:3000:Frontend Application:200"
        "http://localhost:8000/api/v1/health:API Gateway Health:200"
        "http://localhost:8000/api/v1/info:API Gateway Info:200"
        "http://localhost:8001/health:Stream Service Health:200"
        "http://localhost:8002/health:ML Service Health:200"
        "http://localhost:8003/health:Video Streamer Health:200"
        "http://localhost:8003/streams:Video Stream List:200"
        "http://localhost:9090:Prometheus:200"
        "http://localhost:3001:Grafana:200"
    )
    
    local healthy_endpoints=0
    local total_endpoints=${#endpoints[@]}
    
    for endpoint_info in "${endpoints[@]}"; do
        IFS=':' read -r url name expected_status <<< "$endpoint_info"
        
        if make_http_request "$url" "$expected_status"; then
            success "$name is responding correctly"
            ((healthy_endpoints++))
        else
            failure "$name is not responding"
        fi
    done
    
    echo
    if [[ $healthy_endpoints -eq $total_endpoints ]]; then
        success "All HTTP endpoints are healthy ($healthy_endpoints/$total_endpoints)"
    else
        warn "$healthy_endpoints/$total_endpoints endpoints are healthy"
    fi
    
    return $((total_endpoints - healthy_endpoints))
}

# Check WebSocket connection
check_websocket() {
    echo
    info "🔌 Checking WebSocket connection..."
    echo
    
    # Create a simple WebSocket test
    local ws_test_script=$(cat << 'EOF'
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8000');

let connected = false;
const timeout = setTimeout(() => {
    if (!connected) {
        console.log('FAILED');
        process.exit(1);
    }
}, 5000);

ws.on('open', function open() {
    connected = true;
    console.log('SUCCESS');
    clearTimeout(timeout);
    ws.close();
    process.exit(0);
});

ws.on('error', function error(err) {
    console.log('FAILED');
    clearTimeout(timeout);
    process.exit(1);
});
EOF
    )
    
    if command -v node &> /dev/null; then
        if echo "$ws_test_script" | node 2>/dev/null | grep -q "SUCCESS"; then
            success "WebSocket connection is working"
            return 0
        else
            failure "WebSocket connection failed"
            return 1
        fi
    else
        warn "Node.js not available, skipping WebSocket test"
        return 0
    fi
}

# Check database connectivity
check_database() {
    echo
    info "🗄️ Checking database connectivity..."
    echo
    
    cd "$PROJECT_ROOT"
    
    # Try to connect to PostgreSQL
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T postgres pg_isready -U admin -d barnhand 2>/dev/null; then
        success "PostgreSQL is accepting connections"
        
        # Check TimescaleDB extension
        if $DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T postgres psql -U admin -d barnhand -c "SELECT extname FROM pg_extension WHERE extname = 'timescaledb';" 2>/dev/null | grep -q timescaledb; then
            success "TimescaleDB extension is loaded"
        else
            warn "TimescaleDB extension not found"
        fi
        
        return 0
    else
        failure "PostgreSQL is not accepting connections"
        return 1
    fi
}

# Check Redis connectivity
check_redis() {
    echo
    info "📦 Checking Redis connectivity..."
    echo
    
    cd "$PROJECT_ROOT"
    
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        success "Redis is responding"
        
        # Check Redis info
        local redis_info=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T redis redis-cli info server 2>/dev/null | grep redis_version)
        if [[ -n "$redis_info" ]]; then
            success "Redis version: ${redis_info#*:}"
        fi
        
        return 0
    else
        failure "Redis is not responding"
        return 1
    fi
}

# Check ML models
check_ml_models() {
    echo
    info "🤖 Checking ML model availability..."
    echo
    
    local models=(
        "models/downloads/yolo11m.pt:YOLO11 Detection Model"
        "models/downloads/yolov5m.pt:YOLOv5 Detection Model"
        "models/downloads/rtmpose-m_simcc-ap10k_pt-aic-coco_210e-256x256-7a041aa1_20230206.pth:RTMPose Model"
    )
    
    local available_models=0
    local total_models=${#models[@]}
    
    for model_info in "${models[@]}"; do
        IFS=':' read -r model_path model_name <<< "$model_info"
        
        if [[ -f "$PROJECT_ROOT/$model_path" ]]; then
            local size=$(stat -f%z "$PROJECT_ROOT/$model_path" 2>/dev/null || stat -c%s "$PROJECT_ROOT/$model_path" 2>/dev/null || echo "0")
            local size_mb=$((size / 1024 / 1024))
            success "$model_name is available (${size_mb}MB)"
            ((available_models++))
        else
            failure "$model_name is missing"
        fi
    done
    
    echo
    if [[ $available_models -eq $total_models ]]; then
        success "All ML models are available ($available_models/$total_models)"
    else
        warn "$available_models/$total_models ML models are available"
    fi
    
    return $((total_models - available_models))
}

# Check media files
check_media_files() {
    echo
    info "🎥 Checking media files..."
    echo
    
    local media_dir="$PROJECT_ROOT/media"
    
    if [[ -d "$media_dir" ]]; then
        local media_count=$(find "$media_dir" -type f \( -name "*.mp4" -o -name "*.mov" -o -name "*.avi" \) | wc -l)
        
        if [[ $media_count -gt 0 ]]; then
            success "$media_count media files found"
            
            # Show first few files
            info "Available media files:"
            find "$media_dir" -type f \( -name "*.mp4" -o -name "*.mov" -o -name "*.avi" \) | head -5 | while read -r file; do
                local filename=$(basename "$file")
                local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
                local size_mb=$((size / 1024 / 1024))
                echo "  • $filename (${size_mb}MB)"
            done
        else
            warn "No media files found in $media_dir"
        fi
    else
        failure "Media directory not found: $media_dir"
        return 1
    fi
}

# Check system resources
check_system_resources() {
    echo
    info "💻 Checking system resources..."
    echo
    
    # Check disk space
    local disk_usage=$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -lt 90 ]]; then
        success "Disk usage is acceptable (${disk_usage}% used)"
    else
        warn "Disk usage is high (${disk_usage}% used)"
    fi
    
    # Check memory usage (if available)
    if command -v free &> /dev/null; then
        local mem_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
        success "Memory usage: ${mem_usage}%"
    fi
    
    # Check Docker daemon
    if docker info &> /dev/null; then
        success "Docker daemon is running"
    else
        failure "Docker daemon is not accessible"
        return 1
    fi
}

# Check logs for errors
check_recent_errors() {
    echo
    info "📋 Checking recent logs for errors..."
    echo
    
    cd "$PROJECT_ROOT"
    
    local services=("api-gateway" "ml-service" "stream-service" "video-streamer")
    local error_count=0
    
    for service in "${services[@]}"; do
        local errors=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" logs --tail=100 "$service" 2>/dev/null | grep -i error | wc -l)
        if [[ $errors -gt 0 ]]; then
            warn "$service has $errors recent error(s)"
            ((error_count += errors))
        else
            success "$service has no recent errors"
        fi
    done
    
    if [[ $error_count -eq 0 ]]; then
        success "No recent errors found in service logs"
    else
        warn "Total recent errors found: $error_count"
    fi
    
    return $error_count
}

# Generate health report
generate_report() {
    local container_status=$1
    local endpoint_status=$2
    local websocket_status=$3
    local database_status=$4
    local redis_status=$5
    local models_status=$6
    local media_status=$7
    local resources_status=$8
    local errors_status=$9
    
    echo
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    🏥 Health Check Summary"
    echo "═══════════════════════════════════════════════════════════════"
    echo
    
    local total_checks=9
    local passed_checks=0
    
    [[ $container_status -eq 0 ]] && ((passed_checks++))
    [[ $endpoint_status -eq 0 ]] && ((passed_checks++))
    [[ $websocket_status -eq 0 ]] && ((passed_checks++))
    [[ $database_status -eq 0 ]] && ((passed_checks++))
    [[ $redis_status -eq 0 ]] && ((passed_checks++))
    [[ $models_status -eq 0 ]] && ((passed_checks++))
    [[ $media_status -eq 0 ]] && ((passed_checks++))
    [[ $resources_status -eq 0 ]] && ((passed_checks++))
    [[ $errors_status -eq 0 ]] && ((passed_checks++))
    
    local health_percentage=$((passed_checks * 100 / total_checks))
    
    echo "Overall Health: $passed_checks/$total_checks checks passed ($health_percentage%)"
    echo
    
    if [[ $health_percentage -ge 90 ]]; then
        success "System is in excellent health! 🎉"
    elif [[ $health_percentage -ge 75 ]]; then
        warn "System is mostly healthy but needs attention ⚠️"
    elif [[ $health_percentage -ge 50 ]]; then
        error "System has significant issues that need addressing ❌"
    else
        error "System is in critical condition! Immediate action required 🚨"
    fi
    
    echo
    echo "Detailed Status:"
    echo "  • Container Status:    $([[ $container_status -eq 0 ]] && echo "✅ Healthy" || echo "❌ Issues")"
    echo "  • HTTP Endpoints:      $([[ $endpoint_status -eq 0 ]] && echo "✅ Healthy" || echo "❌ Issues")"
    echo "  • WebSocket:           $([[ $websocket_status -eq 0 ]] && echo "✅ Healthy" || echo "❌ Issues")"
    echo "  • Database:            $([[ $database_status -eq 0 ]] && echo "✅ Healthy" || echo "❌ Issues")"
    echo "  • Redis:               $([[ $redis_status -eq 0 ]] && echo "✅ Healthy" || echo "❌ Issues")"
    echo "  • ML Models:           $([[ $models_status -eq 0 ]] && echo "✅ Healthy" || echo "❌ Issues")"
    echo "  • Media Files:         $([[ $media_status -eq 0 ]] && echo "✅ Healthy" || echo "❌ Issues")"
    echo "  • System Resources:    $([[ $resources_status -eq 0 ]] && echo "✅ Healthy" || echo "❌ Issues")"
    echo "  • Recent Errors:       $([[ $errors_status -eq 0 ]] && echo "✅ Clean" || echo "❌ Found")"
    echo
    
    if [[ $health_percentage -lt 100 ]]; then
        echo "💡 Troubleshooting Tips:"
        echo "  • Check individual service logs: docker logs <container_name>"
        echo "  • Restart unhealthy services: docker-compose restart <service>"
        echo "  • View detailed logs: ./scripts/logs.sh"
        echo "  • Force restart all: ./scripts/restart.sh"
        echo
    fi
    
    echo "═══════════════════════════════════════════════════════════════"
}

# Main execution
main() {
    echo
    log "🏥 Starting BarnHand Health Check"
    echo
    
    check_docker_compose
    
    # Perform all health checks
    check_container_status
    container_result=$?
    
    check_http_endpoints
    endpoint_result=$?
    
    check_websocket
    websocket_result=$?
    
    check_database
    database_result=$?
    
    check_redis
    redis_result=$?
    
    check_ml_models
    models_result=$?
    
    check_media_files
    media_result=$?
    
    check_system_resources
    resources_result=$?
    
    check_recent_errors
    errors_result=$?
    
    # Generate final report
    generate_report $container_result $endpoint_result $websocket_result $database_result $redis_result $models_result $media_result $resources_result $errors_result
    
    # Return overall health status
    local total_issues=$((container_result + endpoint_result + websocket_result + database_result + redis_result + models_result + media_result + resources_result))
    exit $total_issues
}

# Run main function
main "$@"