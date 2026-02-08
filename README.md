<div align="center">

# Eburon AI — CodeMax Architect

**AI-powered code generation platform with user authentication, persistent conversations, live preview, and Orbit Model cloud integration.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_USERNAME%2Fcoding-eburonmaw&env=DATABASE_URL,JWT_SECRET,VITE_OLLAMA_CLOUD_URL,VITE_OLLAMA_API_KEY&envDescription=Required%20environment%20variables&project-name=codemax-architect)

</div>

---

## Deploy to Vercel (Recommended)

### 1. Set up a PostgreSQL database

Use any hosted PostgreSQL provider:

- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)
- [Neon](https://neon.tech) (free tier available)
- [Supabase](https://supabase.com) (free tier available)

Run the schema against your database:

```bash
psql "YOUR_DATABASE_URL" -f backend/db/init.sql
```

### 2. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or click the **Deploy with Vercel** button above.

### 3. Set environment variables

In Vercel → Project → Settings → Environment Variables:

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname?sslmode=require` | Yes |
| `JWT_SECRET` | Any strong random string | Yes |
| `VITE_OLLAMA_CLOUD_URL` | `https://api.ollama.com` | No |
| `VITE_OLLAMA_API_KEY` | Your Orbit Cloud API key | No |

> `VITE_OLLAMA_CLOUD_URL` and `VITE_OLLAMA_API_KEY` can also be configured per-user in the app's profile settings.

### 4. Done

Your app is live at `https://your-project.vercel.app`

- **App** — `https://your-project.vercel.app`
- **Preview** — `https://your-project.vercel.app/preview`
- **API** — `https://your-project.vercel.app/api/health`

---

## Deploy with Docker (Self-hosted)

> **Prerequisites:** [Docker](https://docs.docker.com/get-docker/) must be installed and running.

```bash
chmod +x deploy.sh && ./deploy.sh
```

The script handles everything:

- Preflight checks (Docker, ports, environment)
- Creates `.env.local` if missing
- Builds and starts all services (PostgreSQL, Backend API, Frontend)
- Runs health checks and prints access URLs

### After Deploy

| Service | URL |
|---|---|
| **App** | `http://localhost:8080` |
| **Preview** | `http://localhost:8080/preview` |
| **API** | `http://localhost:4000/api/health` |

### Manage

```bash
docker compose down              # Stop
docker compose logs -f           # Logs
./deploy.sh                      # Restart
docker compose down -v           # Wipe DB & restart
```

---

## Architecture

```text
┌──────────┐     ┌──────────────┐     ┌────────────┐
│ Frontend │────▶│ Nginx/Vercel │────▶│  Backend   │
│  (React) │     │   Routing    │     │ (Express)  │
└──────────┘     └──────────────┘     └─────┬──────┘
                                            │
                                      ┌─────▼──────┐
                                      │ PostgreSQL  │
                                      └────────────┘
```

- **Frontend** — React + Vite (Vercel static / Nginx in Docker)
- **Backend** — Express (Vercel serverless function / Docker container)
- **Database** — PostgreSQL with user accounts, conversations, messages, and code creations
- **Auth** — JWT-based email/password registration and login
- **Preview** — Dedicated route at `/preview` to browse generated creations
- **Models** — Auto-detects local Ollama models and aliases them as **CoderMax**

---

## Features

- **User authentication** — email/password register & login with JWT
- **User profiles** — per-user Orbit Cloud URL, API key, and local endpoint config
- **Persistent conversations** — all chats and creations saved to PostgreSQL
- **Auto-detect models** — local Ollama models detected on load, shown as CoderMax aliases
- **Live preview** — `/preview` route with desktop/tablet/phone viewport switcher
- **Dark mode** — consistent dark theme with localStorage persistence

---

## Local Development

```bash
npm install
npm run dev          # Frontend on http://localhost:3000

# In a separate terminal:
cd backend && npm install && npm run dev   # API on http://localhost:4000
```

> Requires a running PostgreSQL instance. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` env vars for the backend.
