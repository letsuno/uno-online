# UNO Online

Web-based multiplayer UNO card game with voice chat, 32 configurable house rules, and a cartoon visual style.

## Features

- **2-10 players** per room, invite via 6-character room code
- **Complete UNO rules** — all card types, challenge mechanics, scoring, multi-round play
- **32 house rules** — stacking, deflection, jump-in, 0-rotate, 7-swap, elimination, blitz, team mode, and more
- **3 presets** — Classic (standard), Party (common house rules), Crazy (everything on)
- **Voice chat** — mediasoup SFU, per-player mute, speaking indicators
- **Real-time** — Socket.IO with authoritative server, client-side prediction
- **Animations** — Framer Motion card animations, game effects, confetti
- **Sound effects** — Web Audio API synthesizer (no audio files)
- **Color-blind mode** — pattern overlays + symbol markers on cards
- **Mobile responsive** — touch-optimized hand scrolling, adaptive layout
- **GitHub OAuth** login

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| State | Zustand |
| Animation | Framer Motion + CSS |
| Backend | Fastify, TypeScript |
| Realtime | Socket.IO |
| Voice | mediasoup (SFU) |
| Database | PostgreSQL (Prisma ORM) |
| Cache | Redis |
| Auth | GitHub OAuth + JWT |
| Monorepo | pnpm workspaces |

## Project Structure

```
uno-online/
├── packages/
│   ├── shared/          # Rules engine, types, constants (pure logic, no I/O)
│   ├── server/          # Fastify + Socket.IO + mediasoup + Prisma
│   └── client/          # React SPA (Vite)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL
- Redis
- GitHub OAuth App (for login)

## Setup

```bash
# Clone and install
git clone <repo-url> && cd uno-online
corepack enable && corepack prepare pnpm@10.11.0 --activate
pnpm install

# Configure environment
cp packages/server/.env.example packages/server/.env
# Edit .env with your database URL, Redis URL, GitHub OAuth credentials, and JWT secret

# Setup database
cd packages/server
npx prisma generate
npx prisma db push
```

## Development

```bash
# Start server (watches for changes)
cd packages/server && pnpm dev

# Start client (in another terminal)
cd packages/client && pnpm dev
```

The client runs on `http://localhost:5173` and proxies API requests to `http://localhost:3001`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | (required) |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID | (required) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app secret | (required) |
| `JWT_SECRET` | JWT signing secret (32+ chars) | (required) |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `PORT` | Server port | `3001` |

## Testing

```bash
# Run all tests
pnpm test

# Run shared package tests only (170 tests — rules engine)
cd packages/shared && pnpm test

# Run server tests only (48 tests — auth, rooms, game session, timers, voice)
cd packages/server && pnpm test
```

## Build

```bash
# Build all packages
pnpm build

# Build client only
cd packages/client && pnpm build
```

## Architecture

### Rules Engine (`packages/shared`)

Pure function design: `applyAction(state, action) => newState`. No I/O, fully unit-testable. Used by both client (playability hints) and server (authoritative validation).

House rules wrap the core engine: `applyActionWithHouseRules(state, action) => newState`.

### Server (`packages/server`)

- **Authoritative game state** — clients predict for responsiveness, server validates all actions
- **Game state in Redis** — ephemeral, 1-hour TTL, results persisted to PostgreSQL on game end
- **Turn timer** — configurable (15/30/60s), auto draw+pass on timeout
- **Disconnect handling** — 60s reconnect window, then auto-play every 5s
- **Rate limiting** — 20 messages/second per socket
- **Multi-tab protection** — new connection kicks old one

### Client (`packages/client`)

- **Zustand stores** — auth, room, game, settings
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
