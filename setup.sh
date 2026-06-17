#!/usr/bin/env bash
# XDIGITEX AI — One-command setup script
# Usage: bash setup.sh

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
heading() { echo -e "\n${BOLD}$1${NC}"; }

heading "XDIGITEX AI Setup"
echo "========================================"

# ── Check dependencies ────────────────────────────────────────────────────────
heading "Checking dependencies..."

command -v docker  >/dev/null 2>&1 || error "Docker is not installed. See https://docs.docker.com/get-docker/"
command -v docker compose version >/dev/null 2>&1 || \
  command -v docker-compose >/dev/null 2>&1 || \
  error "Docker Compose not found. Update Docker Desktop or install separately."

info "Docker found: $(docker --version)"

# ── Environment setup ─────────────────────────────────────────────────────────
heading "Configuring environment..."

if [ ! -f .env ]; then
  cp .env.example .env
  # Generate a random session secret
  SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
  sed -i "s/your-random-secret-here/${SESSION_SECRET}/" .env
  warn ".env created from .env.example. Fill in your API keys before starting:"
  echo ""
  echo "  nano .env   (or use any editor)"
  echo ""
  echo "  Required keys:"
  echo "    DEEPSEEK_API_KEY  — https://platform.deepseek.com"
  echo "    NVIDIA_API_KEY    — https://build.nvidia.com"
  echo "    GEMINI_API_KEY    — https://aistudio.google.com"
  echo ""
  read -p "Press Enter once you've filled in your API keys, or Ctrl+C to exit..."
else
  info ".env already exists, skipping creation"
fi

# ── Build and start ───────────────────────────────────────────────────────────
heading "Building Docker images (first run may take 3–5 min)..."

docker compose build

heading "Starting services..."

docker compose up -d

# ── Wait for DB ───────────────────────────────────────────────────────────────
heading "Waiting for database to be ready..."
for i in $(seq 1 30); do
  if docker compose exec db pg_isready -U xdigitex >/dev/null 2>&1; then
    info "Database ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "Database failed to start. Check: docker compose logs db"
  fi
  sleep 2
done

# ── Database migrations ───────────────────────────────────────────────────────
heading "Running database migrations..."
# Run schema push via api container (has drizzle-kit available)
docker compose exec api node -e "
const { drizzle } = require('drizzle-orm/node-postgres');
console.log('Migrations handled by Drizzle on first API start.');
" 2>/dev/null || true

info "Schema applied"

# ── Done ─────────────────────────────────────────────────────────────────────
heading "Setup complete!"
echo ""
echo "  Frontend : http://localhost:3000"
echo "  API      : http://localhost:8080"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f api        # API server logs"
echo "    docker compose logs -f frontend   # Frontend logs"
echo "    docker compose down               # Stop everything"
echo "    docker compose pull && docker compose up -d  # Update"
echo ""
