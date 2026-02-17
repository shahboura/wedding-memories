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

# Build arguments for configurable values
ARG BRIDE_NAME=Bride
ARG GROOM_NAME=Groom
ARG WHATSAPP_NUMBER=
ARG STORAGE_PROVIDER=local
ARG GUEST_ISOLATION=true

RUN npm install -g pnpm

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (baked into the bundle)
ENV STORAGE_PROVIDER=${STORAGE_PROVIDER}
ENV BRIDE_NAME=${BRIDE_NAME}
ENV GROOM_NAME=${GROOM_NAME}
ENV WHATSAPP_NUMBER=${WHATSAPP_NUMBER}
ENV GUEST_ISOLATION=${GUEST_ISOLATION}
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
