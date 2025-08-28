# Multi-stage build for Video Streamer service
FROM node:18-alpine as base

# Install FFmpeg and system dependencies
FROM base as deps
RUN apk add --no-cache \
    ffmpeg \
    libc6-compat \
    curl \
    bash

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY ../../shared/package.json ../../shared/
RUN npm ci

# Development image
FROM base as development
WORKDIR /app

# Install FFmpeg and tools
RUN apk add --no-cache \
    ffmpeg \
    curl \
    bash

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create media directory
RUN mkdir -p /media

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 videostreamer
RUN chown -R videostreamer:nodejs /app /media
USER videostreamer

# Expose ports
EXPOSE 8003
EXPOSE 5000-5100/udp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8003/health || exit 1

# Start development server
CMD ["npm", "run", "dev"]

# Production dependencies
FROM base as production-deps
WORKDIR /app

# Install FFmpeg
RUN apk add --no-cache \
    ffmpeg \
    curl \
    bash

COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base as builder
WORKDIR /app

# Install FFmpeg for build
RUN apk add --no-cache ffmpeg

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN npm run build

# Production image
FROM node:18-alpine as production
WORKDIR /app

# Install FFmpeg and runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    bash

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 videostreamer

# Copy production files
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Create media directory
RUN mkdir -p /media
RUN chown -R videostreamer:nodejs /app /media
USER videostreamer

# Expose ports
EXPOSE 8003
EXPOSE 5000-5100/udp
ENV NODE_ENV production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8003/health || exit 1

CMD ["node", "dist/index.js"]