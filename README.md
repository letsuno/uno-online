# UNO Online

[中文文档](README.zh-CN.md)

Web-based multiplayer UNO card game with voice chat, 32 configurable house rules, server selector, and a cartoon visual style.

## Features

- **2-10 players** per room, invite via 6-character room code
- **Complete UNO rules** — all card types, challenge mechanics, scoring, multi-round play
- **32 house rules** — stacking, deflection, jump-in, 0-rotate, 7-swap, elimination, blitz, team mode, and more
- **3 presets** — Classic (standard), Party (common house rules), Crazy (everything on)
- **Server selector** — browse and switch between servers, view real-time status (players, rooms, latency), add custom servers
- **Voice chat** — mediasoup SFU, per-player mute, speaking indicators
- **Real-time** — Socket.IO with authoritative server, client-side prediction
- **Animations** — Framer Motion card animations, game effects, confetti
- **Sound effects** — Web Audio API synthesizer (no audio files)
- **Color-blind mode** — pattern overlays + symbol markers on cards
- **Mobile responsive** — touch-optimized hand scrolling, adaptive layout
- **Admin panel** — user management, room monitoring, dashboard stats
- **GitHub OAuth** + password login

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4 |
| State | Zustand |
| Animation | Framer Motion + CSS |
| Backend | Fastify, TypeScript |
| Realtime | Socket.IO |
| Voice | mediasoup (SFU) |
| Database | SQLite (Kysely) |
| Cache | Redis (optional, in-memory fallback) |
| Auth | GitHub OAuth + password + JWT |
| Deployment | Docker + Caddy (auto-SSL) |
| Monorepo | pnpm workspaces |

## Project Structure

```
uno-online/
├── packages/
│   ├── shared/          # Rules engine, types, constants (pure logic, no I/O)
│   ├── server/          # Fastify + Socket.IO + mediasoup + SQLite
│   ├── client/          # React SPA (Vite + Tailwind CSS v4)
│   └── admin/           # Admin panel (React + Vite)
├── Dockerfile
├── docker-compose.yml
├── Caddyfile
└── tsconfig.base.json
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- GitHub OAuth App (for production login, optional in dev mode)

## Setup

```bash
# Clone and install
git clone <repo-url> && cd uno-online
corepack enable && corepack prepare pnpm@10.11.0 --activate
pnpm install

# Configure environment
cp .env.example .env
# Edit .env as needed (DEV_MODE=true works without GitHub OAuth)
```

## Development

```bash
# Start server (hot-reload)
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev

# Start client (another terminal)
pnpm --filter client dev

# Start admin panel (another terminal)
pnpm --filter admin dev
```

- Client: `http://localhost:5173`
- Admin: `http://localhost:5174`
- Server: `http://localhost:3001`

In dev mode, login with any username — no GitHub OAuth required.

## Docker Deployment

```bash
# 1. Copy and edit config
cp .env.example .env
# Edit .env — set DOMAIN, GitHub OAuth credentials, JWT_SECRET

# 2. Build and start
docker compose up -d --build

# 3. Verify
curl http://localhost/api/health
curl http://localhost/api/server/info
```

### Build Docker Images Manually

```bash
# Build server runtime image with publish tag
docker build --target server -t djkcyl/uno-online-server:latest .

# Build caddy image (client + admin static assets) with publish tag
docker build --target caddy -t djkcyl/uno-online-caddy:latest .
```

Force rebuild without cache:

```bash
docker build --no-cache --target server -t djkcyl/uno-online-server:latest .
docker build --no-cache --target caddy -t djkcyl/uno-online-caddy:latest .
```

### Push Images to Docker Hub

```bash
# Push to Docker Hub
docker push djkcyl/uno-online-server:latest
docker push djkcyl/uno-online-caddy:latest
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEV_MODE` | Skip GitHub OAuth, enable dev login | `true` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | (required) |
| `DATABASE_PATH` | SQLite database file path | `uno.db` |
| `REDIS_URL` | Redis connection string (optional) | in-memory fallback |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID | (required in prod) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app secret | (required in prod) |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `DOMAIN` | Production domain for Caddy auto-SSL | `localhost` |
| `PORT` | Server port | `3001` |
| `ROOM_IDLE_TIMEOUT_MS` | Auto-dissolve rooms after this many ms without activity | `7200000` |
| `SERVER_NAME` | Server display name (shown in server selector) | `UNO Online` |
| `SERVER_MOTD` | Server welcome message | `欢迎来到 UNO Online！` |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/server/info` | No | Server status (name, version, MOTD, online players, rooms, uptime) |
| `GET` | `/api/health` | No | Health check |
| `GET` | `/api/auth/config` | No | Auth configuration (dev mode, GitHub client ID) |
| `POST` | `/api/auth/login` | No | Password login |
| `POST` | `/api/auth/register` | No | Register new account |
| `GET` | `/api/auth/me` | Yes | Current user info |

## Testing

```bash
# Run all tests
pnpm test

# Shared package tests (rules engine)
pnpm --filter shared test

# Type-check
pnpm --filter server exec tsc --noEmit
pnpm --filter client exec tsc --noEmit
```

## Architecture

### Rules Engine (`packages/shared`)

Pure function design: `applyAction(state, action) => newState`. No I/O, fully unit-testable. Used by both client (playability hints) and server (authoritative validation).

House rules wrap the core engine: `applyActionWithHouseRules(state, action) => newState`.

### Server (`packages/server`)

- **Plugin architecture** — all features organized as Fastify plugins with shared `PluginContext`
- **Authoritative game state** — clients predict for responsiveness, server validates all actions
- **Game state in KV store** — Redis or in-memory fallback, results persisted to SQLite on game end
- **Server info endpoint** — `GET /api/server/info` returns real-time status with CORS support for cross-server querying
- **Turn timer** — configurable (15/30/60s), auto draw+pass on timeout
- **Disconnect handling** — 60s reconnect window, then auto-play every 5s
- **Rate limiting** — 20 messages/second per socket

### Client (`packages/client`)

- **Feature module architecture** — auth, game, lobby, profile as independent feature modules
- **Zustand stores** — auth, room, game, settings, server (with localStorage persistence)
- **Server selector** — switch between servers with real-time status display, latency measurement (3x HTTP RTT average)
- **Socket.IO** — auto-reconnect (5 attempts, exponential backoff), auto-rejoin room on reconnect
- **Voice** — mediasoup-client with transport reconnect, browser capability detection
- **Sound** — Web Audio API oscillator-based synthesizer, 13 sound effects

## House Rules (32)

| Category | Rules |
|----------|-------|
| Stacking | +2 stack, +4 stack, cross-stack (+2/+4 interchangeable) |
| Deflection | Reverse deflects +2/+4, Skip deflects penalties |
| Card rules | 0-rotate hands, 7-swap hands, jump-in, multi-play same number, wild first turn |
| Draw rules | Draw until playable, forced play after draw |
| Hand rules | Hand limit (15/20/25), forced play, hand reveal threshold |
| Penalties | Custom UNO penalty (2/4/6), misplay penalty |
| Pacing | Death draw, fast mode, no hints |
| Game modes | Elimination, blitz (timed), revenge mode |
| Social | Silent UNO, team mode (2v2/3v3) |
| End rules | No wild finish, no function card finish, double score |
| Fun | No challenge +4, blind draw, bomb card |

## License

Private project.
