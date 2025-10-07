# Multi-stage build for Stream Service with FFmpeg
FROM node:18-alpine as base

# Install FFmpeg and system dependencies
FROM base as deps
RUN apk add --no-cache \
    ffmpeg \
    libc6-compat \
    curl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm install

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

# Create directories for chunks and media
RUN mkdir -p /app/chunks /media

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 streamservice
RUN chown -R streamservice:nodejs /app /media
USER streamservice

# Expose ports
EXPOSE 8001 1935 8088

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

# Start development server
CMD ["npm", "run", "dev"]

# Production dependencies
FROM base as production-deps
WORKDIR /app

# Install FFmpeg
RUN apk add --no-cache \
    ffmpeg \
    curl

COPY package.json package-lock.json* ./
RUN npm install --only=production && npm cache clean --force

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
RUN adduser --system --uid 1001 streamservice

# Copy production files
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Create directories
RUN mkdir -p /app/chunks /media
RUN chown -R streamservice:nodejs /app /media
USER streamservice

# Expose ports
EXPOSE 8001 1935 8088
ENV NODE_ENV production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

CMD ["node", "dist/index.js"]