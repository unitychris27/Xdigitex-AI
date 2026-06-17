# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all package.json files (for pnpm to resolve workspace deps)
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/xdigitex/package.json   ./artifacts/xdigitex/
COPY lib/db/package.json               ./lib/db/
COPY lib/api-spec/package.json         ./lib/api-spec/
COPY scripts/package.json              ./scripts/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build shared libs first
RUN pnpm run typecheck:libs

# Build API server (esbuild bundle)
RUN pnpm --filter @workspace/api-server run build

# Build frontend (Vite)
RUN pnpm --filter @workspace/xdigitex run build

# ── Stage 2: API runtime ──────────────────────────────────────────────────────
FROM node:24-alpine AS api

RUN corepack enable && corepack prepare pnpm@latest --activate

# Playwright + Chromium deps
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json               ./lib/db/
COPY lib/api-spec/package.json         ./lib/api-spec/
COPY scripts/package.json              ./scripts/
# tsconfig stubs for workspace resolution
COPY tsconfig.base.json tsconfig.json  ./

# Production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built bundle from builder stage
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]

# ── Stage 3: Frontend (nginx) ─────────────────────────────────────────────────
FROM nginx:alpine AS frontend

COPY --from=builder /app/artifacts/xdigitex/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
