# Plan 3: Client Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete React client — auth flow, lobby, room management, and full game UI — so players can connect to the server and play UNO in a browser.

**Architecture:** React 18 SPA with Vite, using Zustand for state management and Socket.IO client for real-time communication. Pages use React Router. The game UI renders cards with CSS (cartoon style), tracks game state from server-pushed `PlayerView` updates, and uses the shared rules engine for client-side playability hints. Animations deferred to Plan 5.

**Tech Stack:** React 18, Vite, TypeScript, Zustand, React Router, socket.io-client, CSS Modules

---

## File Structure

```
packages/client/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx                   # Entry point
│   ├── App.tsx                    # Router setup
│   ├── env.ts                     # API URL config
│   ├── socket.ts                  # Socket.IO client singleton
│   ├── api.ts                     # HTTP API helpers (auth)
│   ├── styles/
│   │   ├── global.css             # Global styles, CSS variables, fonts
│   │   ├── cards.css              # Card rendering styles
│   │   └── game.css               # Game layout styles
│   ├── stores/
│   │   ├── auth-store.ts          # User auth state + JWT token
│   │   ├── room-store.ts          # Room state (players, settings)
│   │   └── game-store.ts          # Game state (PlayerView from server)
│   ├── components/
│   │   ├── Card.tsx               # Single UNO card rendering
│   │   ├── CardBack.tsx           # Card back (deck/opponent)
│   │   ├── PlayerHand.tsx         # Current player's hand (bottom)
│   │   ├── OpponentRow.tsx        # Opponents display (top)
│   │   ├── DiscardPile.tsx        # Center discard pile
│   │   ├── DrawPile.tsx           # Center draw pile
│   │   ├── DirectionIndicator.tsx # Direction arrow ring
│   │   ├── ColorPicker.tsx        # Wild card color selection modal
│   │   ├── GameActions.tsx        # UNO/Catch/Challenge buttons
│   │   ├── TopBar.tsx             # Room code, timer, voice status
│   │   ├── TurnTimer.tsx          # Countdown timer display
│   │   ├── ScoreBoard.tsx         # Round end / game over scores
│   │   ├── ChatBox.tsx            # Text chat panel
│   │   └── ProtectedRoute.tsx     # Auth guard wrapper
│   └── pages/
│       ├── HomePage.tsx           # Landing + GitHub login
│       ├── AuthCallback.tsx       # OAuth callback handler
│       ├── LobbyPage.tsx          # Create/join rooms
│       ├── RoomPage.tsx           # Waiting room
│       ├── GamePage.tsx           # Main game view
│       └── ProfilePage.tsx        # User stats
```

---

### Task 1: Client Package Scaffold

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/tsconfig.node.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.tsx`
- Create: `packages/client/src/App.tsx`
- Create: `packages/client/src/env.ts`
- Create: `packages/client/src/vite-env.d.ts`

- [ ] **Step 1: Create `packages/client/package.json`**

```json
{
  "name": "@uno-online/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@uno-online/shared": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.6.0",
    "zustand": "^5.0.0",
    "socket.io-client": "^4.8.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.5.0",
    "typescript": "^5.8.0",
    "vite": "^6.3.0"
  }
}
```

- [ ] **Step 2: Create `packages/client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `packages/client/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `packages/client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
```

- [ ] **Step 5: Create `packages/client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UNO Online</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `packages/client/src/vite-env.d.ts`**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 7: Create `packages/client/src/env.ts`**

```typescript
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';
```

- [ ] **Step 8: Create `packages/client/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>{name} — coming soon</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder name="Home" />} />
        <Route path="/auth/callback" element={<Placeholder name="Auth Callback" />} />
        <Route path="/lobby" element={<Placeholder name="Lobby" />} />
        <Route path="/room/:roomCode" element={<Placeholder name="Room" />} />
        <Route path="/game/:roomCode" element={<Placeholder name="Game" />} />
        <Route path="/profile" element={<Placeholder name="Profile" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: Create `packages/client/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 10: Create `packages/client/public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎴</text></svg>
```

- [ ] **Step 11: Install and verify**

```bash
cd /root/uno-online && pnpm install
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 12: Commit**

```bash
git add packages/client/
git commit -m "chore: scaffold client package with React 18 + Vite + Router"
```

---

### Task 2: Global Styles (Cartoon Theme)

**Files:**
- Create: `packages/client/src/styles/global.css`
- Create: `packages/client/src/styles/cards.css`
- Create: `packages/client/src/styles/game.css`

- [ ] **Step 1: Create `packages/client/src/styles/global.css`**

```css
:root {
  --color-red: #ff3366;
  --color-blue: #4488ff;
  --color-green: #33cc66;
  --color-yellow: #fbbf24;
  --color-wild: conic-gradient(var(--color-red) 0deg 90deg, var(--color-blue) 90deg 180deg, var(--color-green) 180deg 270deg, var(--color-yellow) 270deg 360deg);

  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-tertiary: #0f3460;
  --bg-surface: rgba(0, 0, 0, 0.3);
  --bg-surface-hover: rgba(255, 255, 255, 0.08);

  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-accent: #fbbf24;

  --card-border: 4px solid white;
  --card-border-playable: 3px solid var(--text-accent);
  --card-radius: 18px;
  --card-shadow: 3px 4px 0px rgba(0, 0, 0, 0.2);
  --card-glow: 0 0 12px rgba(251, 191, 36, 0.5);

  --font-game: 'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive, sans-serif;
  --font-ui: system-ui, -apple-system, sans-serif;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-ui);
  background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-tertiary) 100%);
  color: var(--text-primary);
  min-height: 100vh;
  overflow-x: hidden;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

