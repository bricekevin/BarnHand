#!/bin/bash
# BarnHand Docker Start Script
# This script ensures environment variables are properly loaded before starting services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load environment variables from .env file
if [ -f .env ]; then
    echo "Loading environment from .env file..."
    set -a
    source .env
    set +a
else
    echo "Warning: .env file not found, using defaults"
fi

# Check for common port conflicts and suggest alternatives
check_port() {
    local port=$1
    local service=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "Warning: Port $port ($service) is in use by another process"
        return 1
    fi
    return 0
}

echo "Checking for port conflicts..."
check_port "${DATABASE_PORT:-5432}" "PostgreSQL" || echo "  -> Set DATABASE_PORT in .env to use a different port"
check_port "${REDIS_PORT:-6379}" "Redis" || echo "  -> Set REDIS_PORT in .env to use a different port"
check_port "${FRONTEND_PORT:-5174}" "Frontend" || echo "  -> Set FRONTEND_PORT in .env to use a different port"
check_port "${API_GATEWAY_PORT:-8000}" "API Gateway" || echo "  -> Set API_GATEWAY_PORT in .env to use a different port"

echo ""
echo "Starting BarnHand services..."
echo "  PostgreSQL: ${DATABASE_PORT:-5432}"
echo "  Redis: ${REDIS_PORT:-6379}"
echo "  Frontend: ${FRONTEND_PORT:-5174}"
echo "  API Gateway: ${API_GATEWAY_PORT:-8000}"
echo ""

# Run docker compose with the loaded environment
docker compose "$@"
