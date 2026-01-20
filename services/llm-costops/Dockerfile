# LLM-CostOps Dockerfile
# Multi-stage build for production deployment

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 costops && \
    adduser -D -u 1001 -G costops costops

WORKDIR /app

# Copy built application
COPY --from=builder --chown=costops:costops /app/dist ./dist
COPY --from=builder --chown=costops:costops /app/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Switch to non-root user
USER costops

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose port
EXPOSE 8080

# Use dumb-init for signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the service
CMD ["node", "dist/api/server.js"]