button {
  cursor: pointer;
  font-family: var(--font-game);
  border: none;
  outline: none;
}

input {
  font-family: var(--font-ui);
  outline: none;
}

.btn-primary {
  background: var(--text-accent);
  color: var(--bg-primary);
  padding: 10px 24px;
  border-radius: 24px;
  font-size: 16px;
  font-weight: bold;
  box-shadow: var(--card-shadow);
  transition: transform 0.15s;
}

.btn-primary:hover {
  transform: scale(1.05);
}

.btn-primary:active {
  transform: scale(0.97);
}

.btn-danger {
  background: var(--color-red);
  color: white;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  box-shadow: var(--card-shadow);
}

.btn-secondary {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
```

- [ ] **Step 2: Create `packages/client/src/styles/cards.css`**

```css
.card {
  width: 70px;
  height: 100px;
  border-radius: var(--card-radius);
  border: var(--card-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-game);
  font-weight: 900;
  color: white;
  text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.2);
  box-shadow: var(--card-shadow);
  position: relative;
  flex-shrink: 0;
  user-select: none;
  transition: transform 0.2s, box-shadow 0.2s;
}

.card--red { background: var(--color-red); }
.card--blue { background: var(--color-blue); }
.card--green { background: var(--color-green); }
.card--yellow { background: var(--color-yellow); color: #1a1a2e; }
.card--wild { background: var(--color-wild); }

.card--number .card__value { font-size: 32px; }
.card--skip .card__value { font-size: 24px; }
.card--reverse .card__value { font-size: 24px; }
.card--draw_two .card__value { font-size: 20px; }
.card--wild .card__value { font-size: 18px; }
.card--wild_draw_four .card__value { font-size: 16px; }

.card--playable {
  border: var(--card-border-playable);
  box-shadow: var(--card-glow), var(--card-shadow);
  cursor: pointer;
}

.card--playable:hover {
  transform: translateY(-12px) scale(1.05);
}

.card__symbol {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 10px;
  opacity: 0.7;
}

.card-back {
  width: 70px;
  height: 100px;
  border-radius: var(--card-radius);
  border: 3px solid rgba(255, 255, 255, 0.2);
  background: linear-gradient(145deg, #1e3a5f, #0f2744);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-game);
  font-size: 16px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.5);
  box-shadow: var(--card-shadow);
  flex-shrink: 0;
}

.card-back--small {
  width: 12px;
  height: 18px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: var(--color-blue);
  font-size: 0;
}

@media (max-width: 768px) {
  .card {
    width: 52px;
    height: 76px;
    border-radius: 14px;
    border-width: 3px;
  }
  .card--number .card__value { font-size: 24px; }
  .card--skip .card__value,
  .card--reverse .card__value { font-size: 18px; }
  .card-back {
    width: 52px;
    height: 76px;
    font-size: 12px;
  }
}
```

- [ ] **Step 3: Create `packages/client/src/styles/game.css`**

```css
.game-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

.game-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-surface);
  font-size: 13px;
  z-index: 10;
}

.game-topbar__left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.game-topbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.game-topbar__brand {
  font-weight: bold;
  color: var(--text-accent);
  font-family: var(--font-game);
}

.opponent-row {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 10px 20px;
  flex-wrap: wrap;
}

.opponent {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.opponent__avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.opponent__avatar--active {
  border: 3px solid var(--text-accent);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.6);
}

.opponent__name {
  font-size: 11px;
  color: var(--text-primary);
}

.opponent__name--active {
  color: var(--text-accent);
  font-weight: bold;
}

.opponent__cards {
  display: flex;
  gap: 1px;
}

.opponent__count {
  font-size: 10px;
  color: var(--text-secondary);
}

.game-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 40px;
  position: relative;
}

