# ============================================================
# Stage 1: Install dependencies
# ============================================================
FROM node:25-alpine AS deps

RUN npm install -g pnpm

WORKDIR /app

# Copy only package manifests for layer caching
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod=false

# ============================================================
# Stage 2: Build the Next.js application
# ============================================================
FROM node:25-alpine AS builder

# Build arguments — NEXT_PUBLIC_* vars are inlined into the JS bundle
# by Next.js at build time, so they work on both server and client.
ARG NEXT_PUBLIC_BRIDE_NAME=Bride
ARG NEXT_PUBLIC_GROOM_NAME=Groom
ARG NEXT_PUBLIC_WHATSAPP_NUMBER=
ARG NEXT_PUBLIC_STORAGE_PROVIDER=local
ARG NEXT_PUBLIC_GUEST_ISOLATION=true
ARG NEXT_PUBLIC_DEFAULT_LANGUAGE=en

RUN npm install -g pnpm

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Expose build args as env vars so Next.js can inline them
ENV NEXT_PUBLIC_STORAGE_PROVIDER=${NEXT_PUBLIC_STORAGE_PROVIDER}
ENV NEXT_PUBLIC_BRIDE_NAME=${NEXT_PUBLIC_BRIDE_NAME}
ENV NEXT_PUBLIC_GROOM_NAME=${NEXT_PUBLIC_GROOM_NAME}
ENV NEXT_PUBLIC_WHATSAPP_NUMBER=${NEXT_PUBLIC_WHATSAPP_NUMBER}
ENV NEXT_PUBLIC_GUEST_ISOLATION=${NEXT_PUBLIC_GUEST_ISOLATION}
ENV NEXT_PUBLIC_DEFAULT_LANGUAGE=${NEXT_PUBLIC_DEFAULT_LANGUAGE}
ENV NEXT_TELEMETRY_DISABLED=1
# Skip env validation during build (credentials aren't available yet)
ENV SKIP_ENV_VALIDATION=1

# Run type-check and lint before building
RUN pnpm type-check
RUN pnpm lint

RUN pnpm build

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM node:25-alpine AS runner

WORKDIR /app

# Runtime env vars — only what the server needs at runtime.
# NEXT_PUBLIC_* vars are already inlined in the JS bundle from build stage.
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
