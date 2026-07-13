FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY nx.json ./
COPY tsconfig.base.json ./

# Copy frontend app
COPY apps/frontend-dashboard ./apps/frontend-dashboard

# Install dependencies
RUN npm ci

# Build the application
RUN npx nx build frontend-dashboard --prod

# Production image with nginx
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist/apps/frontend-dashboard /usr/share/nginx/html

# Copy nginx configuration
COPY apps/frontend-dashboard/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
