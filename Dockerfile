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
# Use Debian slim (not Alpine) — Playwright needs glibc + ~20 system libs
FROM node:24-slim AS api

RUN corepack enable && corepack prepare pnpm@latest --activate

# Full Playwright / Chromium dependency set for Debian/Ubuntu servers
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Chromium browser
    chromium \
    # NSS / crypto
    libnss3 \
    libnspr4 \
    # Font rendering
    libfreetype6 \
    libharfbuzz0b \
    libfontconfig1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    # X11 / display stack (needed even headless)
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
    # ATK / accessibility bridge
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    # CUPS (printing subsystem Chromium links against)
    libcups2 \
    # DRM / GPU (headless still uses GBM)
    libdrm2 \
    libgbm1 \
    # DBus / udev
    libdbus-1-3 \
    libudev1 \
    # Audio (Chromium links against ALSA even headless)
    libasound2 \
    # Pango / Cairo (text layout + rendering)
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    # Misc
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium (skip its own download)
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
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
