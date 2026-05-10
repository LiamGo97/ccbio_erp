# Multi-stage build for Next.js + NestJS

# Stage 1: Build Next.js frontend
# Use regular node image instead of alpine for better compatibility with native modules
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

# Install yarn 1.x and build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare yarn@1.22.22 --activate

# Copy frontend source (including package.json and yarn.lock)
COPY frontend/ ./

# Install dependencies (with retry for network issues)
RUN yarn install --network-timeout 100000 || yarn install --network-timeout 100000

# Build Next.js (standalone mode for production)
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN yarn build

# Stage 2: Build NestJS backend
FROM node:20-slim AS backend-builder
WORKDIR /app/backend

# Install yarn 1.x
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Copy backend source (including package.json and yarn.lock)
COPY backend/ ./

# Install dependencies (with retry for network issues)
RUN yarn install --network-timeout 100000 || yarn install --network-timeout 100000

# Build NestJS
ENV NODE_ENV=production
RUN yarn build

# Stage 3: Production runtime
FROM node:20-slim
WORKDIR /app

# Install yarn 1.x and runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare yarn@1.22.22 --activate

# Install production dependencies for backend
COPY backend/package.json backend/yarn.lock ./backend/
WORKDIR /app/backend
RUN yarn install --production --network-timeout 100000 || yarn install --production --network-timeout 100000

# Copy backend build output
COPY --from=backend-builder /app/backend/dist ./dist

# Copy Next.js static export
COPY --from=frontend-builder /app/frontend/out ./frontend/out

# Verify frontend build was copied
RUN ls -la ./frontend/out/ 2>&1 || echo "Frontend out directory not found" && \
    ls -la ./frontend/ 2>&1 || echo "Frontend directory not found"

# Copy environment files (will be overridden by Cloud Run env vars)
COPY backend/.env.production ./backend/.env.production

# Expose port (Cloud Run uses PORT env var)
ENV PORT=8080
ENV NODE_ENV=production

# Start the NestJS backend which also serves the Next.js frontend
WORKDIR /app/backend
CMD ["node", "dist/main.js"]

