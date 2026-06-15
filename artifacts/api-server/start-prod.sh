#!/bin/sh
set -e
echo "[startup] Installing Playwright Chromium..."
npx playwright install chromium 2>&1 || echo "[startup] playwright install failed (may already be installed)"
echo "[startup] Starting server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
