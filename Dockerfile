# ==============================================================================
# TOP 10 PLATFORM — PRODUCTION DOCKERFILE
# Lightweight, secure Alpine Node.js container
# ==============================================================================

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3456

# Install minimal production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy application source code
COPY server.js db.js blog-data.js editorial-enrichment.js authors-data.js ./
COPY public ./public
COPY data ./data

# Create non-root user for security
RUN addgroup -S top10group && adduser -S top10user -G top10group \
    && chown -R top10user:top10group /app

USER top10user

EXPOSE 3456

# Healthcheck to ensure container is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3456)+'/api/health',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
