#!/bin/bash

# BarnHand Production Deployment Stop Script
# This script gracefully stops all BarnHand services

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
GRACEFUL_TIMEOUT=30

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

# Graceful shutdown of services
graceful_shutdown() {
    local force_mode="$1"
    
    cd "$PROJECT_ROOT"
    
    if [[ "$force_mode" == "force" ]]; then
        log "🛑 Force stopping BarnHand services..."
        $DOCKER_COMPOSE -f "$COMPOSE_FILE" down --remove-orphans --volumes --timeout 10
        return
    fi
    
    log "🛑 Gracefully stopping BarnHand services..."
    
    # Stop in reverse order of dependencies
    info "Stopping Nginx reverse proxy..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" stop nginx || warn "Failed to stop nginx"
    
    info "Stopping frontend service..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" stop frontend || warn "Failed to stop frontend"
    
    info "Stopping monitoring services..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" stop grafana prometheus fluentd || warn "Failed to stop monitoring services"
    
    info "Stopping API Gateway (allowing WebSocket connections to close)..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" stop api-gateway || warn "Failed to stop api-gateway"
    
    info "Stopping application services..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" stop stream-service ml-service video-streamer || warn "Failed to stop application services"
    
    info "Stopping infrastructure services..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" stop redis postgres || warn "Failed to stop infrastructure services"
    
    # Remove containers
    info "Removing stopped containers..."
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" down --remove-orphans
}

# Show running services before stopping
show_running_services() {
    cd "$PROJECT_ROOT"
    
    info "Currently running services:"
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps --services --filter "status=running" 2>/dev/null | grep -q .; then
        $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps
    else
        log "No BarnHand services are currently running"
        exit 0
    fi
}

# Clean up resources (optional)
cleanup_resources() {
    local remove_volumes="$1"
    local remove_images="$2"
    
    cd "$PROJECT_ROOT"
    
    if [[ "$remove_volumes" == "volumes" ]]; then
        warn "Removing data volumes (this will delete all data!)..."
        read -p "Are you sure you want to remove all data volumes? This cannot be undone! [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            $DOCKER_COMPOSE -f "$COMPOSE_FILE" down --volumes --remove-orphans
            log "Data volumes removed"
        else
            log "Data volumes preserved"
        fi
    fi
    
    if [[ "$remove_images" == "images" ]]; then
        info "Removing built images..."
        $DOCKER_COMPOSE -f "$COMPOSE_FILE" down --rmi all --remove-orphans || warn "Failed to remove some images"
    fi
    
    # Clean up unused Docker resources
    info "Cleaning up unused Docker resources..."
    docker system prune -f || warn "Failed to clean up some Docker resources"
}

# Show resource usage before stopping
show_resource_usage() {
    cd "$PROJECT_ROOT"
    
    info "Current resource usage:"
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps -q | head -n 1 | xargs -r docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" 2>/dev/null; then
        echo
    else
        log "No containers running to show stats"
    fi
}

# Create backup before stopping (optional)
create_backup() {
    if [[ -f "$PROJECT_ROOT/scripts/backup.sh" ]]; then
        info "Creating backup before stopping services..."
        bash "$PROJECT_ROOT/scripts/backup.sh" --quick
    else
        warn "Backup script not found, skipping backup creation"
    fi
}

# Show help message
show_help() {
    cat << EOF
BarnHand Stop Script

Usage: $0 [OPTIONS]

Options:
    --force             Force stop all services immediately
    --backup            Create backup before stopping
    --clean-volumes     Remove data volumes (WARNING: deletes all data)
    --clean-images      Remove built images
    --help              Show this help message

Examples:
    $0                  # Graceful shutdown
    $0 --force          # Force stop all services
    $0 --backup         # Create backup then stop
    $0 --clean-volumes  # Stop and remove all data
    $0 --force --clean-images  # Force stop and clean images

EOF
}

# Parse command line arguments
parse_arguments() {
    FORCE_MODE=""
    CREATE_BACKUP=""
    CLEAN_VOLUMES=""
    CLEAN_IMAGES=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE_MODE="force"
                shift
                ;;
            --backup)
                CREATE_BACKUP="backup"
                shift
                ;;
            --clean-volumes)
                CLEAN_VOLUMES="volumes"
                shift
                ;;
            --clean-images)
                CLEAN_IMAGES="images"
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    parse_arguments "$@"
    
    echo
    log "🛑 Stopping BarnHand Horse Streaming Platform"
    echo
    
    check_docker_compose
    show_running_services
    show_resource_usage
    
    # Create backup if requested
    if [[ "$CREATE_BACKUP" == "backup" ]]; then
        create_backup
    fi
    
    # Stop services
    graceful_shutdown "$FORCE_MODE"
    
    # Clean up resources if requested
    if [[ -n "$CLEAN_VOLUMES" ]] || [[ -n "$CLEAN_IMAGES" ]]; then
        cleanup_resources "$CLEAN_VOLUMES" "$CLEAN_IMAGES"
    fi
    
    echo
    log "✅ BarnHand services stopped successfully"
    
    if [[ "$FORCE_MODE" != "force" ]]; then
        echo
        echo "💡 Tips:"
        echo "  • To start services again: ./scripts/start.sh"
        echo "  • To view logs from stopped containers: docker logs <container_name>"
        echo "  • To force stop if needed: ./scripts/stop.sh --force"
        if [[ "$CLEAN_VOLUMES" != "volumes" ]]; then
            echo "  • Your data is preserved in Docker volumes"
        fi
    fi
    echo
}

# Run main function
main "$@"