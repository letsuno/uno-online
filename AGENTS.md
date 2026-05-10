## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port |
|---------|---------|------|
| Backend | `DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev` | 3001 |
| Frontend | `pnpm --filter client dev` | 5173 |
| Admin | `pnpm --filter admin dev` | 5174 |

See `CLAUDE.md` and `README.md` for full docs, commands, and architecture details.

### Key dev notes

- Repository: `https://github.com/letsuno/uno-online`
- All API routes are registered under `/api` prefix (e.g. `/api/health`, `/api/auth/login`, `/api/server/info`).
- `DEV_MODE=true` bypasses GitHub OAuth — login with any username. `JWT_SECRET` env var is **required**.
- Redis is **optional**; the server falls back to an in-memory KV store. Without Redis, some server tests (`room-store`, `room-manager`, `game-store`) will fail — this is expected. Core game-engine and auth tests pass without Redis.
- SQLite uses Node.js 22 built-in `node:sqlite` (zero native deps). Database tables are auto-created on startup.
- The Vite dev server proxies `/api`, `/auth`, `/profile`, `/health`, `/server`, `/socket.io` to `localhost:3001`. The `/api` proxy must **not** rewrite the path (the server expects the `/api` prefix).
- `pnpm test` runs vitest across all packages. `pnpm --filter shared test` is the fastest validation (pure logic, no IO deps).
