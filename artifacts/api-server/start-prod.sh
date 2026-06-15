#!/bin/sh
set -e

echo "[startup] Installing Playwright Chromium..."
node -e "
const path = require('path');
const { execFileSync } = require('child_process');
try {
  const pkgJson = require.resolve('playwright/package.json');
  const cli = path.join(path.dirname(pkgJson), 'cli.js');
  execFileSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit', timeout: 120000 });
  console.log('[startup] Chromium binary ready.');
} catch(e) {
  console.error('[startup] playwright install warning:', e.message);
}
"

echo "[startup] Installing Chromium OS dependencies..."
node -e "
const path = require('path');
const { execFileSync } = require('child_process');
try {
  const pkgJson = require.resolve('playwright/package.json');
  const cli = path.join(path.dirname(pkgJson), 'cli.js');
  execFileSync(process.execPath, [cli, 'install-deps', 'chromium'], { stdio: 'inherit', timeout: 120000 });
  console.log('[startup] Chromium deps ready.');
} catch(e) {
  console.error('[startup] install-deps warning (non-fatal):', e.message);
}
"

echo "[startup] Starting server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
