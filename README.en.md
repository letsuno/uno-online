<p align="center">
  <img src="packages/client/public/favicon.svg" width="120" alt="UNO Online Logo" />
</p>

<h1 align="center">UNO Online</h1>

<p align="center">
  <a href="https://github.com/letsuno/uno-online"><img src="https://img.shields.io/github/license/letsuno/uno-online" alt="License" /></a>
</p>

<p align="center"><a href="README.md">中文文档</a></p>

Web-based multiplayer UNO with real-time play, voice chat, spectator mode, configurable house rules, and MCP support for AI clients.

## Highlights

- 2-10 players per room, invite by 6-character room code
- Complete UNO gameplay: action cards, challenges, scoring, and multi-round games
- 34 configurable house rules with Classic, Party, and Crazy presets
- Socket.IO authoritative server with responsive client-side feedback
- Mumble-based voice chat with per-player mute and speaking indicators
- Server selector, admin panel, spectator mode, color-blind mode, sound, and animations
- MCP server so AI clients can join and play via tools

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Zustand
- **Backend**: Fastify, Socket.IO, TypeScript
- **Shared logic**: pure TypeScript rules engine in `packages/shared`
- **Storage**: SQLite via Kysely; Redis is optional with in-memory fallback
- **Voice**: Mumble + mumble-web-gateway
- **Deployment**: Docker + Caddy
- **Monorepo**: pnpm workspaces

## Project Layout

```text
packages/
  shared/  # rules engine, types, constants
  server/  # Fastify + Socket.IO + SQLite
  client/  # player web app
  admin/   # admin web app
  mcp/     # MCP server for AI clients
```

## Quick Start

Requirements:

- Node.js 22+
- pnpm 10+

```bash
git clone https://github.com/letsuno/uno-online.git
cd uno-online
corepack enable && corepack prepare pnpm@10.11.0 --activate
pnpm install
cp .env.example .env
```

Run the apps in separate terminals:

```bash
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev
pnpm --filter client dev
pnpm --filter admin dev
```

- Client: `http://localhost:5173`
- Admin: `http://localhost:5174`
- Server: `http://localhost:3001`

With `DEV_MODE=true`, GitHub OAuth is bypassed and any username can log in.

## Common Commands

```bash
pnpm test
pnpm --filter shared test
pnpm --filter shared build
pnpm --filter server exec tsc --noEmit
pnpm --filter client exec tsc --noEmit
```

## More Documentation

- [Backend development guide](docs/backend-development-guide.md)
- [Frontend development guide](docs/frontend-development-guide.md)
- [Plugin extension guide](docs/plugin-extension-guide.md)
- [House rules extension guide](docs/house-rules-extension-guide.md)
- [Protocol reference](docs/protocol.md)
- [Deployment guide](docs/deployment.md)
- [MCP guide](docs/mcp.md)
- [UI/UX guidelines](UIUX-GUIDELINES.md)

Configuration lives in `.env.example`. HTTP APIs are mounted under `/api`; see the protocol reference for routes and Socket.IO events.

## License

[AGPL-3.0](LICENSE)
