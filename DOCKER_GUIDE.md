# BarnHand Docker Deployment Guide

## Overview

BarnHand supports multiple deployment modes to fit your development and production needs.

## Development Modes

### 1. Local Development (npm run dev)
```bash
npm run dev
```
- All services run locally with Node.js
- Uses in-memory storage (no persistence)
- Fast development with hot reload
- No Docker required

### 2. Hybrid Development (Database + Local Services)
```bash
# Start PostgreSQL in Docker
docker compose -f docker-compose.dev.yml up postgres -d

# Start local services with database
DATABASE_URL=postgresql://admin:password@localhost:5432/barnhand npm run dev
```
- PostgreSQL runs in Docker for persistence
- Application services run locally for fast development
- Stream state persists through restarts
- Best of both worlds

### 3. Full Docker Development
```bash
npm run docker:dev:build
npm run docker:dev
```
- All services containerized
- Complete production-like environment
- Slower development cycle but consistent environment

## Production Deployment

### Docker Compose Production
```bash
npm run docker:prod:build
npm run docker:prod
```
- Optimized production builds
- All services containerized
- Full monitoring and logging
- SSL/TLS support via Nginx

## Available Commands

### Development
- `npm run dev` - Local development (no Docker)
- `npm run docker:dev` - Full Docker development environment
- `npm run docker:dev:build` - Build development Docker images
- `npm run docker:dev:down` - Stop development containers

### Production
- `npm run docker:prod` - Production Docker deployment
- `npm run docker:prod:build` - Build production Docker images
- `npm run docker:prod:down` - Stop production containers

### Utilities
- `npm run docker:logs` - View all container logs
- `npm run docker:clean` - Clean up containers and volumes

## Service URLs

### Development Mode
- Frontend: http://localhost:5173
- API Gateway: http://localhost:8000
- Video Streamer: http://localhost:8003
- PostgreSQL: localhost:5432

### Docker Mode
- Frontend: http://localhost:5173
- API Gateway: http://localhost:8000
- Video Streamer: http://localhost:8003
- All services communicate via internal Docker network

## Stream Persistence

With PostgreSQL running (either mode 2 or 3), your streams will:
- ✅ Persist through service restarts
- ✅ Automatically restore active streams on startup
- ✅ Track full stream history and metadata
- ✅ Support multi-tenant farm isolation

## Quick Start

**For Development:**
```bash
# Start with database persistence
docker compose -f docker-compose.dev.yml up postgres -d
DATABASE_URL=postgresql://admin:password@localhost:5432/barnhand npm run dev
```

**For Production Testing:**
```bash
npm run docker:dev:build
npm run docker:dev
```

Your application will be available at http://localhost:5173