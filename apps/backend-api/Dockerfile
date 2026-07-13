# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json nx.json tsconfig.base.json ./

# Copy the backend app and any workspace dependencies
COPY apps/backend-api/ apps/backend-api/

# Install all dependencies
RUN npm ci --legacy-peer-deps

# Build the backend
RUN npx nx build backend-api --configuration=production

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Create logs directory for production logger
RUN mkdir -p /app/logs

# Copy built output
COPY --from=builder /app/apps/backend-api/dist/ ./

# Copy package files for production install
COPY --from=builder /app/package.json /app/package-lock.json ./

# Install only production dependencies
RUN npm ci --legacy-peer-deps --omit=dev

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "main.js"]
