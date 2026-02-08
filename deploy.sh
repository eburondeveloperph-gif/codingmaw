#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Eburon AI — CodeMax Architect
# Single-command bootstrap & deploy script
# Usage:  chmod +x deploy.sh && ./deploy.sh
# ─────────────────────────────────────────────────────────────

BOLD="\033[1m"
DIM="\033[2m"
BLUE="\033[34m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"

banner() {
  echo ""
  echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${BLUE}║   Eburon AI — CodeMax Architect Deploy   ║${RESET}"
  echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════╝${RESET}"
  echo ""
}

info()    { echo -e "  ${BLUE}▸${RESET} $1"; }
success() { echo -e "  ${GREEN}✓${RESET} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $1"; }
fail()    { echo -e "  ${RED}✗${RESET} $1"; exit 1; }

# ─── Preflight checks ──────────────────────────────────────

banner

info "Running preflight checks..."

# Check Docker
if ! command -v docker &>/dev/null; then
  fail "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
fi
success "Docker found: $(docker --version | head -1)"

# Check Docker Compose
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  fail "Docker Compose is not available. Install it from https://docs.docker.com/compose/install/"
fi
success "Docker Compose found"

# Check Docker daemon
if ! docker info &>/dev/null 2>&1; then
  fail "Docker daemon is not running. Start Docker Desktop or the Docker service first."
fi
success "Docker daemon is running"

# ─── Environment setup ─────────────────────────────────────

ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
  warn "No .env.local found — creating from template..."
  cat > "$ENV_FILE" <<'ENVEOF'
VITE_OLLAMA_CLOUD_URL=https://api.ollama.com
VITE_OLLAMA_API_KEY=YOUR_OLLAMA_API_KEY_HERE

# Ollama Local (Docker container — fallback)
VITE_OLLAMA_LOCAL_URL=http://ollama:11434

# Default provider: "cloud" or "local"
VITE_OLLAMA_PROVIDER=cloud

# Backend API URL (nginx proxies /api to backend in production)
VITE_API_URL=/api
ENVEOF
  warn "Edit .env.local and set your VITE_OLLAMA_API_KEY before using the chat."
  echo ""
else
  success "Found existing .env.local"
fi

# Validate API key is set
if grep -q "YOUR_OLLAMA_API_KEY_HERE" "$ENV_FILE" 2>/dev/null; then
  warn "VITE_OLLAMA_API_KEY is still the placeholder value in .env.local"
  warn "The app will start but chat will not work until you set a real key."
  echo ""
fi

# ─── Stop existing containers ──────────────────────────────

info "Stopping any existing CodeMax containers..."
$COMPOSE down --remove-orphans 2>/dev/null || true
success "Clean slate"

# ─── Free ports ─────────────────────────────────────────────

check_port() {
  local port=$1
  local name=$2
  if lsof -i :"$port" -sTCP:LISTEN &>/dev/null 2>&1; then
    warn "Port $port ($name) is in use."
    read -rp "   Kill the process on port $port? [y/N] " choice
    if [[ "$choice" =~ ^[Yy]$ ]]; then
      lsof -ti :"$port" | xargs kill -9 2>/dev/null || true
      sleep 1
      success "Freed port $port"
    else
      fail "Port $port is required. Free it and re-run deploy.sh"
    fi
  fi
}

check_port 5432 "PostgreSQL"
check_port 4000 "Backend API"
check_port 8080 "Frontend"

# ─── Build & deploy ────────────────────────────────────────

echo ""
info "Building and starting all services..."
echo -e "  ${DIM}This may take a few minutes on first run (downloading images)${RESET}"
echo ""

$COMPOSE up --build -d

# ─── Health check ───────────────────────────────────────────

echo ""
info "Waiting for services to come online..."

# Wait for PostgreSQL
for i in $(seq 1 30); do
  if $COMPOSE exec -T db pg_isready -U codemax -d codemax &>/dev/null 2>&1; then
    success "PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    fail "PostgreSQL did not start in time. Check logs: $COMPOSE logs db"
  fi
  sleep 1
done

# Wait for Backend
for i in $(seq 1 20); do
  if curl -sf http://localhost:4000/api/health &>/dev/null; then
    success "Backend API is ready"
    break
  fi
  if [ "$i" -eq 20 ]; then
    fail "Backend did not start in time. Check logs: $COMPOSE logs backend"
  fi
  sleep 1
done

# Wait for Frontend
for i in $(seq 1 10); do
  if curl -sf http://localhost:8080 &>/dev/null; then
    success "Frontend is ready"
    break
  fi
  if [ "$i" -eq 10 ]; then
    fail "Frontend did not start in time. Check logs: $COMPOSE logs frontend"
  fi
  sleep 1
done

# ─── Done ───────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║         Deployment Complete!              ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}App:${RESET}      http://localhost:8080"
echo -e "  ${BOLD}Preview:${RESET}  http://localhost:8080/preview"
echo -e "  ${BOLD}API:${RESET}      http://localhost:4000/api/health"
echo -e "  ${BOLD}Database:${RESET} postgresql://codemax:codemax_secret@localhost:5432/codemax"
echo ""
echo -e "  ${DIM}Manage:${RESET}"
echo -e "    Stop:     ${BLUE}docker compose down${RESET}"
echo -e "    Logs:     ${BLUE}docker compose logs -f${RESET}"
echo -e "    Restart:  ${BLUE}./deploy.sh${RESET}"
echo ""
