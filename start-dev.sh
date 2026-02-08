#!/bin/bash
set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 CodeMax Architect — Local Development Bootstrap${NC}"
echo

# Check if Docker is running — auto-start if not
if ! docker info >/dev/null 2>&1; then
  echo -e "${YELLOW}🐳 Docker is not running. Starting Docker Desktop...${NC}"
  open -a Docker
  echo -e "${YELLOW}⏳ Waiting for Docker to be ready...${NC}"
  retries=0
  until docker info >/dev/null 2>&1; do
    sleep 2
    retries=$((retries + 1))
    if [ $retries -ge 60 ]; then
      echo -e "${RED}❌ Docker did not start after 2 minutes. Please start it manually.${NC}"
      exit 1
    fi
  done
  echo -e "${GREEN}✅ Docker is running${NC}"
fi

# Start PostgreSQL if not running
if ! docker compose ps db | grep -q "Up"; then
  echo -e "${YELLOW}📦 Starting PostgreSQL container...${NC}"
  docker compose up db -d
  echo -e "${GREEN}✅ PostgreSQL started${NC}"
else
  echo -e "${GREEN}✅ PostgreSQL already running${NC}"
fi

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
until docker compose exec -T db pg_isready -U codemax >/dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Start Ollama if not running
if ! docker compose ps ollama | grep -q "Up"; then
  echo -e "${YELLOW}🤖 Starting Ollama container...${NC}"
  docker compose up ollama -d
  echo -e "${GREEN}✅ Ollama started${NC}"
else
  echo -e "${GREEN}✅ Ollama already running${NC}"
fi

# Pull model in background
echo -e "${YELLOW}📥 Pulling kimi-k2-thinking:cloud model (background)...${NC}"
docker compose up ollama-pull -d 2>/dev/null || true

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
  npm install
fi

if [ ! -d "backend/node_modules" ]; then
  echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
  (cd backend && npm install)
fi

# Start backend in background
echo -e "${YELLOW}🔧 Starting backend API...${NC}"
# Load backend env if it exists
if [ -f "backend/.env" ]; then
  set -a; source backend/.env; set +a
fi
(cd backend && npm run dev > ../backend.log 2>&1) &
BACKEND_PID=$!

# Wait for backend to be ready
echo -e "${YELLOW}⏳ Waiting for backend API...${NC}"
until curl -s http://localhost:4000/api/health >/dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✅ Backend API ready at http://localhost:4000${NC}"

# Start frontend in foreground
echo -e "${YELLOW}🎨 Starting frontend dev server...${NC}"
echo
echo -e "${GREEN}🎉 Development environment is ready!${NC}"
echo -e "${BLUE}📍 Frontend:  http://localhost:3000${NC}"
echo -e "${BLUE}📍 Backend:   http://localhost:4000${NC}"
echo -e "${BLUE}📍 Ollama:    http://localhost:11434${NC}"
echo -e "${BLUE}📍 Preview:   http://localhost:3000/preview${NC}"
echo
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"

# Cleanup function
cleanup() {
  echo -e "\n${YELLOW}🛑 Stopping development servers...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  docker compose down
  echo -e "${GREEN}✅ Stopped${NC}"
  exit 0
}

# Trap Ctrl+C
trap cleanup INT

# Start frontend (this will block)
npx vite
