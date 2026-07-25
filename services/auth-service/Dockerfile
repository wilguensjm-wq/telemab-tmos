# Build stage
FROM node:20-alpine as builder

WORKDIR /build

# Copy workspace root package files
COPY package.json package-lock.json ./

# Copy platform-core libraries
COPY services/platform-core ./services/platform-core

# Copy auth-service
COPY services/auth-service ./services/auth-service

# Install dependencies
RUN npm install

# Build platform-core libraries
RUN npm --workspace=@platform/config run build
RUN npm --workspace=@platform/logging run build
RUN npm --workspace=@platform/monitoring run build
RUN npm --workspace=@platform/events run build
RUN npm --workspace=@platform/auth run build

# Build auth-service
RUN npm --workspace=auth-service run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copy built auth-service and dependencies
COPY --from=builder /build/services/auth-service/dist ./dist
COPY --from=builder /build/services/auth-service/package.json ./package.json

# Install production dependencies only
RUN npm install --only=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3001

CMD ["node", "dist/index.js"]
