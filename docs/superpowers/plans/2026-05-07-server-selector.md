# Server Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server selector that lets users browse, add, and switch between multiple UNO Online server instances with real-time status display.

**Architecture:** Server-side Fastify plugin exposes `GET /server/info` (public, CORS `*`). Client-side Zustand store manages server list (default + custom from localStorage). `API_URL` becomes a dynamic getter so api.ts/socket.ts route requests to the selected server. Two shared UI components (ServerButton + ServerSelectModal) are placed on the login page and lobby.

**Tech Stack:** Fastify plugin, Socket.IO (`io.engine.clientsCount`), Zustand, framer-motion, lucide-react

**Spec:** `docs/superpowers/specs/2026-05-07-server-selector-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `packages/shared/src/types/server.ts` | `ServerInfo` interface shared by server and client |
| `packages/server/src/plugins/core/server-info/index.ts` | Fastify plugin entry (fp wrapper) |
| `packages/server/src/plugins/core/server-info/routes.ts` | `GET /server/info` route handler |
| `packages/client/src/shared/stores/server-store.ts` | Server list state, localStorage persistence, latency measurement |
| `packages/client/src/shared/components/ServerButton.tsx` | Small indicator button showing current server + status dot |
| `packages/client/src/shared/components/ServerSelectModal.tsx` | Modal with server list, stats, add/remove custom servers |

### Modified files

| File | Change |
|------|--------|
| `packages/shared/src/types/index.ts` | Re-export `./server` |
| `packages/server/src/config.ts` | Add `serverName`, `serverMotd` to `Config` |
| `packages/server/src/plugin-loader.ts` | Register `serverInfoPlugin` |
| `packages/client/src/shared/env.ts` | Replace `API_URL` const with `getApiUrl()` function |
| `packages/client/src/shared/api.ts` | Use `getApiUrl()` instead of `API_URL` |
| `packages/client/src/shared/socket.ts` | Use `getApiUrl()` instead of `API_URL` |
| `packages/client/src/features/auth/pages/HomePage.tsx` | Add `ServerButton` to bottom-left area |
| `packages/client/src/features/lobby/pages/LobbyPage.tsx` | Add `ServerButton` to bottom-right area |
| `packages/client/vite.config.ts` | Add `/server` proxy entry |
| `Caddyfile` | Add `handle /server/*` proxy rule |

---

### Task 1: Shared `ServerInfo` type

**Files:**
- Create: `packages/shared/src/types/server.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Create the ServerInfo type**

```typescript
// packages/shared/src/types/server.ts
export interface ServerInfo {
  name: string;
  version: string;
  motd: string;
  onlinePlayers: number;
  activeRooms: number;
  uptime: number;
}
```

- [ ] **Step 2: Re-export from barrel**

Add to the end of `packages/shared/src/types/index.ts`:

```typescript
export * from './server';
```

- [ ] **Step 3: Type-check shared package**

Run: `pnpm --filter shared exec tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/server.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add ServerInfo type for server selector"
```

---

### Task 2: Server config — add `serverName` and `serverMotd`

**Files:**
- Modify: `packages/server/src/config.ts`

- [ ] **Step 1: Add fields to Config interface**

In `packages/server/src/config.ts`, add two fields to the `Config` interface:

```typescript
export interface Config {
  port: number;
  databasePath: string;
  redisUrl?: string;
  githubClientId: string;
  githubClientSecret: string;
  jwtSecret: string;
  clientUrl: string;
  devMode: boolean;
  serverName: string;
  serverMotd: string;
}
```

- [ ] **Step 2: Read from env in loadConfig()**

In the `loadConfig()` return object, add:

```typescript
    serverName: process.env['SERVER_NAME'] ?? 'UNO Online',
    serverMotd: process.env['SERVER_MOTD'] ?? '欢迎来到 UNO Online！',
```

- [ ] **Step 3: Type-check server**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/config.ts
git commit -m "feat(server): add serverName and serverMotd config options"
```

---

### Task 3: Server `GET /server/info` endpoint

**Files:**
- Create: `packages/server/src/plugins/core/server-info/index.ts`
- Create: `packages/server/src/plugins/core/server-info/routes.ts`
- Modify: `packages/server/src/plugin-loader.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// packages/server/src/plugins/core/server-info/routes.ts
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import type { ServerInfo } from '@uno-online/shared';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../../../../package.json') as { version: string };

export function registerServerInfoRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config, io, kv } = ctx;

  fastify.get('/server/info', async (_request, reply) => {
    void reply.header('Access-Control-Allow-Origin', '*');

    const roomKeys = await kv.keys('room:*');
    const roomCodes = new Set(roomKeys.map(k => k.split(':')[1]!));

    const info: ServerInfo = {
      name: config.serverName,
      version: pkg.version,
      motd: config.serverMotd,
      onlinePlayers: io.engine.clientsCount,
      activeRooms: roomCodes.size,
      uptime: Math.floor(process.uptime()),
    };

    return info;
  });
}
```

- [ ] **Step 2: Create the plugin entry**

```typescript
// packages/server/src/plugins/core/server-info/index.ts
import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerServerInfoRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  registerServerInfoRoutes(fastify, opts.ctx);
}, { name: 'server-info' });
```

- [ ] **Step 3: Register in plugin-loader.ts**

In `packages/server/src/plugin-loader.ts`, add the import and registration:

```typescript
import serverInfoPlugin from './plugins/core/server-info/index';
```

Add after the existing `adminPlugin` registration:

```typescript
  await fastify.register(serverInfoPlugin, { ctx });
```

- [ ] **Step 4: Add Vite dev proxy**

In `packages/client/vite.config.ts`, add to the `proxy` object (after `/health`):

```typescript
      '/server': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
```

- [ ] **Step 5: Add Caddy production proxy**

In `Caddyfile`, add before the final `handle` block (the static file server):

```
handle /server/* {
	reverse_proxy server:3001
}
```

- [ ] **Step 6: Type-check server**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Manual test**

Start the server: `DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev`
Request: `curl http://localhost:3001/server/info`
Expected: JSON with `name`, `version`, `motd`, `onlinePlayers`, `activeRooms`, `uptime` fields. `Access-Control-Allow-Origin: *` header present.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/plugins/core/server-info/ packages/server/src/plugin-loader.ts packages/client/vite.config.ts Caddyfile
git commit -m "feat(server): add GET /server/info endpoint with CORS support"
```

---

### Task 4: Dynamic `getApiUrl()` — replace static `API_URL`

**Files:**
- Modify: `packages/client/src/shared/env.ts`
- Modify: `packages/client/src/shared/api.ts`
- Modify: `packages/client/src/shared/socket.ts`

- [ ] **Step 1: Replace API_URL with getApiUrl() in env.ts**

Replace the entire content of `packages/client/src/shared/env.ts`:

```typescript
export function getApiUrl(): string {
  const address = localStorage.getItem('uno-current-server-address');
  if (!address) return import.meta.env.VITE_API_URL ?? '';
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${address}`;
}
```

This reads the selected server address directly from localStorage to avoid a circular dependency with the server store (the store hasn't been created yet, and api.ts is imported by the auth store which may be imported by the server store).

- [ ] **Step 2: Update api.ts**

In `packages/client/src/shared/api.ts`, change the import and usage:

Replace:
```typescript
import { API_URL } from './env';
```
With:
```typescript
import { getApiUrl } from './env';
```

Then replace all three occurrences of `` `${API_URL}${path}` `` with `` `${getApiUrl()}${path}` ``.

- [ ] **Step 3: Update socket.ts**

In `packages/client/src/shared/socket.ts`, change the import:

Replace:
```typescript
import { API_URL } from './env';
```
With:
```typescript
import { getApiUrl } from './env';
```

In the `getSocket()` function, replace:
```typescript
    socket = io(API_URL, {
```
With:
```typescript
    socket = io(getApiUrl(), {
```

- [ ] **Step 4: Type-check client**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/shared/env.ts packages/client/src/shared/api.ts packages/client/src/shared/socket.ts
git commit -m "refactor(client): replace static API_URL with dynamic getApiUrl()"
```

---

### Task 5: Server Store — `server-store.ts`

**Files:**
- Create: `packages/client/src/shared/stores/server-store.ts`

- [ ] **Step 1: Create the store**

```typescript
// packages/client/src/shared/stores/server-store.ts
import { create } from 'zustand';
import type { ServerInfo } from '@uno-online/shared';

export interface ServerEntry {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
}

const DEFAULT_SERVER: ServerEntry = {
  id: 'default',
  name: '当前服务器',
  address: '',
  isDefault: true,
};

function loadCustomServers(): ServerEntry[] {
  try {
    const raw = localStorage.getItem('uno-server-list');
    return raw ? JSON.parse(raw) as ServerEntry[] : [];
  } catch {
    return [];
  }
}

function saveCustomServers(servers: ServerEntry[]) {
  const custom = servers.filter(s => !s.isDefault);
  localStorage.setItem('uno-server-list', JSON.stringify(custom));
}

function saveCurrentServerId(id: string) {
  const servers = [DEFAULT_SERVER, ...loadCustomServers()];
  const server = servers.find(s => s.id === id);
  if (server) {
    localStorage.setItem('uno-current-server', id);
    localStorage.setItem('uno-current-server-address', server.address);
  }
}

function buildServerUrl(address: string): string {
  if (!address) return '';
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${address}`;
}

async function fetchServerInfo(address: string): Promise<ServerInfo | null> {
  const base = buildServerUrl(address);
  const url = base ? `${base}/server/info` : '/server/info';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as ServerInfo;
  } catch {
    return null;
  }
}

async function measureLatency(address: string): Promise<number | null> {
  const base = buildServerUrl(address);
  const url = base ? `${base}/server/info` : '/server/info';
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    try {
      await fetch(url, { cache: 'no-store' });
      times.push(performance.now() - start);
    } catch {
      return null;
    }
  }
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

interface ServerState {
  servers: ServerEntry[];
  currentServerId: string;
  serverInfoMap: Record<string, ServerInfo | null>;
  latencyMap: Record<string, number | null>;
  isModalOpen: boolean;

  addServer: (address: string) => Promise<ServerInfo | null>;
  removeServer: (id: string) => void;
  selectServer: (id: string) => void;
  refreshServerInfo: (id: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [DEFAULT_SERVER, ...loadCustomServers()],
  currentServerId: localStorage.getItem('uno-current-server') ?? 'default',
  serverInfoMap: {},
  latencyMap: {},
  isModalOpen: false,

  addServer: async (address: string) => {
    const trimmed = address.trim().replace(/\/+$/, '');
    if (!trimmed) return null;
    const { servers } = get();
    if (servers.some(s => s.address === trimmed)) return null;

    const info = await fetchServerInfo(trimmed);
    if (!info) return null;

    const entry: ServerEntry = {
      id: `custom_${Date.now()}`,
      name: info.name,
      address: trimmed,
      isDefault: false,
    };
    const updated = [...servers, entry];
    set({ servers: updated, serverInfoMap: { ...get().serverInfoMap, [entry.id]: info } });
    saveCustomServers(updated);
    return info;
  },

  removeServer: (id: string) => {
    const { servers, currentServerId } = get();
    const target = servers.find(s => s.id === id);
    if (!target || target.isDefault) return;
    const updated = servers.filter(s => s.id !== id);
    set({ servers: updated });
    saveCustomServers(updated);
    if (currentServerId === id) {
      set({ currentServerId: 'default' });
      saveCurrentServerId('default');
    }
  },

  selectServer: (id: string) => {
    set({ currentServerId: id });
    saveCurrentServerId(id);
  },

  refreshServerInfo: async (id: string) => {
    const { servers } = get();
    const server = servers.find(s => s.id === id);
    if (!server) return;

    const [info, latency] = await Promise.all([
      fetchServerInfo(server.address),
      measureLatency(server.address),
    ]);

    set({
      serverInfoMap: { ...get().serverInfoMap, [id]: info },
      latencyMap: { ...get().latencyMap, [id]: latency },
    });
  },

  refreshAll: async () => {
    const { servers } = get();
    await Promise.all(servers.map(s => get().refreshServerInfo(s.id)));
  },

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));
```

- [ ] **Step 2: Type-check client**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/shared/stores/server-store.ts
git commit -m "feat(client): add server store with list management and latency measurement"
```

---

### Task 6: ServerButton component

**Files:**
- Create: `packages/client/src/shared/components/ServerButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
// packages/client/src/shared/components/ServerButton.tsx
import { useServerStore } from '../stores/server-store';

export function ServerButton() {
  const { servers, currentServerId, latencyMap, openModal } = useServerStore();
  const current = servers.find(s => s.id === currentServerId);
  const latency = latencyMap[currentServerId];
  const isOnline = latency !== null && latency !== undefined;

  return (
    <button
      onClick={openModal}
      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/10"
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: isOnline ? '#4ade80' : '#ef4444' }}
      />
      <span>{current?.name ?? '服务器'}</span>
    </button>
  );
}
```

- [ ] **Step 2: Type-check client**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/shared/components/ServerButton.tsx
git commit -m "feat(client): add ServerButton indicator component"
```

---

### Task 7: ServerSelectModal component

**Files:**
- Create: `packages/client/src/shared/components/ServerSelectModal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
// packages/client/src/shared/components/ServerSelectModal.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Server, X, Users, Home, Clock, Signal, Plus, Trash2 } from 'lucide-react';
import { useServerStore } from '../stores/server-store';
import type { ServerEntry } from '../stores/server-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { disconnectSocket } from '../socket';

function getLatencyColor(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '#666';
  if (ms < 50) return '#4ade80';
  if (ms <= 150) return '#fbbf24';
  return '#ef4444';
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时`;
  return `${Math.floor(seconds / 86400)}天`;
}

function ServerCard({
  server,
  isSelected,
  onSelect,
  onRemove,
  info,
  latency,
}: {
  server: ServerEntry;
  isSelected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  info: { name: string; version: string; motd: string; onlinePlayers: number; activeRooms: number; uptime: number } | null;
  latency: number | null | undefined;
}) {
  const isOnline = info !== null;

  return (
    <div
      onClick={onSelect}
      className="cursor-pointer rounded-xl border p-3.5 transition-colors"
      style={{
        background: isSelected ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
        borderColor: isSelected ? '#ef4444' : 'rgba(255,255,255,0.1)',
        borderWidth: isSelected ? '1.5px' : '1px',
        opacity: isOnline ? 1 : 0.5,
      }}
    >
      {/* Header row */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: isOnline ? '#4ade80' : '#ef4444' }}
          />
          <span className="text-[15px] font-bold text-foreground">
            {info?.name ?? server.name}
          </span>
          {info && (
            <span className="text-xs text-muted-foreground">v{info.version}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isOnline && !server.isDefault && (
            <span className="text-xs text-muted-foreground">离线</span>
          )}
          {!server.isDefault && onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-0.5 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* MOTD */}
      {info ? (
        <p className="mb-2 text-[13px] text-muted-foreground">{info.motd}</p>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {server.address || '当前部署'}
        </p>
      )}

      {/* Stats row */}
      {info && (
        <div className="flex items-center text-xs text-muted-foreground">
          <div className="flex flex-1 gap-3.5">
            <span className="flex items-center gap-1">
              <Users size={12} /> {info.onlinePlayers} 在线
            </span>
            <span className="flex items-center gap-1">
              <Home size={12} /> {info.activeRooms} 房间
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> 运行 {formatUptime(info.uptime)}
            </span>
          </div>
          <span
            className="flex items-center gap-1 font-medium"
            style={{ color: getLatencyColor(latency) }}
          >
            <Signal size={12} /> {latency !== null && latency !== undefined ? `${latency}ms` : '--'}
          </span>
        </div>
      )}
    </div>
  );
}

