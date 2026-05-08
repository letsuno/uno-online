# Plan 2: Server Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete game server — auth, room management, WebSocket game loop, turn timers, and disconnect handling — so a client can connect and play a full UNO game.

**Architecture:** Fastify HTTP server with Socket.IO for real-time game communication. PostgreSQL (via Prisma) persists users and game records. Redis stores ephemeral game state (rooms, hands, deck). The shared rules engine (`@uno-online/shared`) is the single source of truth for all game logic — the server calls `applyAction()` and broadcasts results.

**Tech Stack:** Fastify, Socket.IO, Prisma, PostgreSQL, Redis (ioredis), jsonwebtoken, @octokit/oauth-app, Vitest

---

## File Structure

```
packages/server/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts                  # Entry point: start server
│   ├── app.ts                    # Create & configure Fastify + Socket.IO
│   ├── config.ts                 # Env var loading + validation
│   ├── auth/
│   │   ├── github.ts             # GitHub OAuth flow (redirect + callback)
│   │   ├── jwt.ts                # JWT sign/verify helpers
│   │   └── middleware.ts         # Fastify auth hook + Socket.IO auth
│   ├── db/
│   │   ├── prisma.ts             # Prisma client singleton
│   │   └── user-repo.ts          # User CRUD (findOrCreate, getProfile)
│   ├── redis/
│   │   └── client.ts             # Redis client singleton
│   ├── room/
│   │   ├── room-manager.ts       # Create/join/leave rooms, ready state, room code gen
│   │   └── room-store.ts         # Redis-backed room persistence
│   ├── game/
│   │   ├── game-session.ts       # In-memory game state wrapper, apply actions, state views
│   │   ├── game-store.ts         # Serialize/deserialize GameState to/from Redis
│   │   └── turn-timer.ts         # Per-room turn countdown, auto-draw on timeout
│   ├── ws/
│   │   ├── socket-handler.ts     # Socket.IO connection handler (auth, join room, dispatch)
│   │   ├── room-events.ts        # room:create, room:join, room:leave, game:start handlers
│   │   └── game-events.ts        # game:play_card, draw_card, call_uno, etc. handlers
│   └── api/
│       ├── auth-routes.ts        # GET /auth/github, GET /auth/callback, GET /auth/me
│       └── profile-routes.ts     # GET /profile (stats, game history)
└── tests/
    ├── helpers/
    │   └── test-utils.ts         # Helpers for creating test fixtures
    ├── auth/
    │   └── jwt.test.ts
    ├── room/
    │   ├── room-manager.test.ts
    │   └── room-store.test.ts
    ├── game/
    │   ├── game-session.test.ts
    │   ├── game-store.test.ts
    │   └── turn-timer.test.ts
    └── ws/
        └── game-events.test.ts
```

---

### Task 1: Server Package Scaffold

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/.env.example`
- Create: `packages/server/src/config.ts`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/app.ts`

- [ ] **Step 1: Create `packages/server/package.json`**

```json
{
  "name": "@uno-online/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@uno-online/shared": "workspace:*",
    "fastify": "^5.3.0",
    "@fastify/cors": "^11.0.0",
    "@fastify/cookie": "^11.0.0",
    "socket.io": "^4.8.0",
    "ioredis": "^5.6.0",
    "@prisma/client": "^6.9.0",
    "jsonwebtoken": "^9.0.2",
    "@octokit/oauth-app": "^7.1.0",
    "nanoid": "^5.1.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0",
    "tsx": "^4.19.0",
    "prisma": "^6.9.0",
    "@types/jsonwebtoken": "^9.0.9"
  }
}
```

- [ ] **Step 2: Create `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `packages/server/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create `packages/server/.env.example`**

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uno_online
REDIS_URL=redis://localhost:6379
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
JWT_SECRET=your_jwt_secret_at_least_32_chars_long
CLIENT_URL=http://localhost:5173
PORT=3001
```

- [ ] **Step 5: Create `packages/server/src/config.ts`**

```typescript
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface Config {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  githubClientId: string;
  githubClientSecret: string;
  jwtSecret: string;
  clientUrl: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    githubClientId: required('GITHUB_CLIENT_ID'),
    githubClientSecret: required('GITHUB_CLIENT_SECRET'),
    jwtSecret: required('JWT_SECRET'),
    clientUrl: process.env['CLIENT_URL'] ?? 'http://localhost:5173',
  };
}
```

- [ ] **Step 6: Create `packages/server/src/app.ts`**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './config.js';

export async function createApp(config: Config) {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: config.clientUrl,
    credentials: true,
  });

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
  });

  fastify.decorate('io', io);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return { fastify, io };
}
```

- [ ] **Step 7: Create `packages/server/src/index.ts`**

```typescript
import { loadConfig } from './config.js';
import { createApp } from './app.js';

async function main() {
  const config = loadConfig();
  const { fastify } = await createApp(config);

  await fastify.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

- [ ] **Step 8: Install dependencies**

```bash
cd /root/uno-online && pnpm install
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
git add packages/server/
git commit -m "chore: scaffold server package with Fastify + Socket.IO"
```

---

### Task 2: Prisma Schema & Database Setup

**Files:**
- Create: `packages/server/prisma/schema.prisma`
- Create: `packages/server/src/db/prisma.ts`
- Create: `packages/server/src/db/user-repo.ts`
- Create: `packages/server/tests/helpers/test-utils.ts`

- [ ] **Step 1: Create `packages/server/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id         String       @id @default(uuid())
  githubId   String       @unique
  username   String
  avatarUrl  String?
  totalGames Int          @default(0)
  totalWins  Int          @default(0)
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
  gamePlayers GamePlayer[]
}

model GameRecord {
  id          String       @id @default(uuid())
  roomCode    String
  playerCount Int
  winnerId    String
  rounds      Int
  duration    Int
  createdAt   DateTime     @default(now())
  players     GamePlayer[]
}

model GamePlayer {
  id         String     @id @default(uuid())
  gameId     String
  userId     String
  finalScore Int
  placement  Int
  createdAt  DateTime   @default(now())
  game       GameRecord @relation(fields: [gameId], references: [id])
  user       User       @relation(fields: [userId], references: [id])

  @@index([gameId])
  @@index([userId])
}
```

- [ ] **Step 2: Create `packages/server/src/db/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
```

- [ ] **Step 3: Create `packages/server/src/db/user-repo.ts`**

```typescript
import { getPrisma } from './prisma.js';

export interface GitHubUserData {
  githubId: string;
  username: string;
  avatarUrl: string | null;
}

