# Phase 1: Plugin Architecture Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the UNO Online server into Fastify plugins and the client into feature modules, enabling independent development and lazy loading of future features.

**Architecture:** Server code moves from flat imperative wiring to Fastify `register()` plugins, each with its own routes, WS events, and migrations. Client code moves from a flat `pages/components/stores` layout to `features/` directories, each exporting its own routes. A `PluginContext` carries shared dependencies (db, kv, io, config) to all server plugins.

**Tech Stack:** Fastify 5 (native plugin system via `fastify-plugin`), React Router 7 (`RouteObject[]`), React.lazy for code splitting, Zustand (unchanged), Kysely (unchanged).

---

## Pre-requisites

Install `fastify-plugin`:
```bash
pnpm --filter server add fastify-plugin
```

## File Structure

### Server — New/Modified Files

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/plugin-context.ts` | `PluginContext` interface definition |
| Create | `src/plugins/core/auth/index.ts` | Auth Fastify plugin entry |
| Create | `src/plugins/core/auth/routes.ts` | All `/auth/*` HTTP routes |
| Create | `src/plugins/core/auth/service.ts` | `userResponse`, `makeToken`, `authPreHandler` |
| Create | `src/plugins/core/profile/index.ts` | Profile Fastify plugin entry |
| Create | `src/plugins/core/profile/routes.ts` | All `/profile/*` and `/avatar/*` HTTP routes |
| Create | `src/plugins/core/room/index.ts` | Room Fastify plugin entry |
| Create | `src/plugins/core/room/ws.ts` | Room WS event handlers |
| Move | `src/room/room-store.ts` → `src/plugins/core/room/store.ts` | Room KV store operations |
| Move | `src/room/room-manager.ts` → `src/plugins/core/room/manager.ts` | Room lifecycle |
| Create | `src/plugins/core/game/index.ts` | Game Fastify plugin entry |
| Create | `src/plugins/core/game/ws.ts` | Game WS event handlers |
| Move | `src/game/game-session.ts` → `src/plugins/core/game/session.ts` | Game session class |
| Move | `src/game/game-store.ts` → `src/plugins/core/game/state-store.ts` | Game state KV persistence |
| Move | `src/game/turn-timer.ts` → `src/plugins/core/game/turn-timer.ts` | Turn timer |
| Create | `src/plugins/core/game/shared-state.ts` | Shared mutable state: sessions Map, auto-play, turn timer |
| Create | `src/plugins/core/voice/index.ts` | Voice Fastify plugin entry |
| Move | `src/voice/*` → `src/plugins/core/voice/` | Voice media worker, room voice, events |
| Create | `src/plugins/core/interaction/index.ts` | Interaction Fastify plugin entry |
| Move | `src/ws/interaction-events.ts` → `src/plugins/core/interaction/ws.ts` | Throw item events |
| Create | `src/plugin-loader.ts` | Registers all plugins in order |
| Modify | `src/app.ts` | Simplified to create Fastify + PluginContext, delegate to loader |
| Modify | `src/index.ts` | Minor: adjust imports |
| Delete | `src/redis/client.ts` | Dead code |
| Delete | `src/ws/socket-handler.ts` | Logic distributed to plugins |
| Modify | `src/ws/rate-limiter.ts` | Keep in place (utility, not a plugin) |

### Client — New/Modified Files

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/features/auth/routes.tsx` | Auth feature route definitions |
| Move | `src/pages/HomePage.tsx` → `src/features/auth/pages/HomePage.tsx` | |
| Move | `src/pages/RegisterPage.tsx` → `src/features/auth/pages/RegisterPage.tsx` | |
| Move | `src/pages/AuthCallback.tsx` → `src/features/auth/pages/AuthCallback.tsx` | |
| Move | `src/pages/ProfileSetupPage.tsx` → `src/features/auth/pages/ProfileSetupPage.tsx` | |
| Move | `src/stores/auth-store.ts` → `src/features/auth/stores/auth-store.ts` | |
| Move | `src/components/AvatarUpload.tsx` → `src/features/auth/components/AvatarUpload.tsx` | |
| Create | `src/features/game/routes.tsx` | Game feature route definitions |
| Move | `src/pages/GamePage.tsx` → `src/features/game/pages/GamePage.tsx` | |
| Move | `src/pages/RoomPage.tsx` → `src/features/game/pages/RoomPage.tsx` | |
| Move | `src/stores/game-store.ts` → `src/features/game/stores/game-store.ts` | |
| Move | `src/stores/game-log-store.ts` → `src/features/game/stores/game-log-store.ts` | |
| Move | `src/components/GameTable.tsx` → `src/features/game/components/GameTable.tsx` | |
| Move | `src/components/PlayerNode.tsx` → `src/features/game/components/PlayerNode.tsx` | |
| Move | `src/components/PlayerHand.tsx` → `src/features/game/components/PlayerHand.tsx` | |
| Move | `src/components/Card.tsx` → `src/features/game/components/Card.tsx` | |
| Move | `src/components/AnimatedCard.tsx` → `src/features/game/components/AnimatedCard.tsx` | |
| Move | `src/components/CardBack.tsx` → `src/features/game/components/CardBack.tsx` | |
| Move | `src/components/GameActions.tsx` → `src/features/game/components/GameActions.tsx` | |
| Move | `src/components/GameEffects.tsx` → `src/features/game/components/GameEffects.tsx` | |
| Move | `src/components/DrawPile.tsx` → `src/features/game/components/DrawPile.tsx` | |
| Move | `src/components/DiscardPile.tsx` → `src/features/game/components/DiscardPile.tsx` | |
| Move | `src/components/DrawCardAnimation.tsx` → `src/features/game/components/DrawCardAnimation.tsx` | |
| Move | `src/components/ChatBox.tsx` → `src/features/game/components/ChatBox.tsx` | |
| Move | `src/components/ChatBubble.tsx` → `src/features/game/components/ChatBubble.tsx` | |
| Move | `src/components/ColorPicker.tsx` → `src/features/game/components/ColorPicker.tsx` | |
| Move | `src/components/ColorBlindOverlay.tsx` → `src/features/game/components/ColorBlindOverlay.tsx` | |
| Move | `src/components/Confetti.tsx` → `src/features/game/components/Confetti.tsx` | |
| Move | `src/components/CountdownRing.tsx` → `src/features/game/components/CountdownRing.tsx` | |
| Move | `src/components/HouseRulesPanel.tsx` → `src/features/game/components/HouseRulesPanel.tsx` | |
| Move | `src/components/HouseRulesCard.tsx` → `src/features/game/components/HouseRulesCard.tsx` | |
| Move | `src/components/RuleTeaching.tsx` → `src/features/game/components/RuleTeaching.tsx` | |
| Move | `src/components/GameLog.tsx` → `src/features/game/components/GameLog.tsx` | |
| Move | `src/components/GameLogEntry.tsx` → `src/features/game/components/GameLogEntry.tsx` | |
| Move | `src/components/TopBar.tsx` → `src/features/game/components/TopBar.tsx` | |
| Move | `src/components/TurnTimer.tsx` → `src/features/game/components/TurnTimer.tsx` | |
| Move | `src/components/ScoreBoard.tsx` → `src/features/game/components/ScoreBoard.tsx` | |
| Move | `src/components/QuickReaction.tsx` → `src/features/game/components/QuickReaction.tsx` | |
| Move | `src/components/ThrowItemPicker.tsx` → `src/features/game/components/ThrowItemPicker.tsx` | |
| Move | `src/components/ThrowAnimation.tsx` → `src/features/game/components/ThrowAnimation.tsx` | |
| Move | `src/components/MobileFAB.tsx` → `src/features/game/components/MobileFAB.tsx` | |
| Move | `src/components/BottomSheet.tsx` → `src/features/game/components/BottomSheet.tsx` | |
| Move | `src/components/UnoCallEffect.tsx` → `src/features/game/components/UnoCallEffect.tsx` | |
| Create | `src/features/lobby/routes.tsx` | Lobby feature route definitions |
| Move | `src/pages/LobbyPage.tsx` → `src/features/lobby/pages/LobbyPage.tsx` | |
| Create | `src/features/profile/routes.tsx` | Profile feature route definitions |
| Move | `src/pages/ProfilePage.tsx` → `src/features/profile/pages/ProfilePage.tsx` | |
| Keep | `src/shared/components/ui/Button.tsx` | Move from `src/components/ui/` |
| Keep | `src/shared/components/ui/GoogleRing.tsx` | Move from `src/components/ui/` |
| Keep | `src/shared/components/Toast.tsx` | Move from `src/components/` |
| Keep | `src/shared/components/ProtectedRoute.tsx` | Move from `src/components/` |
| Keep | `src/shared/lib/utils.ts` | Move from `src/lib/` |
| Keep | `src/shared/stores/toast-store.ts` | Move from `src/stores/` |
| Keep | `src/shared/stores/settings-store.ts` | Move from `src/stores/` |
| Keep | `src/shared/stores/room-store.ts` | Move from `src/stores/` |
| Keep | `src/shared/api.ts` | Move from `src/` |
| Keep | `src/shared/socket.ts` | Move from `src/` |
| Keep | `src/shared/env.ts` | Move from `src/` |
| Keep | `src/shared/sound/sound-manager.ts` | Move from `src/sound/` |
| Keep | `src/shared/voice/` | Move from `src/voice/` |
| Keep | `src/shared/utils/` | Move from `src/utils/` |
| Modify | `src/App.tsx` → `src/app/App.tsx` | Simplified: imports feature routes |
| Modify | `src/main.tsx` → `src/app/main.tsx` | Adjust import path |
| Create | `src/app/router.tsx` | Assembles all feature routes |
| Delete | `src/components/DirectionIndicator.tsx` | Dead code (unused) |
| Delete | `src/components/OpponentRow.tsx` | Dead code (unused) |

---

## Task Breakdown

### Task 1: Server — Create PluginContext and plugin-loader infrastructure

**Files:**
- Create: `packages/server/src/plugin-context.ts`
- Create: `packages/server/src/plugin-loader.ts`

- [ ] **Step 1: Install fastify-plugin**

```bash
pnpm --filter server add fastify-plugin
```

- [ ] **Step 2: Create PluginContext interface**

Create `packages/server/src/plugin-context.ts`:

```typescript
import type { Kysely } from 'kysely';
import type { Server as SocketIOServer } from 'socket.io';
import type { Database } from './db/database';
import type { KvStore } from './kv/types';
import type { Config } from './config';

export interface PluginContext {
  db: Kysely<Database>;
  kv: KvStore;
  io: SocketIOServer;
  config: Config;
}
```

- [ ] **Step 3: Create plugin-loader skeleton**

Create `packages/server/src/plugin-loader.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  // Core plugins will be registered here as they are migrated
  // await fastify.register(authPlugin, { ctx });
}
```

- [ ] **Step 4: Verify compilation**

```bash
pnpm --filter server exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/plugin-context.ts packages/server/src/plugin-loader.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat(server): add PluginContext and plugin-loader infrastructure"
```

---

### Task 2: Server — Migrate auth to plugin

**Files:**
- Create: `packages/server/src/plugins/core/auth/index.ts`
- Create: `packages/server/src/plugins/core/auth/routes.ts`
- Create: `packages/server/src/plugins/core/auth/service.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/plugin-loader.ts`
- Source: `packages/server/src/api/auth-routes.ts` (199 lines — will be deleted after migration)

- [ ] **Step 1: Create auth service with shared helpers**

Create `packages/server/src/plugins/core/auth/service.ts` extracting `userResponse`, `makeToken`, `authPreHandler` from `auth-routes.ts`:

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { signToken, verifyToken } from '../../../auth/jwt';
import type { TokenPayload } from '../../../auth/jwt';
import type { UserRole } from '@uno-online/shared';
import { resolveAvatar } from '../../../db/user-repo';

export interface AuthenticatedRequest extends FastifyRequest {
  user: TokenPayload;
}

export function userResponse(user: { id: string; username: string; nickname: string; avatarUrl: string | null; avatarData?: string | null; role?: string }) {
  return { id: user.id, username: user.username, nickname: user.nickname, avatarUrl: resolveAvatar(user), role: user.role ?? 'normal' };
}

export function makeToken(user: { id: string; username: string; nickname: string; avatarUrl: string | null; avatarData?: string | null; role?: string }, secret: string) {
  return signToken({ userId: user.id, username: user.username, nickname: user.nickname, avatarUrl: resolveAvatar(user), role: (user.role ?? 'normal') as UserRole }, secret);
}

export const authPreHandler = (jwtSecret: string) => async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  const payload = verifyToken(authHeader.slice(7), jwtSecret);
  if (!payload) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
  (request as AuthenticatedRequest).user = payload;
};
```

- [ ] **Step 2: Create auth routes**

Create `packages/server/src/plugins/core/auth/routes.ts` — copy the body of `registerAuthRoutes`, `registerDevRoutes`, and `registerProductionRoutes` from `auth-routes.ts`. Change all local function references (`userResponse`, `makeToken`, `authPreHandler`) to import from `./service`. Keep the same route paths and logic. Use `PluginContext` for config access:

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { exchangeCodeForToken, fetchGitHubUser } from '../../../auth/github';
import { signToken } from '../../../auth/jwt';
import { findOrCreateUser, findUserByUsername, createLocalUser, isUsernameTaken, setPassword, bindGithub, getUserById } from '../../../db/user-repo';
import { hashPassword, verifyPassword } from '../../../auth/password';
import { validateUsername, validatePassword, validateNickname } from '../../../auth/validation';
import { userResponse, makeToken, authPreHandler, type AuthenticatedRequest } from './service';

export async function registerAuthRoutes(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  const { config } = ctx;

  fastify.get('/auth/config', async () => ({
    devMode: config.devMode,
    githubClientId: config.githubClientId,
  }));

  if (config.devMode) {
    registerDevRoutes(fastify, config);
    return;
  }

  registerProductionRoutes(fastify, config);
}

// Copy registerDevRoutes and registerProductionRoutes functions from
// packages/server/src/api/auth-routes.ts verbatim, keeping all route handlers.
// Only change: replace `config.jwtSecret` references that came from the
// function param with the same param (the function still receives config).
function registerDevRoutes(fastify: FastifyInstance, config: PluginContext['config']) {
  // ... exact copy of existing registerDevRoutes body from auth-routes.ts lines 50-67
}

function registerProductionRoutes(fastify: FastifyInstance, config: PluginContext['config']) {
  // ... exact copy of existing registerProductionRoutes body from auth-routes.ts lines 71-198
}
```

- [ ] **Step 3: Create auth plugin entry**

Create `packages/server/src/plugins/core/auth/index.ts`:

```typescript
import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerAuthRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  await registerAuthRoutes(fastify, opts.ctx);
});
```

- [ ] **Step 4: Register auth plugin in loader**

Update `packages/server/src/plugin-loader.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context';
import authPlugin from './plugins/core/auth/index';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  await fastify.register(authPlugin, { ctx });
}
```

- [ ] **Step 5: Update app.ts to use plugin loader**

Modify `packages/server/src/app.ts` — replace the direct `registerAuthRoutes(fastify, config)` call with `loadPlugins(fastify, ctx)`. The full updated file:

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './config';
import { loadPlugins } from './plugin-loader';
import { getDb } from './db/database';
import { setupSocketHandlers } from './ws/socket-handler';
import { createKvStore } from './kv/index';
import type { PluginContext } from './plugin-context';

export async function createApp(config: Config) {
  const fastify = Fastify({ logger: true });
  await fastify.register(cors, { origin: config.clientUrl, credentials: true });
  const io = new SocketIOServer(fastify.server, { cors: { origin: config.clientUrl } });
  const kv = createKvStore(config.redisUrl);

  const ctx: PluginContext = { db: getDb(), kv, io, config };

  // Register all plugins
  await loadPlugins(fastify, ctx);

  // Profile routes (still legacy — will be migrated in next task)
  if (!config.devMode) {
    const { registerProfileRoutes } = await import('./api/profile-routes');
    await registerProfileRoutes(fastify, config);
  }

  // WebSocket handlers (still legacy — will be migrated later)
  const wsContext = setupSocketHandlers(io, kv, config.jwtSecret);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return { fastify, io, kv, ...wsContext };
}
```

- [ ] **Step 6: Verify compilation and tests**

```bash
pnpm --filter server exec tsc --noEmit
pnpm --filter shared test
```

- [ ] **Step 7: Delete old auth-routes.ts**

```bash
rm packages/server/src/api/auth-routes.ts
```

Re-run `pnpm --filter server exec tsc --noEmit` to confirm no remaining references.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(server): migrate auth routes to Fastify plugin"
```

---

### Task 3: Server — Migrate profile to plugin

**Files:**
- Create: `packages/server/src/plugins/core/profile/index.ts`
- Create: `packages/server/src/plugins/core/profile/routes.ts`
- Delete: `packages/server/src/api/profile-routes.ts`
- Modify: `packages/server/src/plugin-loader.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Create profile routes**

Create `packages/server/src/plugins/core/profile/routes.ts` — move the body of `registerProfileRoutes` from `profile-routes.ts`. Replace `createAuthHook(config.jwtSecret)` with `authPreHandler(config.jwtSecret)` imported from the auth service:

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { authPreHandler, type AuthenticatedRequest } from '../auth/service';
import { getUserProfile, getUserById, updateNickname, updateAvatar, updateUsername, resolveAvatar } from '../../../db/user-repo';
import { validateNickname, validateUsername } from '../../../auth/validation';

export async function registerProfileRoutes(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  const { config } = ctx;
  if (config.devMode) return;

  const preHandler = authPreHandler(config.jwtSecret);

  // Copy all route handlers from profile-routes.ts lines 15-90 verbatim
  // (GET /avatar/:userId, GET /profile, PATCH /profile, POST /profile/avatar)
}
```

- [ ] **Step 2: Create profile plugin entry**

Create `packages/server/src/plugins/core/profile/index.ts`:

```typescript
import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerProfileRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  await registerProfileRoutes(fastify, opts.ctx);
});
```

- [ ] **Step 3: Register in loader and clean up app.ts**

Add to `plugin-loader.ts`:
```typescript
import profilePlugin from './plugins/core/profile/index';
// In loadPlugins:
await fastify.register(profilePlugin, { ctx });
```

Remove the legacy profile import block from `app.ts`.

- [ ] **Step 4: Delete old file, verify, commit**

```bash
rm packages/server/src/api/profile-routes.ts
rmdir packages/server/src/api 2>/dev/null || true
pnpm --filter server exec tsc --noEmit
git add -A
git commit -m "refactor(server): migrate profile routes to Fastify plugin"
```

---

### Task 4: Server — Migrate room to plugin

**Files:**
- Create: `packages/server/src/plugins/core/room/index.ts`
- Create: `packages/server/src/plugins/core/room/ws.ts`
- Move: `src/room/room-store.ts` → `src/plugins/core/room/store.ts`
- Move: `src/room/room-manager.ts` → `src/plugins/core/room/manager.ts`
- Modify: `packages/server/src/plugin-loader.ts`

- [ ] **Step 1: Move room-store.ts and room-manager.ts**

```bash
mkdir -p packages/server/src/plugins/core/room
mv packages/server/src/room/room-store.ts packages/server/src/plugins/core/room/store.ts
mv packages/server/src/room/room-manager.ts packages/server/src/plugins/core/room/manager.ts
rmdir packages/server/src/room
```

Update imports in `manager.ts`: change `'./room-store'` to `'./store'`. Update imports in all files that reference `../room/room-store` or `../room/room-manager` to use the new paths.

- [ ] **Step 2: Extract room WS handlers**

Create `packages/server/src/plugins/core/room/ws.ts` — extract `registerRoomEvents`, `startTurnTimer`, `emitGameUpdate` from `ws/room-events.ts`. These are the room-related WebSocket event handlers. Update imports to reference new paths for store and manager.

- [ ] **Step 3: Create room plugin entry**

Create `packages/server/src/plugins/core/room/index.ts`:

```typescript
import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  // Room plugin currently only provides WS events,
  // registered via socket-handler. HTTP routes will be added later.
});
```

- [ ] **Step 4: Register in loader, verify, commit**

```bash
pnpm --filter server exec tsc --noEmit
pnpm --filter shared test
git add -A
git commit -m "refactor(server): migrate room module to plugin structure"
```

---

### Task 5: Server — Migrate game to plugin

**Files:**
- Create: `packages/server/src/plugins/core/game/index.ts`
- Create: `packages/server/src/plugins/core/game/shared-state.ts`
- Move: `src/game/game-session.ts` → `src/plugins/core/game/session.ts`
- Move: `src/game/game-store.ts` → `src/plugins/core/game/state-store.ts`
- Move: `src/game/turn-timer.ts` → `src/plugins/core/game/turn-timer.ts`

- [ ] **Step 1: Move game files**

```bash
mkdir -p packages/server/src/plugins/core/game
mv packages/server/src/game/game-session.ts packages/server/src/plugins/core/game/session.ts
mv packages/server/src/game/game-store.ts packages/server/src/plugins/core/game/state-store.ts
mv packages/server/src/game/turn-timer.ts packages/server/src/plugins/core/game/turn-timer.ts
rmdir packages/server/src/game
```

- [ ] **Step 2: Create shared-state module**

Create `packages/server/src/plugins/core/game/shared-state.ts` — encapsulates the module-level Maps currently scattered across `socket-handler.ts` and `game-events.ts`:

```typescript
import type { GameSession } from './session';

export const sessions = new Map<string, GameSession>();
export const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const autoPlayIntervals = new Map<string, ReturnType<typeof setInterval>>();
export const gameStartTimes = new Map<string, number>();
export const persistedGames = new Set<string>();
export const chatTimestamps = new Map<string, number[]>();
```

- [ ] **Step 3: Create game plugin entry, verify, commit**

```bash
pnpm --filter server exec tsc --noEmit
git add -A
git commit -m "refactor(server): migrate game module to plugin structure"
```

---

### Task 6: Server — Migrate voice and interaction to plugins, clean up socket-handler

**Files:**
- Create: `packages/server/src/plugins/core/voice/index.ts`
- Move: `src/voice/*` → `src/plugins/core/voice/`
- Create: `packages/server/src/plugins/core/interaction/index.ts`
- Move: `src/ws/interaction-events.ts` → `src/plugins/core/interaction/ws.ts`
- Modify: `src/ws/socket-handler.ts` — update all import paths
- Delete: `src/redis/client.ts` (dead code)

- [ ] **Step 1: Move voice files**

```bash
mkdir -p packages/server/src/plugins/core/voice
mv packages/server/src/voice/media-worker.ts packages/server/src/plugins/core/voice/media-worker.ts
mv packages/server/src/voice/room-voice.ts packages/server/src/plugins/core/voice/room-voice.ts
mv packages/server/src/voice/voice-events.ts packages/server/src/plugins/core/voice/events.ts
rmdir packages/server/src/voice
```

- [ ] **Step 2: Move interaction events**

```bash
mkdir -p packages/server/src/plugins/core/interaction
mv packages/server/src/ws/interaction-events.ts packages/server/src/plugins/core/interaction/ws.ts
```

- [ ] **Step 3: Delete dead code**

```bash
rm packages/server/src/redis/client.ts
rmdir packages/server/src/redis
```

- [ ] **Step 4: Update all import paths in socket-handler.ts and other files**

Update every `import` statement that referenced the old paths. Run:

```bash
pnpm --filter server exec tsc --noEmit
```

Fix all import errors until compilation passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(server): migrate voice and interaction to plugins, remove dead code"
```

---

### Task 7: Server — Finalize plugin loader and clean up app.ts

**Files:**
- Modify: `packages/server/src/plugin-loader.ts`
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Update plugin-loader with all plugins**

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context';
import authPlugin from './plugins/core/auth/index';
import profilePlugin from './plugins/core/profile/index';
import roomPlugin from './plugins/core/room/index';
import gamePlugin from './plugins/core/game/index';
import voicePlugin from './plugins/core/voice/index';
import interactionPlugin from './plugins/core/interaction/index';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  await fastify.register(authPlugin, { ctx });
  await fastify.register(profilePlugin, { ctx });
  await fastify.register(roomPlugin, { ctx });
  await fastify.register(gamePlugin, { ctx });
  await fastify.register(voicePlugin, { ctx });
  await fastify.register(interactionPlugin, { ctx });
}
```

- [ ] **Step 2: Simplify app.ts**

Remove all legacy imports. The final `app.ts` should only: create Fastify, register CORS, create Socket.IO, create KV, build PluginContext, call `loadPlugins`, set up socket middleware and connection handler, register `/health`.

- [ ] **Step 3: Update index.ts imports**

Adjust any changed import paths for `closeWorkers`, `setGamePersistence`, etc.

- [ ] **Step 4: Full verification**

```bash
pnpm --filter server exec tsc --noEmit
pnpm --filter shared test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(server): finalize plugin loader, clean up app entry"
```

---

### Task 8: Client — Create shared directory and move shared modules

**Files:**
- Move shared modules from flat structure to `src/shared/`

- [ ] **Step 1: Create shared directory structure**

```bash
cd packages/client/src
mkdir -p shared/components/ui shared/lib shared/stores shared/sound shared/voice shared/utils
```

- [ ] **Step 2: Move shared modules**

```bash
# UI components
mv components/ui/Button.tsx shared/components/ui/Button.tsx
mv components/ui/GoogleRing.tsx shared/components/ui/GoogleRing.tsx
mv components/Toast.tsx shared/components/Toast.tsx
mv components/ProtectedRoute.tsx shared/components/ProtectedRoute.tsx

# Lib
mv lib/utils.ts shared/lib/utils.ts

# Global stores
mv stores/toast-store.ts shared/stores/toast-store.ts
mv stores/settings-store.ts shared/stores/settings-store.ts
mv stores/room-store.ts shared/stores/room-store.ts

# Utilities
mv utils/playable-cards.ts shared/utils/playable-cards.ts
mv utils/card-images.ts shared/utils/card-images.ts
mv utils/image-compress.ts shared/utils/image-compress.ts

# Sound
mv sound/sound-manager.ts shared/sound/sound-manager.ts

# Voice
mv voice/voice-client.ts shared/voice/voice-client.ts
mv voice/VoicePanel.tsx shared/voice/VoicePanel.tsx

# Core modules
mv api.ts shared/api.ts
mv socket.ts shared/socket.ts
mv env.ts shared/env.ts
```

- [ ] **Step 3: Update tsconfig path alias**

In `packages/client/tsconfig.json`, update the `@/*` alias to include shared:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["./src/shared/*"]
    }
  }
}
```

Also update `vite.config.ts` resolve aliases to match.

- [ ] **Step 4: Update all import paths**

Run `pnpm --filter client exec tsc --noEmit` and fix all broken imports. Every file that imported from `../lib/utils`, `../stores/toast-store`, `../components/ui/Button`, `../socket`, `../api`, etc. needs updated paths.

- [ ] **Step 5: Verify build**

```bash
pnpm --filter client exec tsc --noEmit
pnpm --filter client build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(client): move shared modules to src/shared/"
```

---

### Task 9: Client — Create feature directories and move auth feature

**Files:**
- Create feature directory: `src/features/auth/`
- Move auth-related pages, stores, components

- [ ] **Step 1: Create auth feature structure and move files**

```bash
mkdir -p packages/client/src/features/auth/{pages,stores,components}
mv packages/client/src/pages/HomePage.tsx packages/client/src/features/auth/pages/
mv packages/client/src/pages/RegisterPage.tsx packages/client/src/features/auth/pages/
mv packages/client/src/pages/AuthCallback.tsx packages/client/src/features/auth/pages/
mv packages/client/src/pages/ProfileSetupPage.tsx packages/client/src/features/auth/pages/
mv packages/client/src/stores/auth-store.ts packages/client/src/features/auth/stores/
mv packages/client/src/components/AvatarUpload.tsx packages/client/src/features/auth/components/
```

- [ ] **Step 2: Create auth routes file**

Create `packages/client/src/features/auth/routes.tsx`:

```tsx
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const HomePage = lazy(() => import('./pages/HomePage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ProfileSetupPage = lazy(() => import('./pages/ProfileSetupPage'));

export const authRoutes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/register', element: <RegisterPage /> },
];

export const authProtectedRoutes: RouteObject[] = [
  { path: '/profile/setup', element: <ProfileSetupPage /> },
];
```

- [ ] **Step 3: Update all imports in moved files**

Fix relative imports in all moved files to reference the new `@shared/` paths.

- [ ] **Step 4: Verify, commit**

```bash
pnpm --filter client exec tsc --noEmit
git add -A
git commit -m "refactor(client): create auth feature module"
```

---

### Task 10: Client — Create game, lobby, profile features

**Files:**
- Create: `src/features/game/`, `src/features/lobby/`, `src/features/profile/`
- Move remaining pages, stores, components

- [ ] **Step 1: Create game feature and move files**

```bash
mkdir -p packages/client/src/features/game/{pages,stores,components}
mv packages/client/src/pages/GamePage.tsx packages/client/src/features/game/pages/
mv packages/client/src/pages/RoomPage.tsx packages/client/src/features/game/pages/
mv packages/client/src/stores/game-store.ts packages/client/src/features/game/stores/
mv packages/client/src/stores/game-log-store.ts packages/client/src/features/game/stores/

# Move all game components (30+ files)
for f in GameTable PlayerNode PlayerHand Card AnimatedCard CardBack GameActions GameEffects DrawPile DiscardPile DrawCardAnimation ChatBox ChatBubble ColorPicker ColorBlindOverlay Confetti CountdownRing HouseRulesPanel HouseRulesCard RuleTeaching GameLog GameLogEntry TopBar TurnTimer ScoreBoard QuickReaction ThrowItemPicker ThrowAnimation MobileFAB BottomSheet UnoCallEffect; do
  mv "packages/client/src/components/${f}.tsx" "packages/client/src/features/game/components/" 2>/dev/null
done
```

- [ ] **Step 2: Create game routes**

Create `packages/client/src/features/game/routes.tsx`:

```tsx
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const GamePage = lazy(() => import('./pages/GamePage'));
const RoomPage = lazy(() => import('./pages/RoomPage'));

export const gameProtectedRoutes: RouteObject[] = [
  { path: '/room/:roomCode', element: <RoomPage /> },
  { path: '/game/:roomCode', element: <GamePage /> },
];
```

- [ ] **Step 3: Create lobby and profile features**

```bash
mkdir -p packages/client/src/features/lobby/pages
mkdir -p packages/client/src/features/profile/pages
mv packages/client/src/pages/LobbyPage.tsx packages/client/src/features/lobby/pages/
mv packages/client/src/pages/ProfilePage.tsx packages/client/src/features/profile/pages/
```

Create `packages/client/src/features/lobby/routes.tsx`:

```tsx
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const LobbyPage = lazy(() => import('./pages/LobbyPage'));

export const lobbyProtectedRoutes: RouteObject[] = [
  { path: '/lobby', element: <LobbyPage /> },
];
```

Create `packages/client/src/features/profile/routes.tsx`:

```tsx
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const ProfilePage = lazy(() => import('./pages/ProfilePage'));

export const profileProtectedRoutes: RouteObject[] = [
  { path: '/profile', element: <ProfilePage /> },
];
```

- [ ] **Step 4: Delete dead components**

```bash
rm packages/client/src/components/DirectionIndicator.tsx 2>/dev/null
rm packages/client/src/components/OpponentRow.tsx 2>/dev/null
```

- [ ] **Step 5: Update all imports in moved files**

Fix all relative imports. This is the largest import-fix step — 30+ game components need updated paths.

- [ ] **Step 6: Verify, commit**

```bash
pnpm --filter client exec tsc --noEmit
git add -A
git commit -m "refactor(client): create game, lobby, profile feature modules"
```

---

### Task 11: Client — Create app router and update entry point

**Files:**
- Create: `packages/client/src/app/router.tsx`
- Modify: `packages/client/src/App.tsx` (move to `src/app/App.tsx`)
- Modify: `packages/client/src/main.tsx` (move to `src/app/main.tsx`)
- Modify: `vite.config.ts` (update entry if needed)

- [ ] **Step 1: Create app directory and router**

```bash
mkdir -p packages/client/src/app
```

Create `packages/client/src/app/router.tsx`:

```tsx
import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '@shared/components/ProtectedRoute';
import { authRoutes, authProtectedRoutes } from '@/features/auth/routes';
import { gameProtectedRoutes } from '@/features/game/routes';
import { lobbyProtectedRoutes } from '@/features/lobby/routes';
import { profileProtectedRoutes } from '@/features/profile/routes';

const allPublicRoutes = [...authRoutes];
const allProtectedRoutes = [...authProtectedRoutes, ...gameProtectedRoutes, ...lobbyProtectedRoutes, ...profileProtectedRoutes];

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>}>
        <Routes>
          {allPublicRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route element={<ProtectedRoute />}>
            {allProtectedRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Move and update App.tsx**

Move `src/App.tsx` to `src/app/App.tsx`. Simplify it to use the router + Toast:

```tsx
import { useEffect } from 'react';
import AppRouter from './router';
import ToastContainer from '@shared/components/Toast';
import { useSettingsStore, FONT_OPTIONS } from '@shared/stores/settings-store';

export default function App() {
  const fontFamily = useSettingsStore((s) => s.fontFamily);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-game', FONT_OPTIONS[fontFamily].value);
  }, [fontFamily]);

  return (
    <div className="flex min-h-svh flex-col font-game bg-background text-foreground">
      <AppRouter />
      <ToastContainer />
    </div>
  );
}
```

- [ ] **Step 3: Move main.tsx and update vite config**

Move `src/main.tsx` to `src/app/main.tsx`. Update the import:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Update `vite.config.ts` entry if it references `src/main.tsx` — change to `src/app/main.tsx`. Also update `index.html` script src if needed.

- [ ] **Step 4: Clean up empty directories**

```bash
rmdir packages/client/src/pages 2>/dev/null
rmdir packages/client/src/stores 2>/dev/null
rmdir packages/client/src/components 2>/dev/null
rmdir packages/client/src/lib 2>/dev/null
```

- [ ] **Step 5: Full verification**

```bash
pnpm --filter client exec tsc --noEmit
pnpm --filter client build
pnpm --filter shared test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(client): create app router with lazy-loaded feature routes"
```

---

### Task 12: Full integration verification

- [ ] **Step 1: Run all type checks**

```bash
pnpm --filter server exec tsc --noEmit
pnpm --filter client exec tsc --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

- [ ] **Step 3: Build client**

```bash
pnpm --filter client build
```

- [ ] **Step 4: Start dev server and verify manually**

```bash
pnpm --filter server dev &
pnpm --filter client dev &
```

Open browser, verify: login flow, lobby, room creation, game play, voice, chat, throw items all work.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "refactor: complete plugin architecture migration — verify all features"
```
