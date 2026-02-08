#!/bin/bash
set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Eburon AI — Production Deployment${NC}"
echo

# ── Auto-start Docker if not running ──────────────────────────
if ! docker info >/dev/null 2>&1; then
  echo -e "${YELLOW}🐳 Docker is not running. Starting Docker Desktop...${NC}"
  open -a Docker 2>/dev/null || true
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
else
  echo -e "${GREEN}✅ Docker is already running${NC}"
fi

# ── Stop any existing containers to avoid conflicts ───────────
echo -e "${YELLOW}🔄 Stopping any existing containers...${NC}"
docker compose down --remove-orphans 2>/dev/null || true
echo -e "${GREEN}✅ Clean slate${NC}"

# ── Build and start all services ──────────────────────────────
echo -e "${YELLOW}🔨 Building and starting all production services...${NC}"
docker compose up --build -d

# ── Wait for health checks ───────────────────────────────────
echo -e "${YELLOW}⏳ Waiting for PostgreSQL...${NC}"
retries=0
until docker compose exec -T db pg_isready -U codemax >/dev/null 2>&1; do
  sleep 2
  retries=$((retries + 1))
  if [ $retries -ge 30 ]; then
    echo -e "${RED}❌ PostgreSQL did not become ready.${NC}"
    docker compose logs db
    exit 1
  fi
done
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

echo -e "${YELLOW}⏳ Waiting for backend API...${NC}"
retries=0
until curl -sf http://localhost:4000/api/health >/dev/null 2>&1; do
  sleep 2
  retries=$((retries + 1))
  if [ $retries -ge 30 ]; then
    echo -e "${RED}❌ Backend did not become ready.${NC}"
    docker compose logs backend
    exit 1
  fi
done
echo -e "${GREEN}✅ Backend API is ready${NC}"

echo -e "${YELLOW}⏳ Waiting for frontend...${NC}"
retries=0
until curl -sf http://localhost:8080 >/dev/null 2>&1; do
  sleep 2
  retries=$((retries + 1))
  if [ $retries -ge 30 ]; then
    echo -e "${RED}❌ Frontend did not become ready.${NC}"
    docker compose logs frontend
    exit 1
  fi
done
echo -e "${GREEN}✅ Frontend is ready${NC}"

# ── Done ─────────────────────────────────────────────────────
echo
echo -e "${GREEN}🎉 Production deployment is live!${NC}"
echo -e "${BLUE}📍 App:       http://localhost:8080${NC}"
echo -e "${BLUE}📍 Backend:   http://localhost:4000${NC}"
echo -e "${BLUE}📍 Ollama:    http://localhost:11434${NC}"
echo
echo -e "${YELLOW}Run 'docker compose logs -f' to view logs${NC}"
echo -e "${YELLOW}Run 'docker compose down' to stop${NC}"
