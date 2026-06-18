# ── Stage 1: Builder ─────────────────────────────────────────────────────────
# node:24-slim (Debian) — NOT Alpine. Rollup, esbuild, and Vite native binaries
# are glibc builds; Alpine's musl libc causes "Cannot find module" at build time.
FROM node:24-slim AS builder

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

# Approve native build scripts (esbuild, ssh2, cpu-features need post-install)
# then install all dependencies
RUN pnpm approve-builds esbuild ssh2 cpu-features 2>/dev/null || true
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
# node:24-slim (Debian) — Playwright needs glibc + ~28 system libs.
FROM node:24-slim AS api

RUN corepack enable && corepack prepare pnpm@latest --activate

# Full Playwright / Chromium dependency set for Debian/Ubuntu servers
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libnspr4 \
    libfreetype6 \
    libharfbuzz0b \
    libfontconfig1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libdbus-1-3 \
    libudev1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json               ./lib/db/
COPY lib/api-spec/package.json         ./lib/api-spec/
COPY scripts/package.json              ./scripts/
COPY tsconfig.base.json tsconfig.json  ./

# Approve native build scripts then install production deps only
RUN pnpm approve-builds esbuild ssh2 cpu-features 2>/dev/null || true
RUN pnpm install --frozen-lockfile --prod

# Copy built bundle from builder stage
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]

# ── Stage 3: Frontend (nginx) ─────────────────────────────────────────────────
FROM nginx:stable-alpine AS frontend

COPY --from=builder /app/artifacts/xdigitex/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
