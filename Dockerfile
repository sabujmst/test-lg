# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Create production runner
FROM node:20-bookworm-slim
WORKDIR /app

# Install Ubuntu/Debian system tools for local diagnostics fallback
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    traceroute \
    mtr-tiny \
    && rm -rf /var/lib/apt/lists/*

# Copy backend dependencies
COPY backend/package*.json ./backend/
RUN npm install --prefix backend --omit=dev

# Copy backend source code and config
COPY backend/ ./backend/

# Copy compiled frontend assets from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose server port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Start server
CMD ["node", "backend/src/server.js"]
