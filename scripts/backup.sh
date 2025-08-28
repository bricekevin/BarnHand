#!/bin/bash

# BarnHand Backup Script
# This script creates backups of BarnHand data and configuration

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
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="barnhand_backup_$TIMESTAMP"

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

# Create backup directory
create_backup_directory() {
    log "Creating backup directory..."
    
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    
    # Create subdirectories
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME/database"
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME/volumes"
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME/config"
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME/logs"
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME/metadata"
    
    log "Backup directory created: $BACKUP_DIR/$BACKUP_NAME"
}

# Backup database
backup_database() {
    log "Backing up PostgreSQL database..."
    
    cd "$PROJECT_ROOT"
    
    # Check if postgres container is running
    if ! $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps postgres | grep -q "Up"; then
        warn "PostgreSQL container is not running, skipping database backup"
        return 0
    fi
    
    # Create database dump
    local db_backup_file="$BACKUP_DIR/$BACKUP_NAME/database/barnhand_database.sql"
    
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T postgres pg_dump -U admin -d barnhand --verbose > "$db_backup_file" 2>/dev/null; then
        local backup_size=$(stat -f%z "$db_backup_file" 2>/dev/null || stat -c%s "$db_backup_file" 2>/dev/null || echo "0")
        local backup_size_mb=$((backup_size / 1024 / 1024))
        log "Database backup completed (${backup_size_mb}MB)"
        
        # Compress database backup
        gzip "$db_backup_file"
        log "Database backup compressed"
    else
        error "Failed to backup database"
        return 1
    fi
    
    # Backup database schema only (for reference)
    local schema_backup_file="$BACKUP_DIR/$BACKUP_NAME/database/schema_only.sql"
    $DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T postgres pg_dump -U admin -d barnhand --schema-only > "$schema_backup_file" 2>/dev/null || warn "Failed to backup schema"
}

# Backup Redis data
backup_redis() {
    log "Backing up Redis data..."
    
    cd "$PROJECT_ROOT"
    
    # Check if redis container is running
    if ! $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps redis | grep -q "Up"; then
        warn "Redis container is not running, skipping Redis backup"
        return 0
    fi
    
    # Create Redis backup
    local redis_backup_file="$BACKUP_DIR/$BACKUP_NAME/database/redis_data.rdb"
    
    # Save Redis data
    if $DOCKER_COMPOSE -f "$COMPOSE_FILE" exec -T redis redis-cli BGSAVE && sleep 2; then
        # Copy the RDB file from container
        docker cp $($DOCKER_COMPOSE -f "$COMPOSE_FILE" ps -q redis):/data/dump.rdb "$redis_backup_file" || warn "Failed to copy Redis backup"
        
        if [[ -f "$redis_backup_file" ]]; then
            log "Redis backup completed"
        else
            warn "Redis backup file not found"
        fi
    else
        warn "Failed to create Redis backup"
    fi
}

# Backup Docker volumes
backup_volumes() {
    log "Backing up Docker volumes..."
    
    cd "$PROJECT_ROOT"
    
    local volumes=(
        "postgres_data:database"
        "redis_data:cache"
        "chunks_data:processed_chunks"
        "processed_data:processed_videos"
        "ml_cache:ml_cache"
    )
    
    for volume_info in "${volumes[@]}"; do
        IFS=':' read -r volume_name backup_subdir <<< "$volume_info"
        
        # Check if volume exists
        if docker volume ls | grep -q "$volume_name"; then
            info "Backing up volume: $volume_name"
            
            local volume_backup_dir="$BACKUP_DIR/$BACKUP_NAME/volumes/$backup_subdir"
            mkdir -p "$volume_backup_dir"
            
            # Create temporary container to access volume
            docker run --rm \
                -v "${volume_name}:/source:ro" \
                -v "$volume_backup_dir:/backup" \
                alpine:latest \
                sh -c "cd /source && tar czf /backup/${volume_name}.tar.gz ." || warn "Failed to backup volume $volume_name"
        else
            warn "Volume $volume_name not found"
        fi
    done
    
    log "Volume backup completed"
}

# Backup configuration files
backup_config() {
    log "Backing up configuration files..."
    
    local config_files=(
        ".env.production"
        "docker-compose.prod.yml"
        "docker-compose.yml"
        "infrastructure/"
        "scripts/"
    )
    
    for config_item in "${config_files[@]}"; do
        local source_path="$PROJECT_ROOT/$config_item"
        
        if [[ -e "$source_path" ]]; then
            info "Backing up: $config_item"
            cp -r "$source_path" "$BACKUP_DIR/$BACKUP_NAME/config/" || warn "Failed to backup $config_item"
        else
            warn "Configuration item not found: $config_item"
        fi
    done
    
    log "Configuration backup completed"
}

