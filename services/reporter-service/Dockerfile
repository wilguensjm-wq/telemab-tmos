# Build stage
FROM node:20-alpine as builder

WORKDIR /build

# Copy workspace root package files
COPY package.json package-lock.json ./

# Copy platform-core libraries
COPY services/platform-core ./services/platform-core

# Copy reporter-service
COPY services/reporter-service ./services/reporter-service

# Install dependencies
RUN npm install

# Build platform-core libraries
RUN npm --workspace=@platform/config run build
RUN npm --workspace=@platform/logging run build
RUN npm --workspace=@platform/monitoring run build
RUN npm --workspace=@platform/events run build
RUN npm --workspace=@platform/auth run build

# Build reporter-service
RUN npm --workspace=reporter-service run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copy built reporter-service and dependencies
COPY --from=builder /build/services/reporter-service/dist ./dist
COPY --from=builder /build/services/reporter-service/package.json ./package.json

# Install production dependencies only
RUN npm install --only=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3002

CMD ["node", "dist/index.js"]
