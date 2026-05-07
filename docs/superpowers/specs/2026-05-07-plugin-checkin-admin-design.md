# UNO Online: Plugin Architecture, Check-in/Points, Admin Panel

## Overview

Three interconnected systems to make the UNO Online project modular, feature-rich, and maintainable:

1. **Plugin Architecture** — Restructure server and client into pluggable feature modules
2. **Check-in, Points & Shop** — Daily check-in, point economy, and item shop
3. **Admin Panel** — Standalone admin application for managing users, rooms, and shop

Implementation order: Plugin Architecture → Check-in/Points/Shop → Admin Panel.

---

## 1. Plugin Architecture

### 1.1 Server: Fastify Plugin System

Each feature domain becomes a Fastify plugin with its own routes, WebSocket events, database migrations, and business logic.

#### Directory Structure

```
packages/server/src/
  plugins/
    core/
      auth/           # Existing auth, migrated
        index.ts      # fp(async (fastify, { ctx }) => { ... })
        routes.ts
        service.ts
      room/
        index.ts
        routes.ts     # (future HTTP room APIs)
        ws.ts         # room:create, room:join, etc.
        store.ts      # KV-based room store
      game/
        index.ts
        ws.ts         # game actions
        session.ts
        timer.ts
      voice/
        index.ts
        ws.ts
      interaction/
        index.ts
        ws.ts         # throw items, quick reactions
    features/
      checkin/
        index.ts
        routes.ts
        migration.ts
      points/
        index.ts
        routes.ts
        service.ts
        migration.ts
      shop/
        index.ts
        routes.ts
        migration.ts
      admin/
        index.ts
        routes.ts
        middleware.ts  # adminOnly guard
  plugin-context.ts
  plugin-loader.ts
  app.ts              # Simplified: creates Fastify, registers plugins via loader
  index.ts            # Entry: config, migrate, listen
```

#### Plugin Context

```typescript
export interface PluginContext {
  db: Kysely<Database>;
  kv: KvStore;
  io: SocketIOServer;
  config: Config;
}
```

Passed as `opts.ctx` to every plugin's `register()` function.

#### Plugin Contract

Each plugin directory contains an `index.ts` that exports a Fastify plugin:

```typescript
import fp from 'fastify-plugin';
import type { PluginContext } from '../../plugin-context';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  // Register HTTP routes with prefix
  await fastify.register(routes, { prefix: '/checkin', ctx: opts.ctx });

  // Register WebSocket event handlers
  registerWsEvents(opts.ctx);

  // Run database migrations
  await migrate(opts.ctx.db);
});
```

#### Plugin Loader

```typescript
// plugin-loader.ts
export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext) {
  // Core plugins (order matters)
  await fastify.register(authPlugin, { ctx });
  await fastify.register(roomPlugin, { ctx });
  await fastify.register(gamePlugin, { ctx });
  await fastify.register(voicePlugin, { ctx });
  await fastify.register(interactionPlugin, { ctx });

  // Feature plugins
  await fastify.register(checkinPlugin, { ctx });
  await fastify.register(pointsPlugin, { ctx });
  await fastify.register(shopPlugin, { ctx });
  await fastify.register(adminPlugin, { ctx });
}
```

#### WebSocket Event Registration

Plugins that handle WebSocket events receive the Socket.IO server from the context and register listeners in a `setupWsHandlers(ctx)` function, called from their plugin `index.ts`. The socket-handler.ts becomes a thin orchestrator that sets up auth/rate-limit middleware and delegates to plugin WS handlers.

#### Migration Pattern

Each plugin's `migration.ts` exports:

```typescript
export async function migrate(db: Kysely<Database>): Promise<void> {
  // CREATE TABLE IF NOT EXISTS + ALTER TABLE try/catch
}
```

All migrations run at startup via the plugin loader, after core DB migrations.

### 1.2 Client: Feature Module System

#### Directory Structure

```
packages/client/src/
  features/
    auth/
      pages/          # HomePage, RegisterPage, AuthCallback, ProfileSetupPage
      stores/         # auth-store
      components/     # AvatarUpload
      routes.tsx      # Exports RouteObject[]
      index.ts
    game/
      pages/          # GamePage, RoomPage
      stores/         # game-store, game-log-store
      components/     # Card, PlayerNode, GameTable, etc.
      routes.tsx
      index.ts
    lobby/
      pages/          # LobbyPage
      routes.tsx
      index.ts
    profile/
      pages/          # ProfilePage
      routes.tsx
      index.ts
    checkin/
      pages/          # CheckinPage
      stores/         # checkin-store
      routes.tsx
      index.ts
    shop/
      pages/          # ShopPage
      stores/         # shop-store
      routes.tsx
      index.ts
  shared/
    components/ui/    # Button, GoogleRing, etc.
    lib/              # utils.ts (cn, getRoleColor)
    hooks/            # Shared React hooks
    stores/           # Global stores (toast, settings, room)
    api.ts
    socket.ts
  app/
    App.tsx
    router.tsx        # Assembles all feature routes with React.lazy()
    main.tsx
```