# Backup logs
backup_logs() {
    log "Backing up container logs..."
    
    cd "$PROJECT_ROOT"
    
    local services=(
        "api-gateway"
        "ml-service"
        "stream-service"
        "video-streamer"
        "frontend"
        "postgres"
        "redis"
        "nginx"
    )
    
    for service in "${services[@]}"; do
        local log_file="$BACKUP_DIR/$BACKUP_NAME/logs/${service}.log"
        
        if $DOCKER_COMPOSE -f "$COMPOSE_FILE" logs --no-color "$service" > "$log_file" 2>/dev/null; then
            info "Backed up logs for: $service"
            
            # Compress log file if it's large
            local log_size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo "0")
            if [[ $log_size -gt 1048576 ]]; then  # > 1MB
                gzip "$log_file"
            fi
        else
            warn "Failed to backup logs for: $service"
        fi
    done
    
    log "Log backup completed"
}

# Create backup metadata
create_metadata() {
    log "Creating backup metadata..."
    
    local metadata_file="$BACKUP_DIR/$BACKUP_NAME/metadata/backup_info.txt"
    
    cat > "$metadata_file" << EOF
BarnHand Backup Information
==========================

Backup Name: $BACKUP_NAME
Backup Date: $(date)
Backup Type: $BACKUP_TYPE
Created By: $(whoami)
Hostname: $(hostname)

System Information:
- OS: $(uname -s)
- Architecture: $(uname -m)
- Docker Version: $(docker --version)
- Docker Compose Version: $($DOCKER_COMPOSE --version)

Backup Contents:
- Database dump (PostgreSQL)
- Redis data
- Docker volumes
- Configuration files
- Container logs
- System metadata

Project Information:
- Project Root: $PROJECT_ROOT
- Compose File: $COMPOSE_FILE
- Git Branch: $(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")
- Git Commit: $(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")

Container Status at Backup Time:
$(cd "$PROJECT_ROOT" && $DOCKER_COMPOSE -f "$COMPOSE_FILE" ps || echo "Failed to get container status")

Docker Images:
$(docker images --filter "reference=*barnhand*" --filter "reference=barnhand*" || echo "No BarnHand images found")

Volume Information:
$(docker volume ls --filter "name=barnhand" || echo "No BarnHand volumes found")
EOF
    
    # Create checksums file
    local checksum_file="$BACKUP_DIR/$BACKUP_NAME/metadata/checksums.md5"
    find "$BACKUP_DIR/$BACKUP_NAME" -type f -not -path "*/metadata/*" -exec md5sum {} \; > "$checksum_file" 2>/dev/null || \
    find "$BACKUP_DIR/$BACKUP_NAME" -type f -not -path "*/metadata/*" -exec md5 {} \; > "$checksum_file" 2>/dev/null || \
    warn "Failed to create checksums"
    
    log "Backup metadata created"
}

# Compress backup
compress_backup() {
    if [[ "$COMPRESS_BACKUP" == "true" ]]; then
        log "Compressing backup archive..."
        
        cd "$BACKUP_DIR"
        tar czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
        
        if [[ -f "${BACKUP_NAME}.tar.gz" ]]; then
            local archive_size=$(stat -f%z "${BACKUP_NAME}.tar.gz" 2>/dev/null || stat -c%s "${BACKUP_NAME}.tar.gz" 2>/dev/null || echo "0")
            local archive_size_mb=$((archive_size / 1024 / 1024))
            
            log "Backup compressed to ${BACKUP_NAME}.tar.gz (${archive_size_mb}MB)"
            
            # Remove uncompressed directory
            rm -rf "$BACKUP_NAME"
        else
            error "Failed to create compressed backup"
            return 1
        fi
    fi
}

# Clean old backups
clean_old_backups() {
    if [[ "$KEEP_DAYS" -gt 0 ]]; then
        log "Cleaning up old backups (keeping last $KEEP_DAYS days)..."
        
        find "$BACKUP_DIR" -name "barnhand_backup_*" -type d -mtime +$KEEP_DAYS -exec rm -rf {} \; 2>/dev/null || true
        find "$BACKUP_DIR" -name "barnhand_backup_*.tar.gz" -type f -mtime +$KEEP_DAYS -exec rm -f {} \; 2>/dev/null || true
        
        local remaining_backups=$(find "$BACKUP_DIR" -name "barnhand_backup_*" | wc -l)
        log "Cleanup completed. $remaining_backups backup(s) remaining."
    fi
}

# Show backup summary
show_backup_summary() {
    log "🎉 Backup completed successfully!"
    echo
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    📦 Backup Summary"
    echo "═══════════════════════════════════════════════════════════════"
    echo
    echo "📂 Backup Location: $BACKUP_DIR/$BACKUP_NAME"
    echo "📅 Backup Date: $(date)"
    echo "🏷️  Backup Type: $BACKUP_TYPE"
    echo
    
    # Calculate total backup size
    local backup_path="$BACKUP_DIR/$BACKUP_NAME"
    if [[ "$COMPRESS_BACKUP" == "true" ]]; then
        backup_path="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"
    fi
    
    if [[ -e "$backup_path" ]]; then
        local backup_size=$(du -sh "$backup_path" | cut -f1)
        echo "💾 Backup Size: $backup_size"
    fi
    
    echo
    echo "📋 Backup Contents:"
    echo "  ✅ Database dump (PostgreSQL)"
    echo "  ✅ Redis data"
    echo "  ✅ Docker volumes"
    echo "  ✅ Configuration files"
    echo "  ✅ Container logs"
    echo "  ✅ System metadata"
    echo
    echo "🔧 Restoration:"
    echo "  To restore from this backup:"
    echo "  1. Stop all services: ./scripts/stop.sh"
    echo "  2. Extract backup if compressed"
    echo "  3. Restore database: docker exec -i postgres psql -U admin -d barnhand < database/barnhand_database.sql"
    echo "  4. Restore volumes using Docker"
    echo "  5. Start services: ./scripts/start.sh"
    echo
    echo "═══════════════════════════════════════════════════════════════"
}

# Show help message
show_help() {
    cat << EOF
BarnHand Backup Script

Usage: $0 [OPTIONS]

Options:
    --quick            Quick backup (database and config only)
    --full             Full backup (all data and logs) [default]
    --emergency        Emergency backup (minimal, fast)
    --compress         Compress backup into tar.gz
    --keep-days N      Keep backups for N days (default: 30)
    --no-cleanup       Don't clean up old backups
    --help             Show this help message

Backup Types:
    quick      - Database, Redis, configuration files
    full       - Everything including volumes and logs
    emergency  - Database and essential config only

Examples:
    $0                          # Full backup
    $0 --quick --compress       # Quick compressed backup
    $0 --emergency              # Emergency backup
    $0 --keep-days 7            # Keep backups for 7 days
    $0 --full --compress        # Full compressed backup

The backup will be stored in ./backups/ directory.

EOF
}

# Parse command line arguments
parse_arguments() {
    BACKUP_TYPE="full"
    COMPRESS_BACKUP="false"
    KEEP_DAYS=30
    CLEANUP_OLD="true"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --quick)
                BACKUP_TYPE="quick"
                shift
                ;;
            --full)
                BACKUP_TYPE="full"
                shift
                ;;
            --emergency)
                BACKUP_TYPE="emergency"
                shift
                ;;
            --compress)
                COMPRESS_BACKUP="true"
                shift
                ;;
            --keep-days)
                if [[ -n "$2" ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
                    KEEP_DAYS="$2"
                    shift 2
                else
                    error "Invalid value for --keep-days: $2"
                    exit 1
                fi
                ;;
            --no-cleanup)
                CLEANUP_OLD="false"
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
    
    # Update backup name to include type
    BACKUP_NAME="barnhand_${BACKUP_TYPE}_backup_$TIMESTAMP"
}

# Main execution
main() {
    parse_arguments "$@"
    
    echo
    log "📦 Starting BarnHand Backup ($BACKUP_TYPE)"
    echo
    
    check_docker_compose
    create_backup_directory
    
    # Perform backup based on type
    case "$BACKUP_TYPE" in
        "emergency")
            backup_database
            backup_config
            ;;
        "quick")
            backup_database
            backup_redis
            backup_config
            ;;
        "full")
            backup_database
            backup_redis
            backup_volumes
            backup_config
            backup_logs
            ;;
        *)
            error "Unknown backup type: $BACKUP_TYPE"
            exit 1
            ;;
    esac
    
    create_metadata
    compress_backup
    
    if [[ "$CLEANUP_OLD" == "true" ]]; then
        clean_old_backups
    fi
    
    show_backup_summary
}

# Run main function
main "$@"