export function ServerSelectModal() {
  const {
    servers,
    currentServerId,
    serverInfoMap,
    latencyMap,
    isModalOpen,
    closeModal,
    selectServer,
    addServer,
    removeServer,
    refreshAll,
  } = useServerStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [newAddress, setNewAddress] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    if (isModalOpen) {
      void refreshAll();
    }
  }, [isModalOpen]);

  const handleSelect = (id: string) => {
    if (id === currentServerId) return;
    disconnectSocket();
    logout();
    selectServer(id);
    closeModal();
    navigate('/');
  };

  const handleAdd = async () => {
    if (!newAddress.trim()) return;
    setAdding(true);
    setAddError('');
    const info = await addServer(newAddress);
    setAdding(false);
    if (info) {
      setNewAddress('');
    } else {
      setAddError('无法连接到该服务器');
    }
  };

  if (!isModalOpen) return null;

  return (
    <AnimatePresence>
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-[460px] rounded-2xl bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Server size={18} /> 选择服务器
              </div>
              <button onClick={closeModal} className="p-1 text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            {/* Server list */}
            <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto p-4">
              {servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  isSelected={server.id === currentServerId}
                  onSelect={() => handleSelect(server.id)}
                  onRemove={server.isDefault ? undefined : () => removeServer(server.id)}
                  info={serverInfoMap[server.id] ?? null}
                  latency={latencyMap[server.id]}
                />
              ))}
            </div>

            {/* Add custom server */}
            <div className="border-t border-white/[0.08] px-4 pb-4 pt-3">
              <div className="flex gap-2">
                <input
                  value={newAddress}
                  onChange={(e) => { setNewAddress(e.target.value); setAddError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="输入服务器地址  如 uno.example.com"
                  className="flex-1 rounded-lg border border-white/15 bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  <Plus size={14} /> {adding ? '添加中...' : '添加'}
                </button>
              </div>
              {addError && (
                <p className="mt-1.5 text-xs text-destructive">{addError}</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type-check client**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/shared/components/ServerSelectModal.tsx
git commit -m "feat(client): add ServerSelectModal with server list and latency display"
```

---

### Task 8: Integrate into HomePage and LobbyPage

**Files:**
- Modify: `packages/client/src/features/auth/pages/HomePage.tsx`
- Modify: `packages/client/src/features/lobby/pages/LobbyPage.tsx`

- [ ] **Step 1: Add ServerButton and ServerSelectModal to HomePage**

In `packages/client/src/features/auth/pages/HomePage.tsx`:

Add imports at the top:

```typescript
import { ServerButton } from '@/shared/components/ServerButton';
import { ServerSelectModal } from '@/shared/components/ServerSelectModal';
```

Find the bottom-left version text block:

```tsx
      <p className="absolute bottom-6 left-6 text-xs text-muted-foreground/50">
        v{BUILD_VERSION} · {new Date(BUILD_TIME).toLocaleDateString('zh-CN')}
      </p>
```

Replace it with:

```tsx
      <div className="absolute bottom-6 left-6 flex items-center gap-3">
        <span className="text-xs text-muted-foreground/50">
          v{BUILD_VERSION} · {new Date(BUILD_TIME).toLocaleDateString('zh-CN')}
        </span>
        <ServerButton />
      </div>

      <ServerSelectModal />
```

- [ ] **Step 2: Add ServerButton and ServerSelectModal to LobbyPage**

In `packages/client/src/features/lobby/pages/LobbyPage.tsx`:

Add imports at the top:

```typescript
import { ServerButton } from '@/shared/components/ServerButton';
import { ServerSelectModal } from '@/shared/components/ServerSelectModal';
```

Find the bottom-right section (theme switcher + version):

```tsx
      <div className="absolute bottom-6 right-6 flex items-center gap-3">
```

Add `<ServerButton />` before the version `<span>` inside this div:

```tsx
      <div className="absolute bottom-6 right-6 flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-btn bg-card/60 p-1">
          {/* ... theme toggle buttons ... */}
        </div>
        <ServerButton />
        <span className="text-xs text-muted-foreground/50">v{BUILD_VERSION}</span>
      </div>

      <ServerSelectModal />
```

The `<ServerSelectModal />` should be placed just before the closing `</div>` of the root element.

- [ ] **Step 3: Type-check client**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Build client**

Run: `pnpm --filter client build`
Expected: successful build with no errors

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/auth/pages/HomePage.tsx packages/client/src/features/lobby/pages/LobbyPage.tsx
git commit -m "feat(client): integrate server selector into HomePage and LobbyPage"
```

---

### Task 9: Manual end-to-end test

- [ ] **Step 1: Start server**

```bash
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev
```

- [ ] **Step 2: Start client**

```bash
pnpm --filter client dev
```

- [ ] **Step 3: Test login page**

Open `http://localhost:5173`.
Verify:
- Server button visible in bottom-left, next to version number
- Clicking it opens the modal
- Default server ("当前服务器") shows as selected with green dot
- Server info (name, version, MOTD, online count, rooms, uptime) loads
- Latency measurement shows with appropriate color

- [ ] **Step 4: Test add custom server**

In the modal footer input, type an invalid address (e.g., `nonexistent.server.com`).
Click "添加".
Verify: error message "无法连接到该服务器" appears.

- [ ] **Step 5: Test login and lobby**

Login with a dev username. Navigate to lobby.
Verify: Server button visible in bottom-right area of lobby page.
Clicking it opens the same modal.

- [ ] **Step 6: Test server switch**

If a second server instance is available, add it and click to switch.
Verify: logged out, redirected to login page `/`, socket disconnected.
