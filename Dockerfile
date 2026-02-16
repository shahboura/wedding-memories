# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:25-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /app

# Copy only package manifests for layer caching
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod=false

# ============================================================
# Stage 2: Build the Next.js application
# ============================================================
FROM node:25-alpine AS builder

# Install CA certificates for Turbopack to download Google Fonts over TLS
# RUN apk add --no-cache ca-certificates

RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (defaults for local mode; override at runtime)
ENV NEXT_PUBLIC_STORAGE_PROVIDER=local
ENV NEXT_TELEMETRY_DISABLED=1
# Skip env validation during build (credentials aren't available yet)
ENV SKIP_ENV_VALIDATION=1
# Enable system TLS certs so Turbopack can download Google Fonts
# ENV NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1

RUN pnpm build

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM node:25-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create uploads directory for local storage
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3010

ENV PORT=3010
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
