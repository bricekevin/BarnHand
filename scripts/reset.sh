#!/bin/bash

# BarnHand Reset Script
# This script resets the BarnHand system to a clean state

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

# Show warning about reset
show_reset_warning() {
    echo
    echo "⚠️  ⚠️  ⚠️  DANGER: SYSTEM RESET  ⚠️  ⚠️  ⚠️"
    echo
    echo "This will perform a COMPLETE RESET of BarnHand:"
    echo
    echo "🗑️  What will be DELETED:"
    echo "  • All Docker containers and images"
    echo "  • All database data and horse tracking history"
    echo "  • All processed video chunks and cache"
    echo "  • All Redis cache and session data"
    echo "  • All monitoring data and logs"
    echo
    echo "💾  What will be PRESERVED:"
    echo "  • Your source code and configuration files"
    echo "  • Media files in ./media/ directory"
    echo "  • ML models in ./models/ directory"
    echo "  • Environment configuration files"
    echo
    echo "After reset, you will need to run './scripts/start.sh' to restart the system."
    echo
    
    read -p "Are you absolutely sure you want to proceed? Type 'RESET' to confirm: " confirmation
    
    if [[ "$confirmation" != "RESET" ]]; then
        log "Reset cancelled by user"
        exit 0
    fi
    
    echo
    warn "Proceeding with system reset in 5 seconds..."
    echo "Press Ctrl+C to abort!"
    
    for i in {5..1}; do
        echo -n "$i..."
        sleep 1
    done
    
    echo
    echo
}

# Create backup before reset
create_backup() {
    if [[ -f "$PROJECT_ROOT/scripts/backup.sh" ]]; then
        log "Creating emergency backup before reset..."
        bash "$PROJECT_ROOT/scripts/backup.sh" --emergency || warn "Backup creation failed, continuing with reset"
    else
        warn "Backup script not found, proceeding without backup"
    fi
}

# Stop all services
stop_services() {
    log "Stopping all BarnHand services..."
    
    cd "$PROJECT_ROOT"
    
    # Force stop all services
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" down --remove-orphans --timeout 30 || warn "Some containers may not have stopped cleanly"
    
    # Also stop development compose if running
    if [[ -f "docker-compose.yml" ]]; then
        $DOCKER_COMPOSE -f "docker-compose.yml" down --remove-orphans --timeout 30 2>/dev/null || true
    fi
    
    log "All services stopped"
}

# Remove all containers and images
remove_containers_and_images() {
    log "Removing all BarnHand containers and images..."
    
    cd "$PROJECT_ROOT"
    
    # Remove all containers and images
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" down --rmi all --remove-orphans --timeout 30 || warn "Failed to remove some containers/images"
    
    # Clean up any dangling containers
    if docker ps -a --filter "name=barnhand" --filter "name=ml-service" --filter "name=api-gateway" --filter "name=stream-service" --filter "name=video-streamer" --filter "name=frontend" -q | head -n 1; then
        info "Cleaning up remaining BarnHand containers..."
        docker ps -a --filter "name=barnhand" --filter "name=ml-service" --filter "name=api-gateway" --filter "name=stream-service" --filter "name=video-streamer" --filter "name=frontend" -q | xargs -r docker rm -f
    fi
    
    log "Containers and images removed"
}

# Remove all volumes
remove_volumes() {
    log "Removing all data volumes..."
    
    cd "$PROJECT_ROOT"
    
    # Remove compose volumes
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" down --volumes --remove-orphans --timeout 30 || warn "Failed to remove some volumes"
    
    # Remove any remaining BarnHand volumes
    if docker volume ls --filter "name=barnhand" -q | head -n 1; then
        info "Cleaning up remaining BarnHand volumes..."
        docker volume ls --filter "name=barnhand" -q | xargs -r docker volume rm
    fi
    
    log "All volumes removed"
}

# Clean up temporary files
cleanup_temp_files() {
    log "Cleaning up temporary files..."
    
    local temp_dirs=(
        "$PROJECT_ROOT/chunks"
        "$PROJECT_ROOT/processed"
        "$PROJECT_ROOT/cache"
        "$PROJECT_ROOT/logs"
        "$PROJECT_ROOT/.tmp"
    )
    
    for dir in "${temp_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            info "Removing temporary directory: $dir"
            rm -rf "$dir"
        fi
    done
    
    # Clean up any log files
    find "$PROJECT_ROOT" -name "*.log" -type f -delete 2>/dev/null || true
    
    log "Temporary files cleaned up"
}