export async function findOrCreateUser(data: GitHubUserData) {
  const prisma = getPrisma();
  return prisma.user.upsert({
    where: { githubId: data.githubId },
    update: { username: data.username, avatarUrl: data.avatarUrl },
    create: {
      githubId: data.githubId,
      username: data.username,
      avatarUrl: data.avatarUrl,
    },
  });
}

export async function getUserById(id: string) {
  const prisma = getPrisma();
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserProfile(userId: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const recentGames = await prisma.gamePlayer.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { game: true },
  });

  return { user, recentGames };
}

export async function recordGameResult(
  roomCode: string,
  winnerId: string,
  rounds: number,
  duration: number,
  playerResults: { userId: string; finalScore: number; placement: number }[],
) {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const record = await tx.gameRecord.create({
      data: {
        roomCode,
        playerCount: playerResults.length,
        winnerId,
        rounds,
        duration,
        players: {
          create: playerResults.map((p) => ({
            userId: p.userId,
            finalScore: p.finalScore,
            placement: p.placement,
          })),
        },
      },
    });

    for (const p of playerResults) {
      await tx.user.update({
        where: { id: p.userId },
        data: {
          totalGames: { increment: 1 },
          ...(p.userId === winnerId ? { totalWins: { increment: 1 } } : {}),
        },
      });
    }

    return record;
  });
}
```

- [ ] **Step 4: Create `packages/server/tests/helpers/test-utils.ts`**

```typescript
import type { GameState, Player } from '@uno-online/shared';
import type { Card, Color } from '@uno-online/shared';

export function makeCard(
  type: Card['type'],
  color: Color | null,
  extra?: { value?: number; id?: string },
): Card {
  const id = extra?.id ?? `card_${Math.random().toString(36).slice(2, 8)}`;
  switch (type) {
    case 'number': return { id, type, color: color as Color, value: extra?.value ?? 0 };
    case 'skip': return { id, type, color: color as Color };
    case 'reverse': return { id, type, color: color as Color };
    case 'draw_two': return { id, type, color: color as Color };
    case 'wild': return { id, type, color: null };
    case 'wild_draw_four': return { id, type, color: null };
  }
}

export function makePlayer(id: string, hand: Card[] = []): Player {
  return { id, name: `Player_${id}`, hand, score: 0, connected: true, calledUno: false };
}

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    players: [makePlayer('p1'), makePlayer('p2')],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deck: [],
    discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
    currentColor: 'red',
    drawStack: 0,
    pendingDrawPlayerId: null,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    settings: { turnTimeLimit: 30, targetScore: 500 },
    ...overrides,
  };
}
```

- [ ] **Step 5: Generate Prisma client**

```bash
cd /root/uno-online/packages/server && npx prisma generate
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/prisma/ packages/server/src/db/ packages/server/tests/
git commit -m "feat: add Prisma schema and user repository"
```

---

### Task 3: JWT Auth Module

**Files:**
- Create: `packages/server/src/auth/jwt.ts`
- Create: `packages/server/src/auth/middleware.ts`
- Create: `packages/server/tests/auth/jwt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/tests/auth/jwt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../../src/auth/jwt.js';

const TEST_SECRET = 'test-secret-that-is-at-least-32-chars-long';

