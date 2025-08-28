#!/bin/bash

# BarnHand Production Deployment Start Script
# This script starts the complete BarnHand horse streaming platform

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
TIMEOUT=300  # 5 minutes timeout for service startup
MAX_RETRIES=3

# Logging function
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

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Set Docker Compose command
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    else
        DOCKER_COMPOSE="docker-compose"
    fi
    
    # Check if running as root on Linux
    if [[ "$OSTYPE" == "linux-gnu"* ]] && [[ $EUID -eq 0 ]]; then
        warn "Running as root. Consider using a non-root user with docker group membership."
    fi
    
    # Check available disk space (minimum 10GB)
    if command -v df &> /dev/null; then
        available_space=$(df -BG "$PROJECT_ROOT" | tail -1 | awk '{print $4}' | sed 's/G//')
        if [[ $available_space -lt 10 ]]; then
            warn "Low disk space detected (${available_space}GB available). Minimum 10GB recommended."
        fi
    fi
    
    log "Prerequisites check completed successfully"
}

# Validate environment configuration
validate_environment() {
    log "Validating environment configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file $ENV_FILE not found. Please copy .env.production to .env and configure it."
        exit 1
    fi
    
    # Source environment file
    set -a
    source "$ENV_FILE"
    set +a
    
    # Check required variables
    required_vars=(
        "JWT_SECRET"
        "POSTGRES_PASSWORD"
        "GRAFANA_ADMIN_PASSWORD"
    )
    
    missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]] || [[ "${!var}" == *"change-this"* ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        error "Please configure the following required environment variables:"
        printf '%s\n' "${missing_vars[@]}" | sed 's/^/  - /'
        exit 1
    fi
    
    # Check model files
    if [[ ! -f "$PROJECT_ROOT/models/downloads/yolo11m.pt" ]]; then
        warn "YOLO11 model not found. Running model download script..."
        if [[ -f "$PROJECT_ROOT/scripts/download_models.sh" ]]; then
            bash "$PROJECT_ROOT/scripts/download_models.sh"
        else
            error "Model download script not found and models are missing."
            exit 1
        fi
    fi
    
    log "Environment validation completed successfully"
}

# Build and start services
start_services() {
    log "Starting BarnHand services..."
    
    cd "$PROJECT_ROOT"
    
    # Clean up any existing containers
    info "Cleaning up existing containers..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" down --remove-orphans
    
    # Pull latest base images
    info "Pulling latest base images..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" pull postgres redis nginx || warn "Failed to pull some images"
    
    # Build services
    info "Building application services..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" build --parallel
    
    # Start infrastructure services first
    info "Starting infrastructure services (PostgreSQL, Redis)..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d postgres redis
    
    # Wait for database to be ready
    wait_for_service "postgres" "5432" "PostgreSQL"
    wait_for_service "redis" "6379" "Redis"
    
    # Start application services
    info "Starting application services..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d \
        video-streamer \
        ml-service \
        stream-service \
        api-gateway
    
    # Wait for application services
    wait_for_service "video-streamer" "8003" "Video Streamer"
    wait_for_service "ml-service" "8002" "ML Service"
    wait_for_service "stream-service" "8001" "Stream Service"
    wait_for_service "api-gateway" "8000" "API Gateway"
    
    # Start frontend
    info "Starting frontend service..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d frontend
    wait_for_service "frontend" "80" "Frontend"
    
    # Start monitoring services
    info "Starting monitoring services..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d \
        prometheus \
        grafana \
        fluentd
    
    # Start nginx last
    info "Starting Nginx reverse proxy..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" up -d nginx
    
    log "All services started successfully!"
}

# Wait for service to be healthy
wait_for_service() {
    local service_name="$1"
    local port="$2"
    local display_name="$3"
    local retry_count=0
    
    info "Waiting for $display_name to be ready..."
    
    while [[ $retry_count -lt $MAX_RETRIES ]]; do
        if $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps "$service_name" | grep -q "Up (healthy)"; then
            log "$display_name is healthy"
            return 0
        elif $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps "$service_name" | grep -q "Up"; then
            # Service is up but maybe not healthy yet
            sleep 10
        else
            error "$display_name failed to start properly"
            $DOCKER_COMPOSE -f "$COMPOSE_FILE" logs --tail=50 "$service_name"
            ((retry_count++))
            if [[ $retry_count -lt $MAX_RETRIES ]]; then
                warn "Retrying $display_name startup (attempt $((retry_count + 1))/$MAX_RETRIES)..."
                sleep 10
            fi
        fi
    done
    
    error "$display_name failed to start after $MAX_RETRIES attempts"
    return 1
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    cd "$PROJECT_ROOT"
    
    # Check service health
    info "Checking service health endpoints..."
    
    local services=(
        "http://localhost:8000/api/v1/health:API Gateway"
        "http://localhost:8001/health:Stream Service"
        "http://localhost:8002/health:ML Service"
        "http://localhost:8003/health:Video Streamer"
        "http://localhost:3000:Frontend"
    )
    
    for service_info in "${services[@]}"; do
        IFS=':' read -r url name <<< "$service_info"
        if curl -f -s "$url" > /dev/null; then
            log "$name is responding correctly"
        else
            warn "$name health check failed"
        fi
    done
    
    # Show running containers
    info "Running containers:"
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps
    
    # Show resource usage
    info "Container resource usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
}

# Display final information
show_completion_info() {
    log "🎉 BarnHand deployment completed successfully!"
    echo
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    🐎 BarnHand is Ready! 🐎"
    echo "═══════════════════════════════════════════════════════════════"
    echo
    echo "🌐 Web Application:      http://localhost:3000"
    echo "🔧 API Gateway:          http://localhost:8000"
    echo "📊 Grafana Dashboard:    http://localhost:3001 (admin/admin)"
    echo "📈 Prometheus:           http://localhost:9090"
    echo "🎥 Video Streams:        http://localhost:8003"
    echo
    echo "📋 Management Commands:"
    echo "  • View logs:           ./scripts/logs.sh [service]"
    echo "  • Stop services:       ./scripts/stop.sh"
    echo "  • Restart services:    ./scripts/restart.sh"
    echo "  • Health check:        ./scripts/health.sh"
    echo "  • Backup data:         ./scripts/backup.sh"
    echo
    echo "📁 Important Directories:"
    echo "  • Media files:         ./media/"
    echo "  • ML models:           ./models/"
    echo "  • Logs:               docker logs <container_name>"
    echo
    echo "⚠️  Security Notes:"
    echo "  • Change default passwords in .env.production"
    echo "  • Configure SSL certificates for production"
    echo "  • Review firewall settings"
    echo
    echo "═══════════════════════════════════════════════════════════════"
}

# Error handling
handle_error() {
    error "Deployment failed at step: $1"
    error "Check logs with: $DOCKER_COMPOSE -f $COMPOSE_FILE logs"
    exit 1
}

# Main execution
main() {
    trap 'handle_error "Unknown error"' ERR
    
    echo
    log "🚀 Starting BarnHand Horse Streaming Platform Deployment"
    echo
    
    check_prerequisites || handle_error "Prerequisites check"
    validate_environment || handle_error "Environment validation"
    start_services || handle_error "Service startup"
    verify_deployment || handle_error "Deployment verification"
    
    show_completion_info
}

# Run main function
main "$@"