# Clean up Docker system
cleanup_docker_system() {
    log "Cleaning up Docker system..."
    
    # Remove unused networks
    docker network prune -f || warn "Failed to prune networks"
    
    # Remove unused images
    docker image prune -a -f || warn "Failed to prune images"
    
    # Remove build cache
    docker builder prune -a -f || warn "Failed to prune build cache"
    
    # Remove unused volumes (system-wide)
    docker volume prune -f || warn "Failed to prune volumes"
    
    log "Docker system cleaned up"
}

# Reset file permissions (if needed)
reset_permissions() {
    log "Resetting file permissions..."
    
    # Make scripts executable
    chmod +x "$PROJECT_ROOT/scripts"/*.sh 2>/dev/null || true
    
    # Fix model directory permissions if they exist
    if [[ -d "$PROJECT_ROOT/models" ]]; then
        chmod -R 755 "$PROJECT_ROOT/models" || warn "Failed to reset model directory permissions"
    fi
    
    # Fix media directory permissions if they exist
    if [[ -d "$PROJECT_ROOT/media" ]]; then
        chmod -R 755 "$PROJECT_ROOT/media" || warn "Failed to reset media directory permissions"
    fi
    
    log "File permissions reset"
}

# Verify reset completion
verify_reset() {
    log "Verifying reset completion..."
    
    cd "$PROJECT_ROOT"
    
    # Check for running containers
    local running_containers=$($DOCKER_COMPOSE -f "$COMPOSE_FILE" ps -q | wc -l)
    if [[ $running_containers -eq 0 ]]; then
        log "✅ No containers are running"
    else
        warn "❌ Some containers are still running"
    fi
    
    # Check for remaining images
    local barnhand_images=$(docker images --filter "reference=barnhand*" --filter "reference=*barnhand*" -q | wc -l)
    if [[ $barnhand_images -eq 0 ]]; then
        log "✅ No BarnHand images found"
    else
        warn "❌ Some BarnHand images still exist"
    fi
    
    # Check for remaining volumes
    local barnhand_volumes=$(docker volume ls --filter "name=barnhand" -q | wc -l)
    if [[ $barnhand_volumes -eq 0 ]]; then
        log "✅ No BarnHand volumes found"
    else
        warn "❌ Some BarnHand volumes still exist"
    fi
    
    log "Reset verification completed"
}

# Show post-reset information
show_completion_info() {
    echo
    log "🔄 BarnHand system reset completed successfully!"
    echo
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    🔄 System Reset Complete"
    echo "═══════════════════════════════════════════════════════════════"
    echo
    echo "✅ What was reset:"
    echo "  • All Docker containers stopped and removed"
    echo "  • All Docker images removed"
    echo "  • All data volumes removed"
    echo "  • All temporary files cleaned up"
    echo "  • Docker system cache cleared"
    echo
    echo "💾 What was preserved:"
    echo "  • Source code and configuration files"
    echo "  • Media files (./media/)"
    echo "  • ML models (./models/)"
    echo "  • Environment configuration"
    echo
    echo "🚀 Next steps:"
    echo "  1. Review your .env.production file"
    echo "  2. Start the system: ./scripts/start.sh"
    echo "  3. Verify operation: ./scripts/health.sh"
    echo
    echo "⚠️  Note: All previous data has been lost!"
    echo "  • Horse tracking history"
    echo "  • Processed video chunks"
    echo "  • User accounts and sessions"
    echo "  • Historical analytics data"
    echo
    echo "═══════════════════════════════════════════════════════════════"
}

# Show help message
show_help() {
    cat << EOF
BarnHand Reset Script

Usage: $0 [OPTIONS]

Options:
    --no-backup         Skip backup creation before reset
    --force            Skip confirmation prompts
    --help             Show this help message

DANGER: This script will completely reset your BarnHand installation!

This will remove:
- All containers and images
- All database data
- All processed video data
- All cache and temporary files

This will preserve:
- Source code
- Configuration files
- Media files (./media/)
- ML models (./models/)

Examples:
    $0                 # Interactive reset with backup
    $0 --no-backup     # Reset without backup
    $0 --force         # Force reset without prompts

EOF
}

# Parse command line arguments
parse_arguments() {
    SKIP_BACKUP=""
    FORCE_MODE=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-backup)
                SKIP_BACKUP="true"
                shift
                ;;
            --force)
                FORCE_MODE="true"
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
    log "🔄 BarnHand System Reset Utility"
    
    check_docker_compose
    
    # Show warning unless force mode
    if [[ "$FORCE_MODE" != "true" ]]; then
        show_reset_warning
    fi
    
    # Create backup unless skipped
    if [[ "$SKIP_BACKUP" != "true" ]]; then
        create_backup
    fi
    
    # Perform reset steps
    stop_services
    remove_containers_and_images
    remove_volumes
    cleanup_temp_files
    cleanup_docker_system
    reset_permissions
    verify_reset
    
    show_completion_info
}

# Run main function
main "$@"