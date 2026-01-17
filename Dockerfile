# Multi-stage Dockerfile for LLM-Policy-Engine

# Stage 1: Build
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app

# Install dependencies (including dev for build)
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production dependencies only
FROM node:20-alpine AS deps

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app

COPY package*.json ./
# Disable prepare script (husky) and install production deps, then rebuild native modules
RUN npm pkg delete scripts.prepare && \
    npm ci --omit=dev && \
    npm rebuild && \
    npm cache clean --force

# Stage 3: Production
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user (use different GID since 1000 is taken by node)
RUN addgroup -g 1001 llmpolicy && \
    adduser -D -u 1001 -G llmpolicy llmpolicy

WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=llmpolicy:llmpolicy /app/dist ./dist
COPY --from=builder --chown=llmpolicy:llmpolicy /app/package*.json ./
COPY --from=builder --chown=llmpolicy:llmpolicy /app/proto ./proto

# Copy production dependencies from deps stage
COPY --from=deps --chown=llmpolicy:llmpolicy /app/node_modules ./node_modules

# Switch to non-root user
USER llmpolicy

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose ports
EXPOSE 3000 50051 9090

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command (can be overridden)
CMD ["node", "dist/api/server.js"]