#### Feature Interface

Each feature exports its route definitions:

```typescript
// features/checkin/routes.tsx
import { lazy } from 'react';
const CheckinPage = lazy(() => import('./pages/CheckinPage'));

export const checkinRoutes: RouteObject[] = [
  { path: '/checkin', element: <CheckinPage /> },
];
```

The app router collects all feature routes:

```typescript
// app/router.tsx
import { authRoutes } from '@/features/auth/routes';
import { gameRoutes } from '@/features/game/routes';
import { checkinRoutes } from '@/features/checkin/routes';
// ...

export const router = createBrowserRouter([
  ...authRoutes,
  ...gameRoutes,
  ...checkinRoutes,
  // ...
]);
```

### 1.3 Migration Strategy for Existing Code

The refactoring must not break existing functionality. Approach:

1. Create the new directory structure
2. Move files one plugin/feature at a time
3. Update imports after each move
4. Run `tsc --noEmit` and tests after each batch
5. Keep old files as re-exports during transition (remove once all references updated)

---

## 2. Check-in, Points & Shop

### 2.1 Database Schema

#### `checkins` table

| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK, default hex(randomblob(16)) |
| user_id | TEXT | FK users.id, NOT NULL |
| checkin_date | TEXT | NOT NULL (YYYY-MM-DD, UTC+8) |
| streak | INTEGER | NOT NULL |
| points_earned | INTEGER | NOT NULL |
| created_at | TEXT | NOT NULL, default datetime('now') |

Unique index on `(user_id, checkin_date)`.

#### `point_transactions` table

| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | FK users.id, NOT NULL |
| amount | INTEGER | NOT NULL (positive or negative) |
| type | TEXT | NOT NULL: checkin, game_win, game_play, shop_purchase, admin_adjust |
| description | TEXT | |
| created_at | TEXT | NOT NULL |

Index on `user_id`.

#### `shop_items` table

| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| name | TEXT | NOT NULL |
| description | TEXT | |
| type | TEXT | NOT NULL: title, effect, avatar_frame |
| price | INTEGER | NOT NULL |
| stock | INTEGER | NOT NULL, default -1 (-1 = unlimited) |
| data | TEXT | JSON payload (e.g., title text, effect config) |
| active | INTEGER | NOT NULL, default 1 |
| created_at | TEXT | NOT NULL |

#### `user_items` table

| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PK |
| user_id | TEXT | FK users.id |
| item_id | TEXT | FK shop_items.id |
| purchased_at | TEXT | NOT NULL |

Unique index on `(user_id, item_id)`.

#### `users` table extensions

Add columns:
- `points` INTEGER DEFAULT 0 — current point balance
- `current_title` TEXT DEFAULT NULL — equipped title item ID

### 2.2 Check-in Rules

- One check-in per calendar day (UTC+8 timezone)
- Base reward: 10 points
- Streak bonus: min(streak * 2, 20) extra points
- Streak resets if previous day was missed
- Max daily reward: 10 + 20 = 30 points

### 2.3 Game Point Rewards

Integrated into existing `recordGameResult()` in user-repo:
- Participation: +5 points per game completed
- Win: +15 points (in addition to participation)
- Points are recorded as `point_transactions` entries

### 2.4 Shop

- Items have a `type` field determining how they are used:
  - `title`: Text label shown next to nickname. `data` field contains `{ text: string, color: string }`
  - `effect`: Visual effect. `data` field contains effect configuration
  - `avatar_frame`: Frame overlay. `data` field contains frame SVG/image reference
- Purchase deducts points (atomic: check balance → deduct → create user_item in transaction)
- Stock tracking: decrement on purchase, reject if stock = 0, ignore if stock = -1
- Items can be deactivated (soft delete) by admin

### 2.5 API Endpoints

