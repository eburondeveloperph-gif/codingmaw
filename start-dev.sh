#!/bin/bash
set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DOCKER_AVAILABLE=false
LOCAL_PG=false
PIDS=()

echo -e "${BLUE}🚀 Eburon AI — Local Development Bootstrap${NC}"
echo

# ─── Docker Check ───────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  if ! docker info >/dev/null 2>&1; then
    echo -e "${YELLOW}🐳 Docker is not running. Attempting to start Docker Desktop...${NC}"
    if [ -d "/Applications/Docker.app" ]; then
      open /Applications/Docker.app
      echo -e "${YELLOW}⏳ Waiting for Docker to be ready...${NC}"
      retries=0
      until docker info >/dev/null 2>&1; do
        sleep 2
        retries=$((retries + 1))
        if [ $retries -ge 60 ]; then
          echo -e "${YELLOW}⚠️  Docker did not start in time.${NC}"
          break
        fi
      done
    fi
  fi
  if docker info >/dev/null 2>&1; then
    DOCKER_AVAILABLE=true
    echo -e "${GREEN}✅ Docker is running${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Docker not installed.${NC}"
fi

# ─── PostgreSQL ─────────────────────────────────────────────────────────
if [ "$DOCKER_AVAILABLE" = true ]; then
  if ! docker compose ps db 2>/dev/null | grep -q "Up"; then
    echo -e "${YELLOW}📦 Starting PostgreSQL container...${NC}"
    docker compose up db -d
  else
    echo -e "${GREEN}✅ PostgreSQL container already running${NC}"
  fi
  echo -e "${YELLOW}⏳ Waiting for PostgreSQL...${NC}"
  until docker compose exec -T db pg_isready -U codemax >/dev/null 2>&1; do sleep 1; done
  echo -e "${GREEN}✅ PostgreSQL ready (Docker)${NC}"
else
  # Local PostgreSQL fallback (Homebrew)
  PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
  if [ -x "$PG_BIN/pg_isready" ]; then
    if ! $PG_BIN/pg_isready >/dev/null 2>&1; then
      echo -e "${YELLOW}📦 Starting local PostgreSQL...${NC}"
      brew services start postgresql@16 2>/dev/null || true
      sleep 2
    fi
    if $PG_BIN/pg_isready >/dev/null 2>&1; then
      LOCAL_PG=true
      echo -e "${GREEN}✅ PostgreSQL ready (local Homebrew)${NC}"
      # Ensure DB and user exist
      $PG_BIN/createuser -s codemax 2>/dev/null || true
      $PG_BIN/createdb -O codemax codemax 2>/dev/null || true
      $PG_BIN/psql -U codemax -d codemax -c "ALTER USER codemax PASSWORD 'codemax_secret';" >/dev/null 2>&1 || true
      # Run init.sql (safe — CREATE IF NOT EXISTS / errors ignored)
      $PG_BIN/psql -U codemax -d codemax -f backend/db/init.sql >/dev/null 2>&1 || true
    fi
  fi
  if [ "$LOCAL_PG" = false ]; then
    echo -e "${RED}❌ No PostgreSQL available. Backend will fail. Install Docker or PostgreSQL.${NC}"
  fi
fi

# ─── Docker Services (Ollama, ASR, OpenClaw) ────────────────────────────
if [ "$DOCKER_AVAILABLE" = true ]; then
  # Ollama
  if ! docker compose ps ollama 2>/dev/null | grep -q "Up"; then
    echo -e "${YELLOW}🤖 Starting Ollama container...${NC}"
    docker compose up ollama -d
  else
    echo -e "${GREEN}✅ Ollama already running${NC}"
  fi
  echo -e "${YELLOW}📥 Pulling models (background)...${NC}"
  docker compose up ollama-pull -d 2>/dev/null || true

  # Eburon ASR (STT — Voxtral Mini)
  echo -e "${YELLOW}🎤 Starting Eburon ASR (Speech-to-Text)...${NC}"
  docker compose up eburon-asr -d 2>/dev/null || docker compose up --build eburon-asr -d 2>/dev/null || true
  echo -e "${GREEN}✅ Eburon ASR starting on :5100${NC}"

  # OpenClaw Agent Gateway
  echo -e "${YELLOW}🧠 Starting OpenClaw Agent Gateway...${NC}"
  docker compose up openclaw -d 2>/dev/null || docker compose up --build openclaw -d 2>/dev/null || true
  echo -e "${GREEN}✅ OpenClaw starting on :18789${NC}"
else
  echo -e "${YELLOW}⚠️  Skipping Docker services (Ollama, ASR, OpenClaw) — Docker not available${NC}"
fi

# ─── Dependencies ───────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
  npm install
fi

if [ ! -d "backend/node_modules" ]; then
  echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
  (cd backend && npm install)
fi

# ─── Backend API ────────────────────────────────────────────────────────
echo -e "${YELLOW}🔧 Starting backend API...${NC}"
if [ -f "backend/.env" ]; then
  set -a; source backend/.env; set +a
fi

# Kill any existing backend on :4000
kill $(lsof -ti:4000) 2>/dev/null || true
sleep 1

(cd backend && node server.js > ../backend.log 2>&1) &
PIDS+=($!)

echo -e "${YELLOW}⏳ Waiting for backend API...${NC}"
retries=0
until curl -sf http://localhost:4000/api/health >/dev/null 2>&1; do
  sleep 1
  retries=$((retries + 1))
  if [ $retries -ge 30 ]; then
    echo -e "${RED}❌ Backend did not start. Check backend.log${NC}"
    break
  fi
done
if [ $retries -lt 30 ]; then
  echo -e "${GREEN}✅ Backend API ready${NC}"
fi

# ─── Ready ──────────────────────────────────────────────────────────────
echo
echo -e "${GREEN}🎉 Development environment is ready!${NC}"
echo -e "${BLUE}📍 Frontend:     http://localhost:3000${NC}"
echo -e "${BLUE}📍 Backend API:  http://localhost:4000${NC}"
if [ "$DOCKER_AVAILABLE" = true ]; then
  echo -e "${BLUE}📍 Ollama:       http://localhost:11434${NC}"
  echo -e "${BLUE}📍 Eburon ASR:   http://localhost:5100${NC}"
  echo -e "${BLUE}📍 OpenClaw:     http://localhost:18789${NC}"
fi
echo -e "${BLUE}📍 Preview:      http://localhost:3000/preview${NC}"
echo -e "${BLUE}📍 Agent:        http://localhost:3000/agent/orbit${NC}"
echo
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"

# ─── Cleanup ────────────────────────────────────────────────────────────
cleanup() {
  echo -e "\n${YELLOW}🛑 Stopping development servers...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  if [ "$DOCKER_AVAILABLE" = true ]; then
    docker compose stop eburon-asr openclaw ollama 2>/dev/null || true
  fi
  echo -e "${GREEN}✅ Stopped${NC}"
  exit 0
}

trap cleanup INT TERM

# ─── Frontend (blocks) ─────────────────────────────────────────────────
npx vite