describe('JWT', () => {
  it('signs and verifies a token', () => {
    const payload = { userId: 'user-123', username: 'alice' };
    const token = signToken(payload, TEST_SECRET);
    const decoded = verifyToken(token, TEST_SECRET);
    expect(decoded.userId).toBe('user-123');
    expect(decoded.username).toBe('alice');
  });

  it('returns null for invalid token', () => {
    const decoded = verifyToken('garbage-token', TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it('returns null for expired token', () => {
    const payload = { userId: 'user-123', username: 'alice' };
    const token = signToken(payload, TEST_SECRET, '0s');
    const decoded = verifyToken(token, TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it('returns null for wrong secret', () => {
    const payload = { userId: 'user-123', username: 'alice' };
    const token = signToken(payload, TEST_SECRET);
    const decoded = verifyToken(token, 'wrong-secret-that-is-32-chars-lo');
    expect(decoded).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/auth/jwt.test.ts
```

- [ ] **Step 3: Write JWT implementation**

Create `packages/server/src/auth/jwt.ts`:

```typescript
import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  username: string;
}

export function signToken(
  payload: TokenPayload,
  secret: string,
  expiresIn: string = '7d',
): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret) as TokenPayload;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write auth middleware**

Create `packages/server/src/auth/middleware.ts`:

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Socket } from 'socket.io';
import { verifyToken } from './jwt.js';
import type { TokenPayload } from './jwt.js';

export function createAuthHook(jwtSecret: string) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing authorization header' });
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token, jwtSecret);
    if (!payload) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    (request as FastifyRequest & { user: TokenPayload }).user = payload;
  };
}

export function authenticateSocket(
  socket: Socket,
  jwtSecret: string,
): TokenPayload | null {
  const token = socket.handshake.auth?.['token'] as string | undefined;
  if (!token) return null;
  return verifyToken(token, jwtSecret);
}
```

- [ ] **Step 5: Run tests**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/auth/jwt.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/auth/ packages/server/tests/auth/
git commit -m "feat: add JWT auth module with sign/verify and middleware"
```

---

### Task 4: GitHub OAuth Routes

**Files:**
- Create: `packages/server/src/auth/github.ts`
- Create: `packages/server/src/api/auth-routes.ts`

- [ ] **Step 1: Create `packages/server/src/auth/github.ts`**

```typescript
import type { Config } from '../config.js';

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

export async function exchangeCodeForToken(
  code: string,
  config: Config,
): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
    }),
  });

  const data = (await response.json()) as GitHubTokenResponse;
  if (!data.access_token) {
    throw new Error('Failed to exchange code for GitHub token');
  }
  return data.access_token;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user');
  }

  return response.json() as Promise<GitHubUser>;
}
```

- [ ] **Step 2: Create `packages/server/src/api/auth-routes.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { exchangeCodeForToken, fetchGitHubUser } from '../auth/github.js';
import { signToken } from '../auth/jwt.js';
import { findOrCreateUser } from '../db/user-repo.js';

export async function registerAuthRoutes(fastify: FastifyInstance, config: Config) {
  fastify.get('/auth/github', async (_request, reply) => {
    const params = new URLSearchParams({
      client_id: config.githubClientId,
      redirect_uri: `${config.clientUrl}/auth/callback`,
      scope: 'read:user',
    });
    return reply.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  fastify.post<{ Body: { code: string } }>('/auth/callback', async (request, reply) => {
    const { code } = request.body;
    if (!code) {
      return reply.code(400).send({ error: 'Missing code parameter' });
    }

    const accessToken = await exchangeCodeForToken(code, config);
    const githubUser = await fetchGitHubUser(accessToken);

    const user = await findOrCreateUser({
      githubId: String(githubUser.id),
      username: githubUser.login,
      avatarUrl: githubUser.avatar_url,
    });

    const token = signToken(
      { userId: user.id, username: user.username },
      config.jwtSecret,
    );

    return { token, user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } };
  });

  fastify.get('/auth/me', {
    preHandler: async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const { verifyToken } = await import('../auth/jwt.js');
      const payload = verifyToken(authHeader.slice(7), config.jwtSecret);
      if (!payload) {
        return reply.code(401).send({ error: 'Invalid token' });
      }
      (request as any).user = payload;
    },
  }, async (request) => {
    const { userId } = (request as any).user;
    const { getUserById } = await import('../db/user-repo.js');
    const user = await getUserById(userId);
    if (!user) return { error: 'User not found' };
    return { id: user.id, username: user.username, avatarUrl: user.avatarUrl };
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/auth/github.ts packages/server/src/api/auth-routes.ts
git commit -m "feat: add GitHub OAuth flow and auth API routes"
```

---

### Task 5: Redis Client & Room Store

**Files:**
- Create: `packages/server/src/redis/client.ts`
- Create: `packages/server/src/room/room-store.ts`
- Create: `packages/server/tests/room/room-store.test.ts`

- [ ] **Step 1: Create `packages/server/src/redis/client.ts`**

```typescript
import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(url?: string): Redis {
  if (!redis) {
    redis = new Redis(url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
    });
  }
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
```

- [ ] **Step 2: Write room store tests**

Create `packages/server/tests/room/room-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Redis from 'ioredis';
import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  getRoomPlayers,
  setPlayerReady,
  deleteRoom,
} from '../../src/room/room-store.js';

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
const TEST_CODE = 'TEST01';

beforeEach(async () => {
  const keys = await redis.keys(`room:${TEST_CODE}*`);
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  const keys = await redis.keys(`room:${TEST_CODE}*`);
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

describe('room-store', () => {
  it('creates and retrieves a room', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    const room = await getRoom(redis, TEST_CODE);
    expect(room).not.toBeNull();
    expect(room!.ownerId).toBe('owner-1');
    expect(room!.status).toBe('waiting');
  });

  it('adds and lists players', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p1', username: 'Alice' });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p2', username: 'Bob' });

    const players = await getRoomPlayers(redis, TEST_CODE);
    expect(players).toHaveLength(2);
    expect(players[0]!.userId).toBe('p1');
    expect(players[1]!.userId).toBe('p2');
  });

  it('removes a player', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p1', username: 'Alice' });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p2', username: 'Bob' });

    await removePlayerFromRoom(redis, TEST_CODE, 'p1');
    const players = await getRoomPlayers(redis, TEST_CODE);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('p2');
  });

  it('sets player ready', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p1', username: 'Alice' });

    await setPlayerReady(redis, TEST_CODE, 'p1', true);
    const players = await getRoomPlayers(redis, TEST_CODE);
    expect(players[0]!.ready).toBe(true);
  });

  it('deletes a room and its players', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p1', username: 'Alice' });

    await deleteRoom(redis, TEST_CODE);
    const room = await getRoom(redis, TEST_CODE);
    expect(room).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/room/room-store.test.ts
```

- [ ] **Step 4: Write room store implementation**

Create `packages/server/src/room/room-store.ts`:

```typescript
import type Redis from 'ioredis';
import type { RoomSettings } from '@uno-online/shared';

export interface RoomData {
  ownerId: string;
  status: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;
  createdAt: string;
}

export interface RoomPlayer {
  userId: string;
  username: string;
  ready: boolean;
}

export async function createRoom(
  redis: Redis,
  roomCode: string,
  ownerId: string,
  settings: RoomSettings,
): Promise<void> {
  await redis.hset(`room:${roomCode}`, {
    ownerId,
    status: 'waiting',
    settings: JSON.stringify(settings),
    createdAt: new Date().toISOString(),
  });
}

export async function getRoom(redis: Redis, roomCode: string): Promise<RoomData | null> {
  const data = await redis.hgetall(`room:${roomCode}`);
  if (!data || !data['ownerId']) return null;
  return {
    ownerId: data['ownerId'],
    status: data['status'] as RoomData['status'],
    settings: JSON.parse(data['settings']!) as RoomSettings,
    createdAt: data['createdAt']!,
  };
}

export async function setRoomStatus(
  redis: Redis,
  roomCode: string,
  status: RoomData['status'],
): Promise<void> {
  await redis.hset(`room:${roomCode}`, 'status', status);
}

export async function setRoomOwner(
  redis: Redis,
  roomCode: string,
  ownerId: string,
): Promise<void> {
  await redis.hset(`room:${roomCode}`, 'ownerId', ownerId);
}

export async function addPlayerToRoom(
  redis: Redis,
  roomCode: string,
  player: { userId: string; username: string },
): Promise<void> {
  await redis.rpush(
    `room:${roomCode}:players`,
    JSON.stringify({ userId: player.userId, username: player.username, ready: false }),
  );
}

export async function removePlayerFromRoom(
  redis: Redis,
  roomCode: string,
  userId: string,
): Promise<void> {
  const players = await getRoomPlayers(redis, roomCode);
  await redis.del(`room:${roomCode}:players`);
  const remaining = players.filter((p) => p.userId !== userId);
  if (remaining.length > 0) {
    await redis.rpush(
      `room:${roomCode}:players`,
      ...remaining.map((p) => JSON.stringify(p)),
    );
  }
}

export async function getRoomPlayers(redis: Redis, roomCode: string): Promise<RoomPlayer[]> {
  const raw = await redis.lrange(`room:${roomCode}:players`, 0, -1);
  return raw.map((s) => JSON.parse(s) as RoomPlayer);
}

export async function setPlayerReady(
  redis: Redis,
  roomCode: string,
  userId: string,
  ready: boolean,
): Promise<void> {
  const players = await getRoomPlayers(redis, roomCode);
  const updated = players.map((p) =>
    p.userId === userId ? { ...p, ready } : p,
  );
  await redis.del(`room:${roomCode}:players`);
  if (updated.length > 0) {
    await redis.rpush(
      `room:${roomCode}:players`,
      ...updated.map((p) => JSON.stringify(p)),
    );
  }
}

export async function deleteRoom(redis: Redis, roomCode: string): Promise<void> {
  const keys = await redis.keys(`room:${roomCode}*`);
  if (keys.length > 0) await redis.del(...keys);
  const gameKeys = await redis.keys(`game:${roomCode}*`);
  if (gameKeys.length > 0) await redis.del(...gameKeys);
}
```

- [ ] **Step 5: Run tests**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/room/room-store.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/redis/ packages/server/src/room/room-store.ts packages/server/tests/room/
git commit -m "feat: add Redis client and room store (CRUD + players)"
```

---

### Task 6: Room Manager

**Files:**
- Create: `packages/server/src/room/room-manager.ts`
- Create: `packages/server/tests/room/room-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/tests/room/room-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Redis from 'ioredis';
import { RoomManager } from '../../src/room/room-manager.js';
import { getRoom, getRoomPlayers } from '../../src/room/room-store.js';

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');

beforeEach(async () => {
  const keys = await redis.keys('room:*');
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  const keys = await redis.keys('room:*');
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

describe('RoomManager', () => {
  it('creates a room and returns a 6-char code', async () => {
    const manager = new RoomManager(redis);
    const code = await manager.createRoom('owner-1', 'Alice');
    expect(code).toHaveLength(6);

    const room = await getRoom(redis, code);
    expect(room).not.toBeNull();
    expect(room!.ownerId).toBe('owner-1');

    const players = await getRoomPlayers(redis, code);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('owner-1');
  });

  it('joins an existing room', async () => {
    const manager = new RoomManager(redis);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');

    const players = await getRoomPlayers(redis, code);
    expect(players).toHaveLength(2);
  });

  it('rejects joining a non-existent room', async () => {
    const manager = new RoomManager(redis);
    await expect(manager.joinRoom('NONEXIST', 'p1', 'Alice')).rejects.toThrow('Room not found');
  });

  it('rejects joining when room is full (10 players)', async () => {
    const manager = new RoomManager(redis);
    const code = await manager.createRoom('owner', 'Owner');
    for (let i = 1; i < 10; i++) {
      await manager.joinRoom(code, `p${i}`, `Player${i}`);
    }
    await expect(manager.joinRoom(code, 'p10', 'Player10')).rejects.toThrow('Room is full');
  });

  it('rejects duplicate player', async () => {
    const manager = new RoomManager(redis);
    const code = await manager.createRoom('owner-1', 'Alice');
    await expect(manager.joinRoom(code, 'owner-1', 'Alice')).rejects.toThrow('Already in room');
  });

  it('leaves room and transfers ownership', async () => {
    const manager = new RoomManager(redis);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');

    await manager.leaveRoom(code, 'owner-1');

    const room = await getRoom(redis, code);
    expect(room!.ownerId).toBe('p2');

    const players = await getRoomPlayers(redis, code);
    expect(players).toHaveLength(1);
  });

  it('deletes room when last player leaves', async () => {
    const manager = new RoomManager(redis);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.leaveRoom(code, 'owner-1');

    const room = await getRoom(redis, code);
    expect(room).toBeNull();
  });

  it('checks all players ready', async () => {
    const manager = new RoomManager(redis);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');

    expect(await manager.areAllReady(code)).toBe(false);

    await manager.setReady(code, 'owner-1', true);
    await manager.setReady(code, 'p2', true);

    expect(await manager.areAllReady(code)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/room/room-manager.test.ts
```

- [ ] **Step 3: Write implementation**

Create `packages/server/src/room/room-manager.ts`:

```typescript
import type Redis from 'ioredis';
import type { RoomSettings } from '@uno-online/shared';
import { MAX_PLAYERS, ROOM_CODE_LENGTH, ROOM_CODE_CHARS } from '@uno-online/shared';
import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  getRoomPlayers,
  setPlayerReady,
  setRoomOwner,
  deleteRoom,
} from './room-store.js';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export class RoomManager {
  constructor(private redis: Redis) {}

  async createRoom(
    ownerId: string,
    ownerName: string,
    settings: RoomSettings = { turnTimeLimit: 30, targetScore: 500 },
  ): Promise<string> {
    let code = generateRoomCode();
    let existing = await getRoom(this.redis, code);
    while (existing) {
      code = generateRoomCode();
      existing = await getRoom(this.redis, code);
    }

    await createRoom(this.redis, code, ownerId, settings);
    await addPlayerToRoom(this.redis, code, { userId: ownerId, username: ownerName });
    return code;
  }

  async joinRoom(roomCode: string, userId: string, username: string): Promise<void> {
    const room = await getRoom(this.redis, roomCode);
    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Game already in progress');

    const players = await getRoomPlayers(this.redis, roomCode);
    if (players.some((p) => p.userId === userId)) throw new Error('Already in room');
    if (players.length >= MAX_PLAYERS) throw new Error('Room is full');

    await addPlayerToRoom(this.redis, roomCode, { userId, username });
  }

  async leaveRoom(roomCode: string, userId: string): Promise<{ deleted: boolean }> {
    await removePlayerFromRoom(this.redis, roomCode, userId);
    const players = await getRoomPlayers(this.redis, roomCode);

    if (players.length === 0) {
      await deleteRoom(this.redis, roomCode);
      return { deleted: true };
    }

    const room = await getRoom(this.redis, roomCode);
    if (room && room.ownerId === userId) {
      await setRoomOwner(this.redis, roomCode, players[0]!.userId);
    }

    return { deleted: false };
  }

  async setReady(roomCode: string, userId: string, ready: boolean): Promise<void> {
    await setPlayerReady(this.redis, roomCode, userId, ready);
  }

  async areAllReady(roomCode: string): Promise<boolean> {
    const players = await getRoomPlayers(this.redis, roomCode);
    if (players.length < 2) return false;
    return players.every((p) => p.ready);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/room/room-manager.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/room/room-manager.ts packages/server/tests/room/room-manager.test.ts
git commit -m "feat: add room manager (create, join, leave, ready check)"
```

---

### Task 7: Game Session & Game Store

**Files:**
- Create: `packages/server/src/game/game-session.ts`
- Create: `packages/server/src/game/game-store.ts`
- Create: `packages/server/tests/game/game-session.test.ts`
- Create: `packages/server/tests/game/game-store.test.ts`

- [ ] **Step 1: Write game session tests**

Create `packages/server/tests/game/game-session.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GameSession } from '../../src/game/game-session.js';

describe('GameSession', () => {
  it('initializes a game with players', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const state = session.getFullState();
    expect(state.players).toHaveLength(2);
    expect(state.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
  });

  it('returns sanitized state for a specific player', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const view = session.getPlayerView('p1');
    expect(view.players[0]!.hand.length).toBeGreaterThan(0);
    expect(view.players[1]!.hand).toEqual([]);
    expect(view.players[1]!.handCount).toBeGreaterThan(0);
    expect(view.deck).toBeUndefined();
  });

  it('applies a valid action', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const state = session.getFullState();
    const currentPlayer = state.players[state.currentPlayerIndex]!;
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: currentPlayer.id });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid action', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const state = session.getFullState();
    const notCurrentPlayer = state.players[state.currentPlayerIndex === 0 ? 1 : 0]!;
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: notCurrentPlayer.id });
    expect(result.success).toBe(false);
  });

  it('marks player disconnected', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    session.setPlayerConnected('p1', false);
    const state = session.getFullState();
    expect(state.players[0]!.connected).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/game/game-session.test.ts
```

- [ ] **Step 3: Write GameSession implementation**

Create `packages/server/src/game/game-session.ts`:

```typescript
import {
  initializeGame,
  applyAction as applyRulesAction,
} from '@uno-online/shared';
import type { GameState, GameAction, Player } from '@uno-online/shared';
import type { Card } from '@uno-online/shared';

export interface PlayerView {
  phase: GameState['phase'];
  players: {
    id: string;
    name: string;
    hand: Card[];
    handCount: number;
    score: number;
    connected: boolean;
    calledUno: boolean;
  }[];
  currentPlayerIndex: number;
  direction: GameState['direction'];
  discardPile: Card[];
  currentColor: GameState['currentColor'];
  drawStack: number;
  deckCount: number;
  roundNumber: number;
  winnerId: string | null;
  settings: GameState['settings'];
  pendingDrawPlayerId: string | null;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  drawnCard?: Card;
}

export class GameSession {
  private state: GameState;

  private constructor(state: GameState) {
    this.state = state;
  }

  static create(players: { id: string; name: string }[]): GameSession {
    const state = initializeGame(players);
    return new GameSession(state);
  }

  static fromState(state: GameState): GameSession {
    return new GameSession(state);
  }

  getFullState(): GameState {
    return this.state;
  }

  getPlayerView(playerId: string): PlayerView {
    return {
      phase: this.state.phase,
      players: this.state.players.map((p) => ({
        id: p.id,
        name: p.name,
        hand: p.id === playerId ? p.hand : [],
        handCount: p.hand.length,
        score: p.score,
        connected: p.connected,
        calledUno: p.calledUno,
      })),
      currentPlayerIndex: this.state.currentPlayerIndex,
      direction: this.state.direction,
      discardPile: this.state.discardPile.slice(-1),
      currentColor: this.state.currentColor,
      drawStack: this.state.drawStack,
      deckCount: this.state.deck.length,
      roundNumber: this.state.roundNumber,
      winnerId: this.state.winnerId,
      settings: this.state.settings,
      pendingDrawPlayerId: this.state.pendingDrawPlayerId,
    };
  }

  applyAction(action: GameAction): ActionResult {
    const prevState = this.state;
    const newState = applyRulesAction(this.state, action);

    if (newState === prevState) {
      return { success: false, error: 'Invalid action' };
    }

    let drawnCard: Card | undefined;
    if (action.type === 'DRAW_CARD') {
      const prevPlayer = prevState.players.find((p) => p.id === action.playerId);
      const newPlayer = newState.players.find((p) => p.id === action.playerId);
      if (prevPlayer && newPlayer && newPlayer.hand.length > prevPlayer.hand.length) {
        drawnCard = newPlayer.hand[newPlayer.hand.length - 1];
      }
    }

    this.state = newState;
    return { success: true, drawnCard };
  }

  setPlayerConnected(playerId: string, connected: boolean): void {
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === playerId ? { ...p, connected } : p,
      ),
    };
  }

  getCurrentPlayerId(): string {
    return this.state.players[this.state.currentPlayerIndex]!.id;
  }

  isGameOver(): boolean {
    return this.state.phase === 'game_over';
  }

  isRoundEnd(): boolean {
    return this.state.phase === 'round_end';
  }
}
```

- [ ] **Step 4: Write game store tests**

Create `packages/server/tests/game/game-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Redis from 'ioredis';
import { saveGameState, loadGameState, deleteGameState } from '../../src/game/game-store.js';
import { GameSession } from '../../src/game/game-session.js';

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
const TEST_CODE = 'GTEST1';

beforeEach(async () => {
  const keys = await redis.keys(`game:${TEST_CODE}*`);
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  const keys = await redis.keys(`game:${TEST_CODE}*`);
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

describe('game-store', () => {
  it('saves and loads game state', async () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    await saveGameState(redis, TEST_CODE, session.getFullState());
    const loaded = await loadGameState(redis, TEST_CODE);

    expect(loaded).not.toBeNull();
    expect(loaded!.players).toHaveLength(2);
    expect(loaded!.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
  });

  it('returns null for non-existent game', async () => {
    const loaded = await loadGameState(redis, 'NONEXIST');
    expect(loaded).toBeNull();
  });

  it('deletes game state', async () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    await saveGameState(redis, TEST_CODE, session.getFullState());
    await deleteGameState(redis, TEST_CODE);

    const loaded = await loadGameState(redis, TEST_CODE);
    expect(loaded).toBeNull();
  });
});
```

- [ ] **Step 5: Write game store implementation**

Create `packages/server/src/game/game-store.ts`:

```typescript
import type Redis from 'ioredis';
import type { GameState } from '@uno-online/shared';

const GAME_STATE_KEY = (roomCode: string) => `game:${roomCode}:state`;
const GAME_STATE_TTL = 300;

export async function saveGameState(
  redis: Redis,
  roomCode: string,
  state: GameState,
): Promise<void> {
  await redis.set(GAME_STATE_KEY(roomCode), JSON.stringify(state), 'EX', GAME_STATE_TTL);
}

export async function loadGameState(
  redis: Redis,
  roomCode: string,
): Promise<GameState | null> {
  const raw = await redis.get(GAME_STATE_KEY(roomCode));
  if (!raw) return null;
  return JSON.parse(raw) as GameState;
}

export async function deleteGameState(
  redis: Redis,
  roomCode: string,
): Promise<void> {
  await redis.del(GAME_STATE_KEY(roomCode));
}

export async function refreshGameStateTTL(
  redis: Redis,
  roomCode: string,
): Promise<void> {
  await redis.expire(GAME_STATE_KEY(roomCode), GAME_STATE_TTL);
}
```

- [ ] **Step 6: Run all game tests**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/game/
```

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/game/ packages/server/tests/game/
git commit -m "feat: add game session (state views, apply actions) and Redis game store"
```

---

### Task 8: Turn Timer

**Files:**
- Create: `packages/server/src/game/turn-timer.ts`
- Create: `packages/server/tests/game/turn-timer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/tests/game/turn-timer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TurnTimer } from '../../src/game/turn-timer.js';

describe('TurnTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onTimeout after the specified duration', () => {
    const onTimeout = vi.fn();
    const timer = new TurnTimer();

    timer.start('ROOM01', 30, onTimeout);
    vi.advanceTimersByTime(30_000);

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith('ROOM01');
  });

  it('does not call onTimeout if stopped before expiry', () => {
    const onTimeout = vi.fn();
    const timer = new TurnTimer();

    timer.start('ROOM01', 30, onTimeout);
    vi.advanceTimersByTime(15_000);
    timer.stop('ROOM01');
    vi.advanceTimersByTime(20_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('restarting replaces the old timer', () => {
    const onTimeout1 = vi.fn();
    const onTimeout2 = vi.fn();
    const timer = new TurnTimer();

    timer.start('ROOM01', 30, onTimeout1);
    vi.advanceTimersByTime(15_000);

    timer.start('ROOM01', 30, onTimeout2);
    vi.advanceTimersByTime(30_000);

    expect(onTimeout1).not.toHaveBeenCalled();
    expect(onTimeout2).toHaveBeenCalledOnce();
  });

  it('manages multiple rooms independently', () => {
    const onTimeout1 = vi.fn();
    const onTimeout2 = vi.fn();
    const timer = new TurnTimer();

    timer.start('ROOM01', 10, onTimeout1);
    timer.start('ROOM02', 20, onTimeout2);

    vi.advanceTimersByTime(10_000);
    expect(onTimeout1).toHaveBeenCalledOnce();
    expect(onTimeout2).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(onTimeout2).toHaveBeenCalledOnce();
  });

  it('stopAll clears all timers', () => {
    const onTimeout = vi.fn();
    const timer = new TurnTimer();

    timer.start('ROOM01', 30, onTimeout);
    timer.start('ROOM02', 30, onTimeout);
    timer.stopAll();

    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/game/turn-timer.test.ts
```

- [ ] **Step 3: Write implementation**

Create `packages/server/src/game/turn-timer.ts`:

```typescript
export class TurnTimer {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  start(
    roomCode: string,
    seconds: number,
    onTimeout: (roomCode: string) => void,
  ): void {
    this.stop(roomCode);
    const handle = setTimeout(() => {
      this.timers.delete(roomCode);
      onTimeout(roomCode);
    }, seconds * 1000);
    this.timers.set(roomCode, handle);
  }

  stop(roomCode: string): void {
    const handle = this.timers.get(roomCode);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(roomCode);
    }
  }

  stopAll(): void {
    for (const handle of this.timers.values()) {
      clearTimeout(handle);
    }
    this.timers.clear();
  }

  isRunning(roomCode: string): boolean {
    return this.timers.has(roomCode);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /root/uno-online/packages/server && npx vitest run tests/game/turn-timer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/game/turn-timer.ts packages/server/tests/game/turn-timer.test.ts
git commit -m "feat: add turn timer with per-room timeout management"
```

---

### Task 9: WebSocket Room Events

**Files:**
- Create: `packages/server/src/ws/room-events.ts`
- Create: `packages/server/src/ws/socket-handler.ts`

- [ ] **Step 1: Create `packages/server/src/ws/room-events.ts`**

```typescript
import type { Socket, Server as SocketIOServer } from 'socket.io';
import type Redis from 'ioredis';
import type { RoomSettings } from '@uno-online/shared';
import { MIN_PLAYERS } from '@uno-online/shared';
import { RoomManager } from '../room/room-manager.js';
import { getRoom, getRoomPlayers, setRoomStatus } from '../room/room-store.js';
import { GameSession } from '../game/game-session.js';
import { saveGameState } from '../game/game-store.js';
import type { TurnTimer } from '../game/turn-timer.js';
import type { TokenPayload } from '../auth/jwt.js';

interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
}

export function registerRoomEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: Redis,
  roomManager: RoomManager,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
) {
  const data = socket.data as SocketData;

  socket.on('room:create', async (settings: Partial<RoomSettings>, callback) => {
    const roomSettings: RoomSettings = {
      turnTimeLimit: settings?.turnTimeLimit ?? 30,
      targetScore: settings?.targetScore ?? 500,
    };

    const code = await roomManager.createRoom(data.user.userId, data.user.username, roomSettings);
    data.roomCode = code;
    await socket.join(code);

    const players = await getRoomPlayers(redis, code);
    callback({ success: true, roomCode: code, players });
  });

  socket.on('room:join', async (roomCode: string, callback) => {
    try {
      await roomManager.joinRoom(roomCode, data.user.userId, data.user.username);
      data.roomCode = roomCode;
      await socket.join(roomCode);

      const room = await getRoom(redis, roomCode);
      const players = await getRoomPlayers(redis, roomCode);

      io.to(roomCode).emit('room:updated', { players, room });
      callback({ success: true, players, room });
    } catch (err) {
      callback({ success: false, error: (err as Error).message });
    }
  });

  socket.on('room:leave', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });

    const { deleted } = await roomManager.leaveRoom(roomCode, data.user.userId);
    socket.leave(roomCode);
    data.roomCode = null;

    if (!deleted) {
      const room = await getRoom(redis, roomCode);
      const players = await getRoomPlayers(redis, roomCode);
      io.to(roomCode).emit('room:updated', { players, room });
    }

    callback?.({ success: true });
  });

  socket.on('room:ready', async (ready: boolean, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    await roomManager.setReady(roomCode, data.user.userId, ready);
    const players = await getRoomPlayers(redis, roomCode);
    io.to(roomCode).emit('room:updated', { players });

    callback?.({ success: true });
  });

  socket.on('game:start', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });

    const room = await getRoom(redis, roomCode);
    if (!room || room.ownerId !== data.user.userId) {
      return callback?.({ success: false, error: 'Only room owner can start' });
    }

    const players = await getRoomPlayers(redis, roomCode);
    if (players.length < MIN_PLAYERS) {
      return callback?.({ success: false, error: 'Not enough players' });
    }

    const allReady = await roomManager.areAllReady(roomCode);
    if (!allReady) {
      return callback?.({ success: false, error: 'Not all players are ready' });
    }

    await setRoomStatus(redis, roomCode, 'playing');

    const session = GameSession.create(
      players.map((p) => ({ id: p.userId, name: p.username })),
    );
    sessions.set(roomCode, session);
    await saveGameState(redis, roomCode, session.getFullState());

    for (const p of players) {
      const sockets = await io.in(roomCode).fetchSockets();
      for (const s of sockets) {
        if ((s.data as SocketData).user.userId === p.userId) {
          s.emit('game:state', session.getPlayerView(p.userId));
        }
      }
    }

    const state = session.getFullState();
    turnTimer.start(roomCode, state.settings.turnTimeLimit, async (code) => {
      const s = sessions.get(code);
      if (!s) return;
      const currentPlayerId = s.getCurrentPlayerId();
      s.applyAction({ type: 'DRAW_CARD', playerId: currentPlayerId });
      s.applyAction({ type: 'PASS', playerId: currentPlayerId });
      await saveGameState(redis, code, s.getFullState());
      emitGameUpdate(io, code, s, sessions);
      io.to(code).emit('player:timeout', { playerId: currentPlayerId });
      turnTimer.start(code, s.getFullState().settings.turnTimeLimit, arguments[3] as any);
    });

    callback?.({ success: true });
  });
}

export function emitGameUpdate(
  io: SocketIOServer,
  roomCode: string,
  session: GameSession,
  _sessions: Map<string, GameSession>,
) {
  const state = session.getFullState();
  for (const player of state.players) {
    io.to(roomCode).except(roomCode).emit('game:update', session.getPlayerView(player.id));
  }
  io.in(roomCode).fetchSockets().then((sockets) => {
    for (const s of sockets) {
      const userId = (s.data as { user: TokenPayload }).user.userId;
      s.emit('game:update', session.getPlayerView(userId));
    }
  });
}
```

- [ ] **Step 2: Create `packages/server/src/ws/socket-handler.ts`**

```typescript
import type { Server as SocketIOServer } from 'socket.io';
import type Redis from 'ioredis';
import { authenticateSocket } from '../auth/middleware.js';
import { RoomManager } from '../room/room-manager.js';
import { TurnTimer } from '../game/turn-timer.js';
import { GameSession } from '../game/game-session.js';
import { registerRoomEvents } from './room-events.js';
import { registerGameEvents } from './game-events.js';
import { getRoom, getRoomPlayers, setRoomOwner } from '../room/room-store.js';
import { loadGameState, saveGameState } from '../game/game-store.js';

export function setupSocketHandlers(
  io: SocketIOServer,
  redis: Redis,
  jwtSecret: string,
) {
  const roomManager = new RoomManager(redis);
  const turnTimer = new TurnTimer();
  const sessions = new Map<string, GameSession>();

  io.use((socket, next) => {
    const payload = authenticateSocket(socket, jwtSecret);
    if (!payload) {
      return next(new Error('Authentication failed'));
    }
    socket.data.user = payload;
    socket.data.roomCode = null;
    next();
  });

  io.on('connection', (socket) => {
    registerRoomEvents(socket, io, redis, roomManager, turnTimer, sessions);
    registerGameEvents(socket, io, redis, turnTimer, sessions);

    socket.on('disconnect', async () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      const session = sessions.get(roomCode);
      if (session) {
        session.setPlayerConnected(socket.data.user.userId, false);
        await saveGameState(redis, roomCode, session.getFullState());

        io.to(roomCode).emit('player:disconnected', {
          playerId: socket.data.user.userId,
        });

        const state = session.getFullState();
        const connectedCount = state.players.filter((p) => p.connected).length;
        if (connectedCount < 2) {
          turnTimer.stop(roomCode);
        }
      } else {
        const { deleted } = await roomManager.leaveRoom(roomCode, socket.data.user.userId);
        if (!deleted) {
          const room = await getRoom(redis, roomCode);
          const players = await getRoomPlayers(redis, roomCode);
          io.to(roomCode).emit('room:updated', { players, room });
        }
      }
    });
  });

  return { roomManager, turnTimer, sessions };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/ws/
git commit -m "feat: add WebSocket handlers for room management and connection lifecycle"
```

---

### Task 10: WebSocket Game Events

**Files:**
- Create: `packages/server/src/ws/game-events.ts`

- [ ] **Step 1: Create `packages/server/src/ws/game-events.ts`**

```typescript
import type { Socket, Server as SocketIOServer } from 'socket.io';
import type Redis from 'ioredis';
import type { Color } from '@uno-online/shared';
import { GameSession } from '../game/game-session.js';
import { saveGameState } from '../game/game-store.js';
import { emitGameUpdate } from './room-events.js';
import type { TurnTimer } from '../game/turn-timer.js';
import type { TokenPayload } from '../auth/jwt.js';

interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
}

function getSession(
  socket: Socket,
  sessions: Map<string, GameSession>,
): { session: GameSession; roomCode: string } | null {
  const roomCode = (socket.data as SocketData).roomCode;
  if (!roomCode) return null;
  const session = sessions.get(roomCode);
  if (!session) return null;
  return { session, roomCode };
}

function restartTurnTimer(
  io: SocketIOServer,
  redis: Redis,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
) {
  const state = session.getFullState();
  if (state.phase !== 'playing') {
    turnTimer.stop(roomCode);
    return;
  }

  turnTimer.start(roomCode, state.settings.turnTimeLimit, async (code) => {
    const s = sessions.get(code);
    if (!s) return;
    const currentPlayerId = s.getCurrentPlayerId();
    s.applyAction({ type: 'DRAW_CARD', playerId: currentPlayerId });
    s.applyAction({ type: 'PASS', playerId: currentPlayerId });
    await saveGameState(redis, code, s.getFullState());
    emitGameUpdate(io, code, s, sessions);
    io.to(code).emit('player:timeout', { playerId: currentPlayerId });
    restartTurnTimer(io, redis, code, s, turnTimer, sessions);
  });
}

export function registerGameEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: Redis,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
) {
  const data = socket.data as SocketData;

  socket.on('game:play_card', async (payload: { cardId: string; chosenColor?: Color }, callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });

    const { session, roomCode } = ctx;
    const result = session.applyAction({
      type: 'PLAY_CARD',
      playerId: data.user.userId,
      cardId: payload.cardId,
      chosenColor: payload.chosenColor,
    });

    if (!result.success) {
      socket.emit('game:action_rejected', { action: 'play_card', reason: result.error });
      return callback?.({ success: false, error: result.error });
    }

    await saveGameState(redis, roomCode, session.getFullState());
    emitGameUpdate(io, roomCode, session, sessions);

    const state = session.getFullState();
    if (state.phase === 'round_end' || state.phase === 'game_over') {
      turnTimer.stop(roomCode);
      io.to(roomCode).emit(state.phase === 'game_over' ? 'game:over' : 'game:round_end', {
        winnerId: state.winnerId,
        scores: Object.fromEntries(state.players.map((p) => [p.id, p.score])),
      });
    } else {
      restartTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }

    callback?.({ success: true });
  });

  socket.on('game:draw_card', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });

    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: data.user.userId });

    if (!result.success) {
      socket.emit('game:action_rejected', { action: 'draw_card', reason: result.error });
      return callback?.({ success: false, error: result.error });
    }

    if (result.drawnCard) {
      socket.emit('game:card_drawn', { card: result.drawnCard });
    }

    const state = session.getFullState();
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      if ((s.data as SocketData).user.userId !== data.user.userId) {
        s.emit('game:opponent_drew', { playerId: data.user.userId });
      }
    }

    await saveGameState(redis, roomCode, session.getFullState());
    emitGameUpdate(io, roomCode, session, sessions);
    callback?.({ success: true });
  });

  socket.on('game:pass', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });

    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'PASS', playerId: data.user.userId });

    if (!result.success) return callback?.({ success: false, error: result.error });

    await saveGameState(redis, roomCode, session.getFullState());
    emitGameUpdate(io, roomCode, session, sessions);
    restartTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('game:call_uno', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });

    const { session, roomCode } = ctx;
    session.applyAction({ type: 'CALL_UNO', playerId: data.user.userId });
    await saveGameState(redis, roomCode, session.getFullState());
    emitGameUpdate(io, roomCode, session, sessions);
    callback?.({ success: true });
  });

  socket.on('game:catch_uno', async (payload: { targetPlayerId: string }, callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });

    const { session, roomCode } = ctx;
    session.applyAction({
      type: 'CATCH_UNO',
      catcherId: data.user.userId,
      targetId: payload.targetPlayerId,
    });
    await saveGameState(redis, roomCode, session.getFullState());
    emitGameUpdate(io, roomCode, session, sessions);
    callback?.({ success: true });
  });

  socket.on('game:challenge', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });

    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CHALLENGE', playerId: data.user.userId });

    if (!result.success) return callback?.({ success: false, error: result.error });

    await saveGameState(redis, roomCode, session.getFullState());
    emitGameUpdate(io, roomCode, session, sessions);
    restartTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('game:accept', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });

    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'ACCEPT', playerId: data.user.userId });

    if (!result.success) return callback?.({ success: false, error: result.error });

    await saveGameState(redis, roomCode, session.getFullState());
    emitGameUpdate(io, roomCode, session, sessions);
    restartTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('game:choose_color', async (payload: { color: Color }, callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });

    const { session, roomCode } = ctx;
    const result = session.applyAction({
      type: 'CHOOSE_COLOR',
      playerId: data.user.userId,
      color: payload.color,
    });

    if (!result.success) return callback?.({ success: false, error: result.error });

    await saveGameState(redis, roomCode, session.getFullState());
    emitGameUpdate(io, roomCode, session, sessions);

    const state = session.getFullState();
    if (state.phase === 'challenging') {
      turnTimer.stop(roomCode);
    } else {
      restartTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }

    callback?.({ success: true });
  });

  socket.on('chat:message', (payload: { text: string }) => {
    const roomCode = data.roomCode;
    if (!roomCode || !payload.text) return;
    const text = payload.text.slice(0, 500);
    io.to(roomCode).emit('chat:message', {
      userId: data.user.userId,
      username: data.user.username,
      text,
      timestamp: Date.now(),
    });
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/ws/game-events.ts
git commit -m "feat: add WebSocket game event handlers (all player actions + chat)"
```

---

### Task 11: Wire Everything Into App

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/api/profile-routes.ts`

- [ ] **Step 1: Create `packages/server/src/api/profile-routes.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { createAuthHook } from '../auth/middleware.js';
import { getUserProfile } from '../db/user-repo.js';

export async function registerProfileRoutes(fastify: FastifyInstance, config: Config) {
  const authHook = createAuthHook(config.jwtSecret);

  fastify.get('/profile', { preHandler: authHook }, async (request) => {
    const { userId } = (request as any).user;
    const profile = await getUserProfile(userId);
    if (!profile) return { error: 'User not found' };
    return profile;
  });
}
```

- [ ] **Step 2: Update `packages/server/src/app.ts`**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './config.js';
import { registerAuthRoutes } from './api/auth-routes.js';
import { registerProfileRoutes } from './api/profile-routes.js';
import { setupSocketHandlers } from './ws/socket-handler.js';
import { getRedis } from './redis/client.js';

export async function createApp(config: Config) {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: config.clientUrl,
    credentials: true,
  });

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
  });

  const redis = getRedis(config.redisUrl);

  await registerAuthRoutes(fastify, config);
  await registerProfileRoutes(fastify, config);

  const wsContext = setupSocketHandlers(io, redis, config.jwtSecret);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return { fastify, io, redis, ...wsContext };
}
```

- [ ] **Step 3: Update `packages/server/src/index.ts`**

```typescript
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { disconnectPrisma } from './db/prisma.js';
import { disconnectRedis } from './redis/client.js';

async function main() {
  const config = loadConfig();
  const { fastify, turnTimer } = await createApp(config);

  const shutdown = async () => {
    turnTimer.stopAll();
    await fastify.close();
    await disconnectPrisma();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await fastify.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/
git commit -m "feat: wire up all routes, WebSocket handlers, and graceful shutdown"
```

---

### Task 12: Run All Server Tests & Final Verification

- [ ] **Step 1: Run full server test suite**

```bash
cd /root/uno-online/packages/server && npx vitest run
```
Expected: All tests PASS

- [ ] **Step 2: Run full monorepo tests**

```bash
cd /root/uno-online && pnpm test
```
Expected: Both shared (86 tests) and server tests pass

- [ ] **Step 3: Type-check everything**

```bash
cd /root/uno-online/packages/server && npx tsc --noEmit
cd /root/uno-online/packages/shared && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: plan 2 complete — server core with auth, rooms, game loop"
```
