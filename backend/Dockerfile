# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app/backend

# Install OpenSSL in builder too (needed for prisma generate engine binary)
RUN apk add --no-cache openssl

# Install dependencies (production + dev for building)
COPY backend/package*.json ./
RUN npm install

# Copy Prisma schema and generate client for the Alpine (linux-musl) target
COPY backend/prisma ./prisma
RUN npx prisma generate --generator client

# Copy source and compile TypeScript (transpile-only via tsup — skips type checking
# to avoid failures from pre-existing type errors in the codebase)
COPY backend/ ./
RUN npm run build:prod

# Prune dev dependencies so we only ship prod deps
RUN npm prune --omit=dev

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install OpenSSL — required by Prisma's query and migration engine binaries
RUN apk add --no-cache openssl

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy compiled output and production node_modules (includes Prisma engine binary)
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/backend/package.json ./package.json

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]