.direction-ring {
  position: absolute;
  width: 160px;
  height: 160px;
  border: 2px dashed rgba(251, 191, 36, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.direction-ring__arrow {
  font-size: 28px;
  color: rgba(251, 191, 36, 0.4);
}

.game-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 8px 0;
}

.player-hand {
  background: var(--bg-surface);
  padding: 14px 20px 18px;
  display: flex;
  justify-content: center;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.player-hand__cards {
  display: flex;
  justify-content: center;
}

.player-hand__cards .card {
  margin-right: -10px;
}

.player-hand__cards .card:last-child {
  margin-right: 0;
}

@media (max-width: 768px) {
  .opponent-row {
    gap: 8px;
    padding: 6px 10px;
  }
  .opponent__avatar {
    width: 36px;
    height: 36px;
    font-size: 14px;
  }
  .game-center {
    gap: 24px;
  }
  .direction-ring {
    width: 120px;
    height: 120px;
  }
}
```

- [ ] **Step 4: Verify dev server starts**

```bash
cd /root/uno-online/packages/client && npx vite --host 0.0.0.0 &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/styles/
git commit -m "feat: add global styles, card CSS, and game layout CSS (cartoon theme)"
```

---

### Task 3: Zustand Stores (Auth, Room, Game)

**Files:**
- Create: `packages/client/src/stores/auth-store.ts`
- Create: `packages/client/src/stores/room-store.ts`
- Create: `packages/client/src/stores/game-store.ts`
- Create: `packages/client/src/api.ts`

- [ ] **Step 1: Create `packages/client/src/api.ts`**

```typescript
import { API_URL } from './env.js';

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Create `packages/client/src/stores/auth-store.ts`**

```typescript
import { create } from 'zustand';
import { apiPost, apiGet } from '../api.js';

interface User {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;

  login: (code: string) => Promise<void>;
  loadUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  loading: false,

  login: async (code: string) => {
    set({ loading: true });
    const data = await apiPost<{ token: string; user: User }>('/auth/callback', { code });
    localStorage.setItem('token', data.token);
    set({ user: data.user, token: data.token, loading: false });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    set({ loading: true });
    try {
      const user = await apiGet<User>('/auth/me');
      set({ user, token, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },
}));
```

- [ ] **Step 3: Create `packages/client/src/stores/room-store.ts`**

```typescript
import { create } from 'zustand';
import type { RoomSettings } from '@uno-online/shared';

interface RoomPlayer {
  userId: string;
  username: string;
  ready: boolean;
}

interface RoomData {
  ownerId: string;
  status: string;
  settings: RoomSettings;
}

interface RoomState {
  roomCode: string | null;
  players: RoomPlayer[];
  room: RoomData | null;

  setRoom: (roomCode: string, players: RoomPlayer[], room: RoomData | null) => void;
  updateRoom: (data: { players?: RoomPlayer[]; room?: RoomData }) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomCode: null,
  players: [],
  room: null,

  setRoom: (roomCode, players, room) => set({ roomCode, players, room }),
  updateRoom: (data) => set((state) => ({
    players: data.players ?? state.players,
    room: data.room ?? state.room,
  })),
  clearRoom: () => set({ roomCode: null, players: [], room: null }),
}));
```

- [ ] **Step 4: Create `packages/client/src/stores/game-store.ts`**

```typescript
import { create } from 'zustand';
import type { Card, Color } from '@uno-online/shared';

interface PlayerInfo {
  id: string;
  name: string;
  hand: Card[];
  handCount: number;
  score: number;
  connected: boolean;
  calledUno: boolean;
}

interface GameState {
  phase: string | null;
  players: PlayerInfo[];
  currentPlayerIndex: number;
  direction: 'clockwise' | 'counter_clockwise';
  discardPile: Card[];
  currentColor: Color | null;
  drawStack: number;
  deckCount: number;
  roundNumber: number;
  winnerId: string | null;
  pendingDrawPlayerId: string | null;
  settings: { turnTimeLimit: number; targetScore: number } | null;

  turnEndTime: number | null;
  lastDrawnCard: Card | null;
  hasDrawnThisTurn: boolean;

  setGameState: (view: Record<string, unknown>) => void;
  setDrawnCard: (card: Card | null) => void;
  setHasDrawn: (v: boolean) => void;
  setTurnEndTime: (t: number | null) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: null,
  players: [],
  currentPlayerIndex: 0,
  direction: 'clockwise',
  discardPile: [],
  currentColor: null,
  drawStack: 0,
  deckCount: 0,
  roundNumber: 0,
  winnerId: null,
  pendingDrawPlayerId: null,
  settings: null,

  turnEndTime: null,
  lastDrawnCard: null,
  hasDrawnThisTurn: false,

  setGameState: (view) => set({
    phase: view.phase as string,
    players: view.players as PlayerInfo[],
    currentPlayerIndex: view.currentPlayerIndex as number,
    direction: view.direction as 'clockwise' | 'counter_clockwise',
    discardPile: view.discardPile as Card[],
    currentColor: view.currentColor as Color | null,
    drawStack: view.drawStack as number,
    deckCount: view.deckCount as number,
    roundNumber: view.roundNumber as number,
    winnerId: view.winnerId as string | null,
    pendingDrawPlayerId: view.pendingDrawPlayerId as string | null,
    settings: view.settings as { turnTimeLimit: number; targetScore: number },
    hasDrawnThisTurn: false,
    lastDrawnCard: null,
  }),

  setDrawnCard: (card) => set({ lastDrawnCard: card, hasDrawnThisTurn: true }),
  setHasDrawn: (v) => set({ hasDrawnThisTurn: v }),
  setTurnEndTime: (t) => set({ turnEndTime: t }),
  clearGame: () => set({
    phase: null, players: [], currentPlayerIndex: 0, direction: 'clockwise',
    discardPile: [], currentColor: null, drawStack: 0, deckCount: 0,
    roundNumber: 0, winnerId: null, pendingDrawPlayerId: null, settings: null,
    turnEndTime: null, lastDrawnCard: null, hasDrawnThisTurn: false,
  }),
}));
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/stores/ packages/client/src/api.ts
git commit -m "feat: add Zustand stores (auth, room, game) and API helpers"
```

---

### Task 4: Socket.IO Client

**Files:**
- Create: `packages/client/src/socket.ts`

- [ ] **Step 1: Create `packages/client/src/socket.ts`**

```typescript
import { io, Socket } from 'socket.io-client';
import { API_URL } from './env.js';
import { useGameStore } from './stores/game-store.js';
import { useRoomStore } from './stores/room-store.js';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('token');
    socket = io(API_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('room:updated', (data) => {
      useRoomStore.getState().updateRoom(data);
    });

    socket.on('game:state', (view) => {
      useGameStore.getState().setGameState(view);
      const settings = view.settings;
      if (settings) {
        useGameStore.getState().setTurnEndTime(Date.now() + settings.turnTimeLimit * 1000);
      }
    });

    socket.on('game:update', (view) => {
      useGameStore.getState().setGameState(view);
      const settings = view.settings;
      if (settings) {
        useGameStore.getState().setTurnEndTime(Date.now() + settings.turnTimeLimit * 1000);
      }
    });

    socket.on('game:card_drawn', (data: { card: unknown }) => {
      useGameStore.getState().setDrawnCard(data.card as any);
    });

    socket.on('game:action_rejected', (data) => {
      console.warn('Action rejected:', data);
    });

    socket.on('player:timeout', (data) => {
      console.log('Player timed out:', data.playerId);
    });

    socket.on('player:disconnected', (data) => {
      console.log('Player disconnected:', data.playerId);
    });

    socket.on('player:reconnected', (data) => {
      console.log('Player reconnected:', data.playerId);
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/socket.ts
git commit -m "feat: add Socket.IO client with game state listeners"
```

---

### Task 5: Card Component

**Files:**
- Create: `packages/client/src/components/Card.tsx`
- Create: `packages/client/src/components/CardBack.tsx`

- [ ] **Step 1: Create `packages/client/src/components/Card.tsx`**

```tsx
import type { Card as CardType } from '@uno-online/shared';
import '../styles/cards.css';

const COLOR_SYMBOLS: Record<string, string> = {
  red: '♦',
  blue: '♠',
  green: '♣',
  yellow: '♥',
};

function getCardLabel(card: CardType): string {
  switch (card.type) {
    case 'number': return String(card.value);
    case 'skip': return '⊘';
    case 'reverse': return '⟲';
    case 'draw_two': return '+2';
    case 'wild': return 'W';
    case 'wild_draw_four': return '+4';
  }
}

function getColorClass(card: CardType): string {
  if (card.type === 'wild' || card.type === 'wild_draw_four') return 'card--wild';
  return `card--${card.color}`;
}

interface CardProps {
  card: CardType;
  playable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function Card({ card, playable = false, onClick, style }: CardProps) {
  const colorClass = getColorClass(card);
  const typeClass = `card--${card.type}`;
  const playableClass = playable ? 'card--playable' : '';

  return (
    <div
      className={`card ${colorClass} ${typeClass} ${playableClass}`}
      onClick={playable ? onClick : undefined}
      style={style}
    >
      {card.color && (
        <span className="card__symbol">{COLOR_SYMBOLS[card.color]}</span>
      )}
      <span className="card__value">{getCardLabel(card)}</span>
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/client/src/components/CardBack.tsx`**

```tsx
import '../styles/cards.css';

interface CardBackProps {
  small?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function CardBack({ small = false, onClick, style }: CardBackProps) {
  return (
    <div
      className={`card-back ${small ? 'card-back--small' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      {!small && 'UNO'}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/Card.tsx packages/client/src/components/CardBack.tsx
git commit -m "feat: add Card and CardBack components with cartoon styling"
```

---

### Task 6: Game UI Components

**Files:**
- Create: `packages/client/src/components/PlayerHand.tsx`
- Create: `packages/client/src/components/OpponentRow.tsx`
- Create: `packages/client/src/components/DiscardPile.tsx`
- Create: `packages/client/src/components/DrawPile.tsx`
- Create: `packages/client/src/components/DirectionIndicator.tsx`
- Create: `packages/client/src/components/ColorPicker.tsx`
- Create: `packages/client/src/components/GameActions.tsx`
- Create: `packages/client/src/components/TopBar.tsx`
- Create: `packages/client/src/components/TurnTimer.tsx`
- Create: `packages/client/src/components/ScoreBoard.tsx`
- Create: `packages/client/src/components/ChatBox.tsx`
- Create: `packages/client/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: Create `packages/client/src/components/PlayerHand.tsx`**

```tsx
import { useMemo } from 'react';
import type { Card as CardType } from '@uno-online/shared';
import { getPlayableCards } from '@uno-online/shared';
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import '../styles/game.css';

interface PlayerHandProps {
  onPlayCard: (cardId: string) => void;
}

export default function PlayerHand({ onPlayCard }: PlayerHandProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const phase = useGameStore((s) => s.phase);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const topCard = discardPile[discardPile.length - 1];

  const playableIds = useMemo(() => {
    if (!isMyTurn || !topCard || !currentColor || phase !== 'playing') return new Set<string>();
    const playable = getPlayableCards(me?.hand ?? [], topCard, currentColor);
    return new Set(playable.map((c) => c.id));
  }, [me?.hand, topCard, currentColor, isMyTurn, phase]);

  if (!me) return null;

  return (
    <div className="player-hand">
      <div className="player-hand__cards">
        {me.hand.map((card, i) => {
          const angle = (i - (me.hand.length - 1) / 2) * 4;
          return (
            <Card
              key={card.id}
              card={card}
              playable={playableIds.has(card.id)}
              onClick={() => onPlayCard(card.id)}
              style={{ transform: `rotate(${angle}deg)` }}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/client/src/components/OpponentRow.tsx`**

```tsx
import CardBack from './CardBack.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import '../styles/game.css';

const AVATAR_COLORS = ['#ff3366', '#33cc66', '#4488ff', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1'];
const AVATAR_EMOJIS = ['😎', '🤠', '😺', '🐸', '🦊', '🐱', '🐶', '🦁', '🐼'];

export default function OpponentRow() {
  const userId = useAuthStore((s) => s.user?.id);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);

  const opponents = players.filter((p) => p.id !== userId);

  return (
    <div className="opponent-row">
      {opponents.map((opp, i) => {
        const isActive = players[currentPlayerIndex]?.id === opp.id;
        return (
          <div key={opp.id} className="opponent">
            <div
              className={`opponent__avatar ${isActive ? 'opponent__avatar--active' : ''}`}
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
            >
              {AVATAR_EMOJIS[i % AVATAR_EMOJIS.length]}
            </div>
            <span className={`opponent__name ${isActive ? 'opponent__name--active' : ''}`}>
              {opp.name} {isActive ? '◀' : ''}
            </span>
            <div className="opponent__cards">
              {Array.from({ length: Math.min(opp.handCount, 10) }).map((_, j) => (
                <CardBack key={j} small />
              ))}
            </div>
            <span className="opponent__count">{opp.handCount}张</span>
            {!opp.connected && <span style={{ fontSize: 10, color: '#ef4444' }}>掉线</span>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `packages/client/src/components/DiscardPile.tsx`**

```tsx
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';

export default function DiscardPile() {
  const discardPile = useGameStore((s) => s.discardPile);
  const topCard = discardPile[discardPile.length - 1];

  if (!topCard) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
      <Card card={topCard} style={{ transform: 'rotate(3deg)' }} />
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>弃牌堆</span>
    </div>
  );
}
```

- [ ] **Step 4: Create `packages/client/src/components/DrawPile.tsx`**

```tsx
import CardBack from './CardBack.js';
import { useGameStore } from '../stores/game-store.js';

interface DrawPileProps {
  onDraw: () => void;
}

export default function DrawPile({ onDraw }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
      <CardBack onClick={onDraw} style={{ cursor: 'pointer' }} />
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>牌堆 ({deckCount})</span>
    </div>
  );
}
```

- [ ] **Step 5: Create `packages/client/src/components/DirectionIndicator.tsx`**

```tsx
import { useGameStore } from '../stores/game-store.js';
import '../styles/game.css';

export default function DirectionIndicator() {
  const direction = useGameStore((s) => s.direction);
  return (
    <div className="direction-ring">
      <span className="direction-ring__arrow">
        {direction === 'clockwise' ? '↻' : '↺'}
      </span>
    </div>
  );
}
```

- [ ] **Step 6: Create `packages/client/src/components/ColorPicker.tsx`**

```tsx
import type { Color } from '@uno-online/shared';

const COLORS: { color: Color; bg: string; label: string }[] = [
  { color: 'red', bg: 'var(--color-red)', label: '红' },
  { color: 'blue', bg: 'var(--color-blue)', label: '蓝' },
  { color: 'green', bg: 'var(--color-green)', label: '绿' },
  { color: 'yellow', bg: 'var(--color-yellow)', label: '黄' },
];

interface ColorPickerProps {
  onPick: (color: Color) => void;
}

export default function ColorPicker({ onPick }: ColorPickerProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 20, padding: '24px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        <h3 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)' }}>选择颜色</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          {COLORS.map(({ color, bg, label }) => (
            <button
              key={color}
              onClick={() => onPick(color)}
              style={{
                width: 60, height: 60, borderRadius: '50%', background: bg, border: '3px solid white',
                fontSize: 18, fontWeight: 'bold', color: 'white', cursor: 'pointer',
                boxShadow: 'var(--card-shadow)', fontFamily: 'var(--font-game)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `packages/client/src/components/GameActions.tsx`**

```tsx
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import '../styles/game.css';

interface GameActionsProps {
  onCallUno: () => void;
  onCatchUno: (targetId: string) => void;
  onChallenge: () => void;
  onAccept: () => void;
  onPass: () => void;
}

export default function GameActions({ onCallUno, onCatchUno, onChallenge, onAccept, onPass }: GameActionsProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const pendingDrawPlayerId = useGameStore((s) => s.pendingDrawPlayerId);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const catchTargets = players.filter((p) => p.id !== userId && p.handCount === 1 && !p.calledUno);

  return (
    <div className="game-actions">
      {me && me.hand.length <= 2 && !me.calledUno && (
        <button className="btn-primary" onClick={onCallUno}>喊 UNO!</button>
      )}

      {catchTargets.map((t) => (
        <button key={t.id} className="btn-danger" onClick={() => onCatchUno(t.id)}>
          抓 {t.name}!
        </button>
      ))}

      {phase === 'challenging' && pendingDrawPlayerId === userId && (
        <>
          <button className="btn-danger" onClick={onChallenge}>质疑!</button>
          <button className="btn-secondary" onClick={onAccept}>接受</button>
        </>
      )}

      {isMyTurn && hasDrawnThisTurn && phase === 'playing' && (
        <button className="btn-secondary" onClick={onPass}>跳过</button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create `packages/client/src/components/TopBar.tsx`**

```tsx
import TurnTimer from './TurnTimer.js';
import '../styles/game.css';

interface TopBarProps {
  roomCode: string;
}

export default function TopBar({ roomCode }: TopBarProps) {
  return (
    <div className="game-topbar">
      <div className="game-topbar__left">
        <span className="game-topbar__brand">🎴 UNO Online</span>
        <span style={{ color: 'var(--text-secondary)' }}>房间: {roomCode}</span>
      </div>
      <div className="game-topbar__right">
        <TurnTimer />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create `packages/client/src/components/TurnTimer.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/game-store.js';

export default function TurnTimer() {
  const turnEndTime = useGameStore((s) => s.turnEndTime);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!turnEndTime) { setSecondsLeft(null); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((turnEndTime - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [turnEndTime]);

  if (secondsLeft === null) return null;

  const isWarning = secondsLeft <= 10;
  return (
    <span style={{
      color: isWarning ? 'var(--color-red)' : 'var(--text-secondary)',
      fontWeight: isWarning ? 'bold' : 'normal',
      animation: isWarning ? 'pulse 1s infinite' : 'none',
    }}>
      ⏱ {secondsLeft}s
    </span>
  );
}
```

- [ ] **Step 10: Create `packages/client/src/components/ScoreBoard.tsx`**

```tsx
import { useGameStore } from '../stores/game-store.js';

interface ScoreBoardProps {
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export default function ScoreBoard({ onPlayAgain, onBackToLobby }: ScoreBoardProps) {
  const players = useGameStore((s) => s.players);
  const winnerId = useGameStore((s) => s.winnerId);
  const phase = useGameStore((s) => s.phase);

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const isGameOver = phase === 'game_over';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 20, padding: '32px 40px',
        minWidth: 300, textAlign: 'center',
      }}>
        <h2 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)', marginBottom: 16 }}>
          {isGameOver ? '🎉 游戏结束!' : '📊 本轮结束'}
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>玩家</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>分数</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} style={{ color: p.id === winnerId ? 'var(--text-accent)' : 'var(--text-primary)' }}>
                <td style={{ padding: '6px 8px', textAlign: 'left' }}>
                  {p.id === winnerId && '👑 '}{p.name}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {!isGameOver && <button className="btn-primary" onClick={onPlayAgain}>继续下一轮</button>}
          <button className="btn-secondary" onClick={onBackToLobby}>返回大厅</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Create `packages/client/src/components/ChatBox.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../socket.js';

interface ChatMessage {
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

export default function ChatBox() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();
    const handler = (msg: ChatMessage) => {
      setMessages((prev) => [...prev.slice(-50), msg]);
    };
    socket.on('chat:message', handler);
    return () => { socket.off('chat:message', handler); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    getSocket().emit('chat:message', { text: input.trim() });
    setInput('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 100, right: 12, width: 40, height: 40,
          borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.2)',
          color: 'var(--text-primary)', fontSize: 18, cursor: 'pointer', zIndex: 50,
        }}
      >
        💬
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 100, right: 12, width: 280, height: 320,
      background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
      display: 'flex', flexDirection: 'column', zIndex: 50, overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', background: 'var(--bg-surface)', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 'bold' }}>聊天</span>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer',
        }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, fontSize: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <span style={{ color: 'var(--text-accent)', fontWeight: 'bold' }}>{m.username}: </span>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', padding: 6, gap: 4 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="发送消息..."
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
            background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12,
          }}
        />
        <button onClick={send} className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }}>
          发送
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Create `packages/client/src/components/ProtectedRoute.tsx`**

```tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 13: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 14: Commit**

```bash
git add packages/client/src/components/
git commit -m "feat: add game UI components (hand, opponents, piles, actions, chat)"
```

---

### Task 7: Pages (Home, Auth Callback, Lobby, Room, Game, Profile)

**Files:**
- Create: `packages/client/src/pages/HomePage.tsx`
- Create: `packages/client/src/pages/AuthCallback.tsx`
- Create: `packages/client/src/pages/LobbyPage.tsx`
- Create: `packages/client/src/pages/RoomPage.tsx`
- Create: `packages/client/src/pages/GamePage.tsx`
- Create: `packages/client/src/pages/ProfilePage.tsx`
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Create `packages/client/src/pages/HomePage.tsx`**

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';
import { GITHUB_CLIENT_ID } from '../env.js';

export default function HomePage() {
  const { user, token, loading, loadUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => { loadUser(); }, [loadUser]);
  useEffect(() => { if (user) navigate('/lobby'); }, [user, navigate]);

  const loginUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user`;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 32, textAlign: 'center', padding: 20,
    }}>
      <h1 style={{
        fontFamily: 'var(--font-game)', fontSize: 48, color: 'var(--text-accent)',
        textShadow: '3px 4px 0px rgba(0,0,0,0.3)',
      }}>
        🎴 UNO Online
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 18, maxWidth: 400 }}>
        和朋友一起玩 UNO！支持 2-10 人在线对战、语音通话、自定义村规。
      </p>
      {!loading && !token && (
        <a href={loginUrl} className="btn-primary" style={{
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 18, padding: '14px 32px',
        }}>
          🐙 GitHub 登录
        </a>
      )}
      {loading && <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `packages/client/src/pages/AuthCallback.tsx`**

```tsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  useEffect(() => {
    const code = params.get('code');
    if (!code) { navigate('/'); return; }
    login(code).then(() => navigate('/lobby')).catch(() => navigate('/'));
  }, [params, login, navigate]);

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 18 }}>登录中...</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `packages/client/src/pages/LobbyPage.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';
import { useRoomStore } from '../stores/room-store.js';
import { getSocket, connectSocket } from '../socket.js';

export default function LobbyPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setRoom = useRoomStore((s) => s.setRoom);
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  const handleCreate = () => {
    connectSocket();
    getSocket().emit('room:create', {}, (res: any) => {
      if (res.success) {
        setRoom(res.roomCode, res.players, null);
        navigate(`/room/${res.roomCode}`);
      }
    });
  };

  const handleJoin = () => {
    if (joinCode.length !== 6) { setError('请输入 6 位房间码'); return; }
    connectSocket();
    getSocket().emit('room:join', joinCode.toUpperCase(), (res: any) => {
      if (res.success) {
        setRoom(joinCode.toUpperCase(), res.players, res.room);
        navigate(`/room/${joinCode.toUpperCase()}`);
      } else {
        setError(res.error || '加入失败');
      }
    });
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 32, padding: 20,
    }}>
      <h1 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)', fontSize: 32 }}>
        🎴 游戏大厅
      </h1>
      <p style={{ color: 'var(--text-secondary)' }}>欢迎, {user?.username}!</p>

      <button className="btn-primary" onClick={handleCreate} style={{ fontSize: 20, padding: '16px 40px' }}>
        创建房间
      </button>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={joinCode}
          onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
          placeholder="输入房间码"
          maxLength={6}
          style={{
            padding: '12px 16px', borderRadius: 12, border: '2px solid rgba(255,255,255,0.2)',
            background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 18,
            textAlign: 'center', width: 160, letterSpacing: 4, textTransform: 'uppercase',
          }}
        />
        <button className="btn-primary" onClick={handleJoin}>加入</button>
      </div>

      {error && <p style={{ color: 'var(--color-red)', fontSize: 14 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button className="btn-secondary" onClick={() => navigate('/profile')}>个人信息</button>
        <button className="btn-secondary" onClick={() => { logout(); navigate('/'); }}>退出登录</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `packages/client/src/pages/RoomPage.tsx`**

```tsx
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';
import { useRoomStore } from '../stores/room-store.js';
import { useGameStore } from '../stores/game-store.js';
import { getSocket, connectSocket } from '../socket.js';

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const user = useAuthStore((s) => s.user);
  const { players, room, updateRoom, clearRoom } = useRoomStore();
  const setGameState = useGameStore((s) => s.setGameState);
  const navigate = useNavigate();

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    const onState = (view: any) => {
      setGameState(view);
      navigate(`/game/${roomCode}`);
    };
    socket.on('game:state', onState);
    return () => { socket.off('game:state', onState); };
  }, [roomCode, navigate, setGameState]);

  const isOwner = room?.ownerId === user?.id;
  const myPlayer = players.find((p) => p.userId === user?.id);
  const allReady = players.length >= 2 && players.every((p) => p.ready);

  const toggleReady = () => {
    getSocket().emit('room:ready', !myPlayer?.ready, () => {});
  };

  const startGame = () => {
    getSocket().emit('game:start', (res: any) => {
      if (!res.success) alert(res.error);
    });
  };

  const leaveRoom = () => {
    getSocket().emit('room:leave', () => {
      clearRoom();
      navigate('/lobby');
    });
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 24, padding: 20,
    }}>
      <h2 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)' }}>
        房间 {roomCode}
      </h2>

      <div style={{
        background: 'var(--bg-surface)', borderRadius: 16, padding: 20, minWidth: 300,
      }}>
        <h3 style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
          玩家 ({players.length}/10)
        </h3>
        {players.map((p) => (
          <div key={p.userId} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <span>
              {p.username}
              {room?.ownerId === p.userId && ' 👑'}
            </span>
            <span style={{
              color: p.ready ? 'var(--color-green)' : 'var(--text-secondary)',
              fontSize: 12,
            }}>
              {p.ready ? '✓ 已准备' : '未准备'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-primary" onClick={toggleReady}>
          {myPlayer?.ready ? '取消准备' : '准备'}
        </button>
        {isOwner && (
          <button
            className="btn-primary"
            onClick={startGame}
            style={{ opacity: allReady ? 1 : 0.5 }}
            disabled={!allReady}
          >
            开始游戏
          </button>
        )}
        <button className="btn-danger" onClick={leaveRoom}>离开房间</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `packages/client/src/pages/GamePage.tsx`**

```tsx
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Color } from '@uno-online/shared';
import { isWildCard } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import { getSocket } from '../socket.js';
import TopBar from '../components/TopBar.js';
import OpponentRow from '../components/OpponentRow.js';
import DirectionIndicator from '../components/DirectionIndicator.js';
import DrawPile from '../components/DrawPile.js';
import DiscardPile from '../components/DiscardPile.js';
import GameActions from '../components/GameActions.js';
import PlayerHand from '../components/PlayerHand.js';
import ColorPicker from '../components/ColorPicker.js';
import ScoreBoard from '../components/ScoreBoard.js';
import ChatBox from '../components/ChatBox.js';
import '../styles/game.css';

export default function GamePage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const phase = useGameStore((s) => s.phase);
  const userId = useAuthStore((s) => s.user?.id);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);

  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const needsColorPick = phase === 'choosing_color' && isMyTurn;
  const showScoreBoard = phase === 'round_end' || phase === 'game_over';

  const playCard = useCallback((cardId: string) => {
    const me = players.find((p) => p.id === userId);
    const card = me?.hand.find((c) => c.id === cardId);
    if (!card) return;

    if (isWildCard(card)) {
      getSocket().emit('game:play_card', { cardId }, () => {});
    } else {
      getSocket().emit('game:play_card', { cardId }, () => {});
    }
  }, [players, userId]);

  const drawCard = useCallback(() => {
    getSocket().emit('game:draw_card', () => {});
  }, []);

  const chooseColor = useCallback((color: Color) => {
    getSocket().emit('game:choose_color', { color }, () => {});
  }, []);

  const callUno = useCallback(() => {
    getSocket().emit('game:call_uno', () => {});
  }, []);

  const catchUno = useCallback((targetId: string) => {
    getSocket().emit('game:catch_uno', { targetPlayerId: targetId }, () => {});
  }, []);

  const challenge = useCallback(() => {
    getSocket().emit('game:challenge', () => {});
  }, []);

  const accept = useCallback(() => {
    getSocket().emit('game:accept', () => {});
  }, []);

  const pass = useCallback(() => {
    getSocket().emit('game:pass', () => {});
  }, []);

  if (!phase) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-secondary)' }}>加载游戏中...</p>
    </div>;
  }

  return (
    <div className="game-layout">
      <TopBar roomCode={roomCode ?? ''} />
      <OpponentRow />
      <div className="game-center">
        <DirectionIndicator />
        <DrawPile onDraw={drawCard} />
        <DiscardPile />
      </div>
      <GameActions
        onCallUno={callUno}
        onCatchUno={catchUno}
        onChallenge={challenge}
        onAccept={accept}
        onPass={pass}
      />
      <PlayerHand onPlayCard={playCard} />
      <ChatBox />

      {needsColorPick && <ColorPicker onPick={chooseColor} />}
      {showScoreBoard && (
        <ScoreBoard
          onPlayAgain={() => {}}
          onBackToLobby={() => navigate('/lobby')}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `packages/client/src/pages/ProfilePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';
import { apiGet } from '../api.js';

interface ProfileData {
  user: { id: string; username: string; avatarUrl: string | null; totalGames: number; totalWins: number };
  recentGames: { id: string; game: { roomCode: string; createdAt: string }; finalScore: number; placement: number }[];
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    apiGet<ProfileData>('/profile').then(setProfile).catch(() => {});
  }, []);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 40, gap: 24,
    }}>
      <h2 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)' }}>个人信息</h2>

      {profile && (
        <>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 20, fontWeight: 'bold' }}>{profile.user.username}</p>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
              总场次: {profile.user.totalGames} | 胜场: {profile.user.totalWins} |
              胜率: {profile.user.totalGames > 0 ? Math.round(profile.user.totalWins / profile.user.totalGames * 100) : 0}%
            </p>
          </div>

          {profile.recentGames.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 16, width: '100%', maxWidth: 500 }}>
              <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>最近对局</h3>
              {profile.recentGames.map((g) => (
                <div key={g.id} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13,
                }}>
                  <span>房间 {g.game.roomCode}</span>
                  <span>第 {g.placement} 名 | {g.finalScore} 分</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button className="btn-secondary" onClick={() => navigate('/lobby')}>返回大厅</button>
    </div>
  );
}
```

- [ ] **Step 7: Update `packages/client/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import AuthCallback from './pages/AuthCallback.js';
import LobbyPage from './pages/LobbyPage.js';
import RoomPage from './pages/RoomPage.js';
import GamePage from './pages/GamePage.js';
import ProfilePage from './pages/ProfilePage.js';
import ProtectedRoute from './components/ProtectedRoute.js';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
        <Route path="/room/:roomCode" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />
        <Route path="/game/:roomCode" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add packages/client/src/pages/ packages/client/src/App.tsx
git commit -m "feat: add all pages (home, auth, lobby, room, game, profile) with routing"
```

---

### Task 8: Build Verification & Dev Server Test

- [ ] **Step 1: Run full monorepo type-check**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
cd /root/uno-online/packages/server && npx tsc --noEmit
cd /root/uno-online/packages/shared && npx tsc --noEmit
```

- [ ] **Step 2: Build client**

```bash
cd /root/uno-online/packages/client && npx vite build
```

- [ ] **Step 3: Run all tests**

```bash
cd /root/uno-online && REDIS_URL="redis://:123456@localhost:6379" pnpm test
```

- [ ] **Step 4: Start dev server and verify page loads**

```bash
cd /root/uno-online/packages/client && npx vite --host 0.0.0.0 &
sleep 3
curl -s http://localhost:5173 | grep "UNO Online"
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: plan 3 complete — client core with game UI"
```
