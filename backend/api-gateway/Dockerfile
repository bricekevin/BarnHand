# Multi-stage build for API Gateway service
FROM node:18-alpine as base

# Install dependencies only when needed
FROM base as deps
RUN apk add --no-cache libc6-compat ffmpeg
WORKDIR /app

# Copy package files
COPY package.json ./
# Install dependencies fresh (redis included in package.json)
RUN npm install

# Development image
FROM base as development
RUN apk add --no-cache ffmpeg curl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 apigateway

# Change ownership before switching user
RUN chown -R apigateway:nodejs /app

USER apigateway

# Expose port
EXPOSE 8000
ENV PORT 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Start development server with hot reload
CMD ["npm", "run", "dev"]

# Production dependencies
FROM base as production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --only=production && npm cache clean --force

# Build stage
FROM base as builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN npm run build

# Production image
FROM node:18-alpine as production
RUN apk add --no-cache curl
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 apigateway

# Copy production dependencies
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Change ownership
RUN chown -R apigateway:nodejs /app
USER apigateway

# Expose port
EXPOSE 8000
ENV NODE_ENV production
ENV PORT 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/v1/health || exit 1

CMD ["node", "dist/index.js"]