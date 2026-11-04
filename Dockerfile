# ==============================================================================
# TOP 10 PLATFORM — PRODUCTION DOCKERFILE
# Multi-stage lightweight, secure Alpine Node.js container
# ==============================================================================

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3456

# Install minimal production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy application source code
COPY server.js db.js blog-data.js initial-data.js ./
COPY public ./public
COPY data ./data

# Create non-root user for security
RUN addgroup -S top10group && adduser -S top10user -G top10group \
    && chown -R top10user:top10group /app

USER top10user

EXPOSE 3456

# Healthcheck to ensure container is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3456/api/admin/db-status || exit 1

CMD ["node", "server.js"]
