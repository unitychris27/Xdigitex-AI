#!/bin/sh
echo "[startup] Installing Playwright Chromium..."
node -e "
const path = require('path');
const { execFileSync } = require('child_process');
try {
  const pkgJson = require.resolve('playwright/package.json');
  const cli = path.join(path.dirname(pkgJson), 'cli.js');
  execFileSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit', timeout: 120000 });
  console.log('[startup] Chromium ready.');
} catch(e) {
  console.error('[startup] playwright install warning:', e.message);
}
"
echo "[startup] Starting server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