All require authentication unless noted.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/checkin` | Perform daily check-in. Returns points earned, streak. |
| GET | `/checkin/status` | Today's check-in status, current streak, last check-in date |
| GET | `/points/balance` | Current point balance |
| GET | `/points/history?page=&limit=` | Paginated point transaction history |
| GET | `/shop/items` | Active shop items list |
| POST | `/shop/purchase/:itemId` | Purchase item (deducts points) |
| GET | `/shop/inventory` | User's purchased items |
| PATCH | `/profile/title` | Equip/unequip a title. Body: `{ itemId: string | null }` |

### 2.6 Client Features

**Check-in page**: Calendar view showing check-in history, streak counter, check-in button, points display.

**Shop page**: Grid of shop items with price, buy button, owned indicator.

**Points display**: Show in TopBar or profile area. Point balance visible in lobby.

**Title display**: Rendered next to player nickname in game (PlayerNode, OpponentRow, RoomPage).

---

## 3. Admin Panel

### 3.1 Application Structure

Standalone Vite + React + shadcn/ui application in `packages/admin/`.

```
packages/admin/
  package.json
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
  components.json       # shadcn/ui config
  src/
    components/ui/      # shadcn/ui components (via CLI)
    pages/
      LoginPage.tsx
      DashboardPage.tsx
      UsersPage.tsx
      RoomsPage.tsx
      ShopPage.tsx
    stores/
      admin-auth-store.ts
    lib/
      api.ts
      utils.ts
    App.tsx
    main.tsx
```

### 3.2 Authentication & Authorization

- Admin panel reuses the game server's `/auth/login` endpoint
- After login, checks user role from the JWT payload
- Only `role === 'admin'` can access the admin panel
- Server-side: all `/admin/*` routes use `adminOnly` middleware that verifies `request.user.role === 'admin'`

#### Default Admin Setup

- The first registered user (lowest `created_at`) automatically gets `role = 'admin'` during migration
- Additional admins can be configured via environment variable `ADMIN_USER_IDS` (comma-separated user IDs), applied at startup

### 3.3 Admin API Endpoints

All require admin authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/dashboard` | Stats: total users, online count, active rooms, total games played |
| GET | `/admin/users?search=&page=&limit=` | Paginated user list with search |
| GET | `/admin/users/:id` | User detail with game history |
| PATCH | `/admin/users/:id/role` | Change user role. Body: `{ role: UserRole }` |
| PATCH | `/admin/users/:id/points` | Adjust points. Body: `{ amount: number, reason: string }` |
| POST | `/admin/users/:id/ban` | Toggle ban status |
| GET | `/admin/rooms` | Active rooms: code, player count, status, created time |
| DELETE | `/admin/rooms/:code` | Force dissolve a room |
| GET | `/admin/shop/items` | All items (including inactive) |
| POST | `/admin/shop/items` | Create shop item |
| PATCH | `/admin/shop/items/:id` | Update shop item |
| DELETE | `/admin/shop/items/:id` | Deactivate shop item |

### 3.4 UI Pages

**Dashboard**: Cards showing key metrics (total users, online players, active rooms, games today). Refresh button or auto-refresh.

**Users**: DataTable with columns (ID, username, nickname, role, points, games, status). Actions: role dropdown, point adjustment dialog, ban toggle. Search by username/nickname.

**Rooms**: DataTable showing active rooms (code, player count, status, host, created time). Action: dissolve button with confirmation.

**Shop**: DataTable of items (name, type, price, stock, active status). Create/edit dialog. Toggle active status.

### 3.5 shadcn/ui Components Needed

Button, Card, Input, Select, Dialog, Table, Badge, DropdownMenu, Pagination, Tabs, AlertDialog (for destructive confirmations), Skeleton (loading states).

---

## 4. Implementation Phases

### Phase 1: Plugin Architecture Refactoring

- Create plugin-context, plugin-loader infrastructure
- Migrate existing server code into core plugins (auth, room, game, voice, interaction)
- Migrate existing client code into features (auth, game, lobby, profile)
- Verify all existing functionality works after migration

### Phase 2: Check-in, Points & Shop

- Implement server plugins: checkin, points, shop
- Add database migrations for new tables
- Integrate point rewards into game result recording
- Build client features: checkin page, shop page, points display, title rendering

### Phase 3: Admin Panel

- Scaffold packages/admin with Vite + shadcn/ui
- Implement admin API endpoints as a server plugin
- Build admin pages: dashboard, users, rooms, shop management
- Set up default admin user

### Phase 4: Integration & Polish

- End-to-end testing across all systems
- Error handling and edge cases
- Performance optimization (pagination, caching)

---

## 5. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Fastify native plugins over custom registry | Leverages proven lifecycle management, encapsulation scoping, and decorator system |
| Feature-based client organization | Collocates related code, enables lazy loading, reduces cross-feature coupling |
| Separate admin application | Isolates admin bundle from player-facing app, different dependency needs (shadcn/ui), independent deployment |
| Points as running balance + transaction log | Balance field for fast reads, transaction log for auditability and history |
| UTC+8 for check-in date calculation | Target audience is Chinese users, avoids timezone ambiguity |
| SQLite for all persistent data | Consistent with existing architecture, no need for a separate database for new features |
| KV store only for ephemeral state | Rooms and live game state are ephemeral; points, check-ins, shop are persistent in SQLite |
