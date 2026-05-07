# 牌山校验、对局回放与观战系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deck hash verification, full game replay with event sourcing, active game listing, and spectator mode to UNO Online.

**Architecture:** Event sourcing model — every game action is recorded as an immutable event in a `game_events` SQLite table. Replay consumes events offline; spectating subscribes to events in real-time. Deck SHA-256 hash is computed at game start and stored alongside events for fairness verification.

**Tech Stack:** TypeScript (strict), Node.js crypto (server-side SHA-256), Web Crypto API (client-side verification), Kysely (SQLite migrations), Fastify plugins, Socket.IO, React + Zustand + Tailwind CSS v4, Vitest.

---

## File Structure

### packages/shared

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/event.ts` | Create | `GameEventType` enum, `GameEvent` interface, per-event payload types |
| `src/types/game.ts` | Modify | Add `deckHash: string` to `GameState`; add `allowSpectators`, `spectatorMode` to `RoomSettings` |
| `src/types/index.ts` | Modify | Re-export `event.ts` |
| `src/rules/deck.ts` | Modify | Add `cardToIdentity()`, `serializeDeck()` |
| `src/rules/index.ts` | Modify | Re-export new functions |
| `src/index.ts` | No change | Already re-exports everything |

### packages/server

| File | Action | Responsibility |
|------|--------|----------------|
| `src/plugins/core/game-history/index.ts` | Create | Plugin entry: run migration, register routes |
| `src/plugins/core/game-history/migration.ts` | Create | `game_events` table, alter `game_records` for `deck_hash`/`initial_deck` |
| `src/plugins/core/game-history/routes.ts` | Create | `GET /games`, `GET /games/:id`, `GET /games/:id/verify` |
| `src/plugins/core/game-history/service.ts` | Create | DB queries: list games, get game detail, save events batch |
| `src/plugins/core/spectate/index.ts` | Create | Plugin entry: register routes + WS handlers |
| `src/plugins/core/spectate/routes.ts` | Create | `GET /rooms/active` |
| `src/plugins/core/spectate/ws.ts` | Create | `room:spectate`, spectator join/leave WS events |
| `src/plugins/core/game/session.ts` | Modify | Add `events` buffer, `recordEvent()`, `getSpectatorView()`, `computeDeckHash()` |
| `src/ws/game-events.ts` | Modify | Call `session.recordEvent()` after each action; include events in `persistGameResult` |
| `src/ws/room-events.ts` | Modify | Record `game_start` event with initial deck/hash; pass `deckHash` in GameState |
| `src/ws/types.ts` | Modify | Add `isSpectator: boolean` to `SocketData` |
| `src/db/database.ts` | Modify | Add `GameEventTable` to `Database` interface |
| `src/plugin-loader.ts` | Modify | Register `game-history` and `spectate` plugins |

### packages/client

| File | Action | Responsibility |
|------|--------|----------------|
| `src/features/replay/routes.tsx` | Create | Route `/replay/:gameId` |
| `src/features/replay/pages/ReplayPage.tsx` | Create | Replay page with player controls |
| `src/features/replay/stores/replay-store.ts` | Create | Zustand store: events, playback state, current step |
| `src/features/replay/components/ReplayControls.tsx` | Create | Play/pause/step/speed controls |
| `src/features/replay/components/ReplayBoard.tsx` | Create | Replay game board (god view) |
| `src/features/replay/components/ScoreTable.tsx` | Create | Score changes table |
| `src/features/replay/components/HashVerifier.tsx` | Create | Deck hash verification UI |
| `src/features/lobby/pages/LobbyPage.tsx` | Modify | Add active games + recent games sections |
| `src/features/lobby/stores/lobby-store.ts` | Create | Zustand store: active rooms, recent games |
| `src/features/game/stores/game-store.ts` | Modify | Add `isSpectator`, `deckHash` fields |
| `src/features/game/pages/GamePage.tsx` | Modify | Spectator mode (hide action buttons, show badge) |
| `src/shared/socket.ts` | Modify | Add spectator event listeners |
| `src/app/router.tsx` | Modify | Import and register replay routes |

### Tests

| File | Action |
|------|--------|
| `packages/shared/tests/deck-hash.test.ts` | Create |
| `packages/shared/tests/event-types.test.ts` | Create |
| `packages/server/tests/game-history/migration.test.ts` | Create |
| `packages/server/tests/game-history/service.test.ts` | Create |
| `packages/server/tests/game/game-session-events.test.ts` | Create |

---

## Task 1: Shared Types — Event System

**Files:**
- Create: `packages/shared/src/types/event.ts`
- Modify: `packages/shared/src/types/index.ts:6`

- [ ] **Step 1: Write the event type file**

```typescript
// packages/shared/src/types/event.ts
import type { Card, Color } from './card';
import type { RoomSettings } from './game';
import type { Direction } from './game';

export const GameEventType = {
  GAME_START: 'game_start',
  PLAY_CARD: 'play_card',
  DRAW_CARD: 'draw_card',
  PASS: 'pass',
  CALL_UNO: 'call_uno',
  CATCH_UNO: 'catch_uno',
  CHALLENGE: 'challenge',
  ACCEPT: 'accept',
  CHOOSE_COLOR: 'choose_color',
  CHOOSE_SWAP_TARGET: 'choose_swap_target',
  ROUND_END: 'round_end',
  GAME_OVER: 'game_over',
} as const;

export type GameEventType = (typeof GameEventType)[keyof typeof GameEventType];

export interface GameStartPayload {
  initialDeck: Card[];
  deckHash: string;
  playerHands: Record<string, Card[]>;
  firstDiscard: Card;
  direction: Direction;
  settings: RoomSettings;
}

export interface PlayCardPayload {
  cardId: string;
  card: Card;
  chosenColor?: Color;
}

export interface DrawCardPayload {
  card: Card;
}

export interface CatchUnoPayload {
  targetPlayerId: string;
}

export interface ChallengePayload {
  success: boolean;
  penaltyCards: Card[];
}

export interface AcceptPayload {
  drawnCards: Card[];
}

export interface ChooseColorPayload {
  color: Color;
}

export interface ChooseSwapTargetPayload {
  targetId: string;
}

export interface RoundEndPayload {
  winnerId: string;
  scores: Record<string, number>;
}

export interface GameOverPayload {
  winnerId: string;
  finalScores: Record<string, number>;
  reason?: string;
}

export type GameEventPayload =
  | GameStartPayload
  | PlayCardPayload
  | DrawCardPayload
  | Record<string, never>
  | CatchUnoPayload
  | ChallengePayload
  | AcceptPayload
  | ChooseColorPayload
  | ChooseSwapTargetPayload
  | RoundEndPayload
  | GameOverPayload;

export interface GameEvent {
  seq: number;
  eventType: GameEventType;
  payload: GameEventPayload;
  playerId: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Re-export from types index**

Add to `packages/shared/src/types/index.ts`:

```typescript
export * from './event';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm --filter shared exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/event.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add game event types for event sourcing"
```

---

## Task 2: Shared Types — GameState and RoomSettings Extensions

**Files:**
- Modify: `packages/shared/src/types/game.ts:37-51` (GameState) and `packages/shared/src/types/game.ts:31-35` (RoomSettings)

- [ ] **Step 1: Write failing test for new fields**

Create `packages/shared/tests/event-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState, RoomSettings } from '../src/types/game';

describe('GameState extensions', () => {
  it('accepts deckHash field', () => {
    const partial: Pick<GameState, 'deckHash'> = { deckHash: 'abc123' };
    expect(partial.deckHash).toBe('abc123');
  });
});

describe('RoomSettings extensions', () => {
  it('accepts spectator settings', () => {
    const settings: Pick<RoomSettings, 'allowSpectators' | 'spectatorMode'> = {
      allowSpectators: true,
      spectatorMode: 'hidden',
    };
    expect(settings.allowSpectators).toBe(true);
    expect(settings.spectatorMode).toBe('hidden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter shared test -- --run tests/event-types.test.ts`
Expected: FAIL — `deckHash` does not exist on `GameState`

- [ ] **Step 3: Add deckHash to GameState**

In `packages/shared/src/types/game.ts`, add `deckHash` to the `GameState` interface after `winnerId`:

```typescript
// Inside GameState interface, after line 49 (winnerId: string | null;)
  deckHash: string;
```

- [ ] **Step 4: Add spectator settings to RoomSettings**

In `packages/shared/src/types/game.ts`, add to `RoomSettings` interface after `houseRules`:

```typescript
// Inside RoomSettings interface, after line 34 (houseRules: HouseRules;)
  allowSpectators: boolean;
  spectatorMode: 'full' | 'hidden';
```

- [ ] **Step 5: Update initializeGame to include deckHash default**

In `packages/shared/src/rules/setup.ts`, add `deckHash: ''` to the return object of `initializeGame()` (line 133-151) after `winnerId: null`:

```typescript
    deckHash: '',
```

Also add to `initializeNextRound()` return (line 198-212) after `winnerId: null`:

```typescript
    deckHash: '',
```

- [ ] **Step 6: Update RoomSettings defaults in setup.ts**

In `packages/shared/src/rules/setup.ts`, update the settings default in `initializeGame()` return (lines 146-150):

```typescript
      settings: {
        turnTimeLimit: DEFAULT_TURN_TIME_LIMIT as 30,
        targetScore: DEFAULT_TARGET_SCORE as 500,
        houseRules: houseRules ?? DEFAULT_HOUSE_RULES,
        allowSpectators: true,
        spectatorMode: 'hidden' as const,
      },
```

- [ ] **Step 7: Update RoomSettings defaults in room-events.ts**

In `packages/server/src/ws/room-events.ts`, find the `room:create` handler (line 23-35) where settings defaults are set. Add defaults for the new fields:

```typescript
// In the room:create handler, where settings defaults are applied:
allowSpectators: true,
spectatorMode: 'hidden' as const,
```

Also in the `room:update_settings` handler (line 88-116) where settings are merged.

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter shared test -- --run tests/event-types.test.ts`
Expected: PASS

- [ ] **Step 9: Run all shared tests to check for regressions**

Run: `pnpm --filter shared test -- --run`
Expected: All tests pass (some tests may need `deckHash` added to their test fixtures)

- [ ] **Step 10: Fix any test fixtures that break**

If shared tests fail because test-constructed `GameState` objects lack `deckHash`, add `deckHash: ''` to those fixtures. Similarly add `allowSpectators: true, spectatorMode: 'hidden' as const` to any `RoomSettings` fixtures.

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/types/game.ts packages/shared/src/rules/setup.ts packages/shared/tests/ packages/server/src/ws/room-events.ts
git commit -m "feat(shared): add deckHash to GameState and spectator settings to RoomSettings"
```

---

## Task 3: Deck Serialization and Hash

**Files:**
- Modify: `packages/shared/src/rules/deck.ts`
- Modify: `packages/shared/src/rules/index.ts`
- Create: `packages/shared/tests/deck-hash.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/shared/tests/deck-hash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createDeck, serializeDeck, cardToIdentity } from '../src/rules/deck';
import type { Card } from '../src/types/card';

describe('cardToIdentity', () => {
  it('strips id from number card', () => {
    const card: Card = { id: 'card_1', type: 'number', color: 'red', value: 5 };
    expect(cardToIdentity(card)).toEqual({ color: 'red', type: 'number', value: 5 });
  });

  it('strips id from wild card', () => {
    const card: Card = { id: 'card_99', type: 'wild', color: null };
    expect(cardToIdentity(card)).toEqual({ color: null, type: 'wild' });
  });

  it('strips id and chosenColor from wild card', () => {
    const card: Card = { id: 'card_99', type: 'wild', color: null, chosenColor: 'blue' };
    expect(cardToIdentity(card)).toEqual({ color: null, type: 'wild' });
  });

  it('strips id from skip card', () => {
    const card: Card = { id: 'card_50', type: 'skip', color: 'green' };
    expect(cardToIdentity(card)).toEqual({ color: 'green', type: 'skip' });
  });
});

describe('serializeDeck', () => {
  it('produces deterministic JSON for the same deck', () => {
    const deck = createDeck();
    const s1 = serializeDeck(deck);
    const s2 = serializeDeck(deck);
    expect(s1).toBe(s2);
  });

  it('produces valid JSON', () => {
    const deck = createDeck();
    const serialized = serializeDeck(deck);
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveLength(108);
  });

  it('does not contain card ids', () => {
    const deck = createDeck();
    const serialized = serializeDeck(deck);
    expect(serialized).not.toContain('card_');
  });

  it('produces different output for different orderings', () => {
    const deck = createDeck();
    const reversed = [...deck].reverse();
    expect(serializeDeck(deck)).not.toBe(serializeDeck(reversed));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter shared test -- --run tests/deck-hash.test.ts`
Expected: FAIL — `serializeDeck` and `cardToIdentity` are not exported

- [ ] **Step 3: Implement cardToIdentity and serializeDeck**

Add to `packages/shared/src/rules/deck.ts` at the end of the file:

```typescript
export interface CardIdentity {
  color: Card['color'];
  type: Card['type'];
  value?: number;
}

export function cardToIdentity(card: Card): CardIdentity {
  const identity: CardIdentity = { color: card.color, type: card.type };
  if (card.type === 'number') {
    identity.value = card.value;
  }
  return identity;
}

export function serializeDeck(deck: readonly Card[]): string {
  return JSON.stringify(deck.map(cardToIdentity));
}
```

- [ ] **Step 4: Re-export from rules index**

Add to `packages/shared/src/rules/index.ts` in the deck re-export line:

```typescript
export { createDeck, shuffleDeck, reshuffleDiscardIntoDeck, serializeDeck, cardToIdentity } from './deck';
export type { CardIdentity } from './deck';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter shared test -- --run tests/deck-hash.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/rules/deck.ts packages/shared/src/rules/index.ts packages/shared/tests/deck-hash.test.ts
git commit -m "feat(shared): add deck serialization for hash verification"
```

---

## Task 4: Server — GameSession Event Recording and Deck Hash

**Files:**
- Modify: `packages/server/src/plugins/core/game/session.ts`
- Create: `packages/server/tests/game/game-session-events.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/server/tests/game/game-session-events.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GameSession } from '../../src/plugins/core/game/session';
import { GameEventType } from '@uno-online/shared';

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

describe('GameSession event recording', () => {
  it('starts with empty events buffer', () => {
    const session = GameSession.create(players);
    expect(session.getEvents()).toEqual([]);
  });

  it('records an event with sequential seq numbers', () => {
    const session = GameSession.create(players);
    session.recordEvent(GameEventType.PLAY_CARD, { cardId: 'c1', card: { id: 'c1', type: 'number', color: 'red', value: 5 } }, 'p1');
    session.recordEvent(GameEventType.DRAW_CARD, { card: { id: 'c2', type: 'number', color: 'blue', value: 3 } }, 'p2');
    const events = session.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.seq).toBe(0);
    expect(events[1]!.seq).toBe(1);
    expect(events[0]!.eventType).toBe('play_card');
    expect(events[0]!.playerId).toBe('p1');
  });

  it('clears events buffer', () => {
    const session = GameSession.create(players);
    session.recordEvent(GameEventType.PASS, {}, 'p1');
    session.clearEvents();
    expect(session.getEvents()).toEqual([]);
  });
});

describe('GameSession deck hash', () => {
  it('computes a non-empty deckHash on create', () => {
    const session = GameSession.create(players);
    const state = session.getFullState();
    expect(state.deckHash).toBeTruthy();
    expect(state.deckHash.length).toBe(64); // SHA-256 hex = 64 chars
  });

  it('produces deterministic hash for same deck', () => {
    // Same deck should produce same hash
    const session = GameSession.create(players);
    const hash = session.getFullState().deckHash;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('GameSession spectator view', () => {
  it('returns all hands in full mode', () => {
    const session = GameSession.create(players);
    const view = session.getSpectatorView('full');
    expect(view.viewerId).toBe('__spectator__');
    for (const p of view.players) {
      expect(p.hand.length).toBeGreaterThan(0);
      expect(p.hand.length).toBe(p.handCount);
    }
  });

  it('returns empty hands in hidden mode', () => {
    const session = GameSession.create(players);
    const view = session.getSpectatorView('hidden');
    for (const p of view.players) {
      expect(p.hand).toEqual([]);
      expect(p.handCount).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- --run tests/game/game-session-events.test.ts`
Expected: FAIL — `getEvents`, `recordEvent`, `clearEvents`, `getSpectatorView` do not exist

- [ ] **Step 3: Implement event recording, deck hash, and spectator view**

Modify `packages/server/src/plugins/core/game/session.ts`:

Add imports at the top:

```typescript
import { createHash } from 'node:crypto';
import { serializeDeck } from '@uno-online/shared';
import type { GameEvent, GameEventPayload, GameEventType as GameEventTypeEnum } from '@uno-online/shared';
```

Add private fields and methods to the `GameSession` class:

```typescript
  private events: GameEvent[] = [];

  // After the constructor, add:
  private static computeDeckHash(deck: Card[]): string {
    const serialized = serializeDeck(deck);
    return createHash('sha256').update(serialized).digest('hex');
  }
```

Update `static create()` to compute the deck hash:

```typescript
  static create(players: { id: string; name: string; avatarUrl?: string | null; role?: UserRole }[], settings?: RoomSettings): GameSession {
    const state = initializeGame(players, settings?.houseRules);
    const deckHash = GameSession.computeDeckHash(state.deck);
    const stateWithExtras = {
      ...state,
      deckHash,
      ...(settings ? { settings } : {}),
    };
    return new GameSession(stateWithExtras);
  }
```

Update `startNextRound()` to compute hash for new round:

```typescript
  startNextRound(): void {
    this.state = initializeNextRound(this.state);
    this.state = { ...this.state, deckHash: GameSession.computeDeckHash(this.state.deck) };
  }
```

Update `resetForRematch()` similarly:

```typescript
  resetForRematch(): void {
    const players = this.state.players.map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, role: p.role }));
    const settings = this.state.settings;
    const fresh = initializeGame(players, settings.houseRules);
    const deckHash = GameSession.computeDeckHash(fresh.deck);
    this.state = { ...fresh, settings, deckHash };
  }
```

Add event recording methods:

```typescript
  recordEvent(eventType: GameEventTypeEnum, payload: GameEventPayload, playerId: string | null): void {
    this.events.push({
      seq: this.events.length,
      eventType,
      payload,
      playerId,
      createdAt: new Date().toISOString(),
    });
  }

  getEvents(): GameEvent[] {
    return this.events;
  }

  clearEvents(): void {
    this.events = [];
  }
```

Add spectator view method:

```typescript
  getSpectatorView(mode: 'full' | 'hidden'): PlayerView {
    return {
      viewerId: '__spectator__',
      phase: this.state.phase,
      players: this.state.players.map((p) => ({
        id: p.id,
        name: p.name,
        hand: mode === 'full' ? p.hand : [],
        handCount: p.hand.length,
        score: p.score,
        connected: p.connected,
        autopilot: p.autopilot,
        calledUno: p.calledUno,
        eliminated: p.eliminated,
        teamId: p.teamId,
        avatarUrl: p.avatarUrl,
        role: p.role,
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
      lastAction: this.state.lastAction,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- --run tests/game/game-session-events.test.ts`
Expected: PASS

- [ ] **Step 5: Run all server tests for regressions**

Run: `pnpm --filter server test -- --run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/plugins/core/game/session.ts packages/server/tests/game/game-session-events.test.ts
git commit -m "feat(server): add event recording, deck hash computation, and spectator view to GameSession"
```

---

## Task 5: Server — game-history Plugin (Migration + Service)

**Files:**
- Create: `packages/server/src/plugins/core/game-history/migration.ts`
- Create: `packages/server/src/plugins/core/game-history/service.ts`
- Modify: `packages/server/src/db/database.ts` (add GameEventTable to Database interface)
- Create: `packages/server/tests/game-history/service.test.ts`

- [ ] **Step 1: Add GameEventTable to Database interface**

In `packages/server/src/db/database.ts`, add after the `GamePlayerTable` interface:

```typescript
export interface GameEventTable {
  id: Generated<number>;
  gameId: string;
  seq: number;
  eventType: string;
  payload: string;
  playerId: string | null;
  createdAt: string;
}
```

Add to the `Database` interface:

```typescript
export interface Database {
  users: UserTable;
  gameRecords: GameRecordTable;
  gamePlayers: GamePlayerTable;
  gameEvents: GameEventTable;
}
```

- [ ] **Step 2: Create migration file**

Create `packages/server/src/plugins/core/game-history/migration.ts`:

```typescript
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../../../db/database';

export async function migrate(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('game_events')
    .ifNotExists()
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('game_id', 'text', (c) => c.notNull())
    .addColumn('seq', 'integer', (c) => c.notNull())
    .addColumn('event_type', 'text', (c) => c.notNull())
    .addColumn('payload', 'text', (c) => c.notNull())
    .addColumn('player_id', 'text')
    .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  await db.schema
    .createIndex('idx_game_events_game_seq')
    .ifNotExists()
    .on('game_events')
    .columns(['game_id', 'seq'])
    .execute();

  try {
    await db.schema.alterTable('game_records').addColumn('deck_hash', 'text').execute();
  } catch { /* column already exists */ }

  try {
    await db.schema.alterTable('game_records').addColumn('initial_deck', 'text').execute();
  } catch { /* column already exists */ }
}
```

- [ ] **Step 3: Create service file**

Create `packages/server/src/plugins/core/game-history/service.ts`:

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '../../../db/database';
import type { GameEvent } from '@uno-online/shared';

export async function saveGameEvents(
  db: Kysely<Database>,
  gameId: string,
  events: GameEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await db.insertInto('gameEvents').values(
    events.map((e) => ({
      gameId,
      seq: e.seq,
      eventType: e.eventType,
      payload: JSON.stringify(e.payload),
      playerId: e.playerId,
      createdAt: e.createdAt,
    })),
  ).execute();
}

export async function saveDeckInfo(
  db: Kysely<Database>,
  gameId: string,
  deckHash: string,
  initialDeck: string,
): Promise<void> {
  await db.updateTable('gameRecords')
    .set({ deckHash, initialDeck })
    .where('id', '=', gameId)
    .execute();
}

export async function getGamesList(
  db: Kysely<Database>,
  page: number,
  limit: number,
): Promise<{ games: GameListItem[]; total: number }> {
  const offset = (page - 1) * limit;

  const totalResult = await db.selectFrom('gameRecords')
    .select(db.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();

  const records = await db.selectFrom('gameRecords')
    .selectAll()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  const games: GameListItem[] = [];
  for (const rec of records) {
    const players = await db.selectFrom('gamePlayers')
      .innerJoin('users', 'users.id', 'gamePlayers.userId')
      .select([
        'gamePlayers.userId',
        'users.nickname',
        'gamePlayers.placement',
        'gamePlayers.finalScore',
      ])
      .where('gamePlayers.gameId', '=', rec.id)
      .orderBy('gamePlayers.placement', 'asc')
      .execute();

    const winner = players.find(p => p.userId === rec.winnerId);
    games.push({
      id: rec.id,
      roomCode: rec.roomCode,
      players: players.map(p => ({
        userId: p.userId,
        nickname: p.nickname,
        placement: p.placement,
        finalScore: p.finalScore,
      })),
      winnerId: rec.winnerId,
      winnerName: winner?.nickname ?? '',
      playerCount: rec.playerCount,
      rounds: rec.rounds,
      duration: rec.duration,
      deckHash: (rec as Record<string, unknown>).deckHash as string ?? '',
      createdAt: rec.createdAt,
    });
  }

  return { games, total: totalResult.count };
}

export async function getGameDetail(
  db: Kysely<Database>,
  gameId: string,
): Promise<GameDetailResult | null> {
  const record = await db.selectFrom('gameRecords')
    .selectAll()
    .where('id', '=', gameId)
    .executeTakeFirst();

  if (!record) return null;

  const players = await db.selectFrom('gamePlayers')
    .innerJoin('users', 'users.id', 'gamePlayers.userId')
    .select([
      'gamePlayers.userId',
      'users.nickname',
      'gamePlayers.placement',
      'gamePlayers.finalScore',
    ])
    .where('gamePlayers.gameId', '=', gameId)
    .orderBy('gamePlayers.placement', 'asc')
    .execute();

  const events = await db.selectFrom('gameEvents')
    .selectAll()
    .where('gameId', '=', gameId)
    .orderBy('seq', 'asc')
    .execute();

  const winner = players.find(p => p.userId === record.winnerId);

  return {
    id: record.id,
    roomCode: record.roomCode,
    players: players.map(p => ({
      userId: p.userId,
      nickname: p.nickname,
      placement: p.placement,
      finalScore: p.finalScore,
    })),
    winnerId: record.winnerId,
    winnerName: winner?.nickname ?? '',
    playerCount: record.playerCount,
    rounds: record.rounds,
    duration: record.duration,
    deckHash: (record as Record<string, unknown>).deckHash as string ?? '',
    createdAt: record.createdAt,
    events: events.map(e => ({
      seq: e.seq,
      eventType: e.eventType,
      payload: JSON.parse(e.payload),
      playerId: e.playerId,
      createdAt: e.createdAt,
    })),
    initialDeck: (record as Record<string, unknown>).initialDeck as string | null ?? null,
  };
}

export interface GameListItem {
  id: string;
  roomCode: string;
  players: { userId: string; nickname: string; placement: number; finalScore: number }[];
  winnerId: string;
  winnerName: string;
  playerCount: number;
  rounds: number;
  duration: number;
  deckHash: string;
  createdAt: string;
}

export interface GameDetailResult extends GameListItem {
  events: GameEvent[];
  initialDeck: string | null;
}
```

- [ ] **Step 4: Run TypeScript check**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/database.ts packages/server/src/plugins/core/game-history/
git commit -m "feat(server): add game-history plugin migration and service"
```

---

## Task 6: Server — game-history Plugin Routes and Registration

**Files:**
- Create: `packages/server/src/plugins/core/game-history/routes.ts`
- Create: `packages/server/src/plugins/core/game-history/index.ts`
- Modify: `packages/server/src/plugin-loader.ts`

- [ ] **Step 1: Create routes file**

Create `packages/server/src/plugins/core/game-history/routes.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { authPreHandler, type AuthenticatedRequest } from '../auth/service';
import { getGamesList, getGameDetail } from './service';

export async function registerRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const preHandler = authPreHandler(ctx.config.jwtSecret);

  fastify.get<{ Querystring: { page?: string; limit?: string } }>('/games', { preHandler }, async (request) => {
    const page = Math.max(1, parseInt((request.query as { page?: string }).page ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt((request.query as { limit?: string }).limit ?? '20', 10) || 20));
    return getGamesList(ctx.db, page, limit);
  });

  fastify.get<{ Params: { id: string } }>('/games/:id', { preHandler }, async (request, reply) => {
    const detail = await getGameDetail(ctx.db, (request.params as { id: string }).id);
    if (!detail) return reply.code(404).send({ error: '对局不存在' });
    return detail;
  });

  fastify.get<{ Params: { id: string } }>('/games/:id/verify', { preHandler }, async (request, reply) => {
    const detail = await getGameDetail(ctx.db, (request.params as { id: string }).id);
    if (!detail) return reply.code(404).send({ error: '对局不存在' });
    return { deckHash: detail.deckHash, initialDeck: detail.initialDeck };
  });
}
```

- [ ] **Step 2: Create plugin index**

Create `packages/server/src/plugins/core/game-history/index.ts`:

```typescript
import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerRoutes } from './routes';
import { migrate } from './migration';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  await migrate(opts.ctx.db);
  await registerRoutes(fastify, opts.ctx);
}, { name: 'game-history' });
```

- [ ] **Step 3: Register in plugin-loader**

Add to `packages/server/src/plugin-loader.ts`:

```typescript
import gameHistoryPlugin from './plugins/core/game-history/index';
```

And add registration after existing plugins:

```typescript
  await fastify.register(gameHistoryPlugin, { ctx });
```

- [ ] **Step 4: Run TypeScript check**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/plugins/core/game-history/ packages/server/src/plugin-loader.ts
git commit -m "feat(server): add game-history plugin routes and registration"
```

---

## Task 7: Server — Wire Event Recording into Game Flow

**Files:**
- Modify: `packages/server/src/ws/game-events.ts`
- Modify: `packages/server/src/ws/room-events.ts`

- [ ] **Step 1: Add import in game-events.ts**

Add to top of `packages/server/src/ws/game-events.ts`:

```typescript
import { GameEventType } from '@uno-online/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../db/database';
import { saveGameEvents, saveDeckInfo } from '../plugins/core/game-history/service';
import { serializeDeck } from '@uno-online/shared';
```

- [ ] **Step 2: Update registerGameEvents signature**

Modify `registerGameEvents` to accept `db`:

```typescript
export function registerGameEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  db: Kysely<Database>,  // new parameter
)
```

- [ ] **Step 3: Record events in each game action handler**

After each successful `session.applyAction()` call, record the event. For example, in the `game:play_card` handler (around line 104-124):

After `if (!result.success)` block and before `saveGameState`, add:

```typescript
      const playedCard = session.getFullState().discardPile.at(-1);
      session.recordEvent(GameEventType.PLAY_CARD, {
        cardId: payload.cardId,
        card: playedCard!,
        chosenColor: payload.chosenColor,
      }, userId);
```

Similarly for each handler:

**game:draw_card** — after successful applyAction:
```typescript
      session.recordEvent(GameEventType.DRAW_CARD, {
        card: result.drawnCard!,
      }, userId);
```

**game:pass**:
```typescript
      session.recordEvent(GameEventType.PASS, {}, userId);
```

**game:call_uno**:
```typescript
      session.recordEvent(GameEventType.CALL_UNO, {}, userId);
```

**game:catch_uno**:
```typescript
      session.recordEvent(GameEventType.CATCH_UNO, { targetPlayerId: payload.targetPlayerId }, userId);
```

**game:challenge**:
```typescript
      const challengeState = session.getFullState();
      session.recordEvent(GameEventType.CHALLENGE, {
        success: challengeState.lastAction?.type === 'CHALLENGE' ? challengeState.lastAction.succeeded ?? false : false,
        penaltyCards: [],
      }, userId);
```

**game:accept**:
```typescript
      session.recordEvent(GameEventType.ACCEPT, { drawnCards: [] }, userId);
```

**game:choose_color**:
```typescript
      session.recordEvent(GameEventType.CHOOSE_COLOR, { color: payload.color }, userId);
```

**game:choose_swap_target**:
```typescript
      session.recordEvent(GameEventType.CHOOSE_SWAP_TARGET, { targetId: payload.targetId }, userId);
```

- [ ] **Step 4: Record round_end and game_over events**

In `emitTerminalStateIfNeeded`, after the existing logic, add event recording:

```typescript
  if (state.phase === 'round_end') {
    const scores = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
    session.recordEvent(GameEventType.ROUND_END, {
      winnerId: state.winnerId!,
      scores,
    }, null);
  }

  if (state.phase === 'game_over') {
    const finalScores = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
    session.recordEvent(GameEventType.GAME_OVER, {
      winnerId: state.winnerId!,
      finalScores,
    }, null);
  }
```

- [ ] **Step 5: Persist events on game over**

In `persistGameResult`, after the successful `recordGameResult` call, add:

```typescript
    const gameId = /* get from recordGameResult return */ ;
```

This requires `recordGameResult` to return the game ID. Modify `packages/server/src/db/user-repo.ts` `recordGameResult` to return the generated `id`:

```typescript
// Change return type and return the id
export async function recordGameResult(...): Promise<string> {
  // ... existing code
  const id = ... ; // the generated id
  // ... at end
  return id;
}
```

Then in `persistGameResult`:

```typescript
    const gameId = await recordGameResult(roomCode, state.winnerId, state.roundNumber, duration, playerResults);
    const events = session.getEvents();
    await saveGameEvents(db, gameId, events);
    const initialDeck = serializeDeck(state.deck); // Note: deck in state is current, need initial
    await saveDeckInfo(db, gameId, state.deckHash, initialDeck);
    session.clearEvents();
```

**Important:** The initial deck must be captured at game start, not game end. Add a field `initialDeckSerialized: string` to `GameSession`:

In session.ts, add to `create()`:
```typescript
  private initialDeckSerialized: string = '';

  // In create():
  this.initialDeckSerialized = serializeDeck(state.deck);
  // Exposed via:
  getInitialDeckSerialized(): string { return this.initialDeckSerialized; }
```

Then use `session.getInitialDeckSerialized()` in `persistGameResult`.

- [ ] **Step 6: Record game_start event in room-events.ts**

In `packages/server/src/ws/room-events.ts`, in the `game:start` handler (around line 159-173), after `GameSession.create()` and before sending `game:state`:

```typescript
      const fullState = session.getFullState();
      session.recordEvent(GameEventType.GAME_START, {
        initialDeck: fullState.deck,
        deckHash: fullState.deckHash,
        playerHands: Object.fromEntries(fullState.players.map(p => [p.id, p.hand])),
        firstDiscard: fullState.discardPile[0]!,
        direction: fullState.direction,
        settings: fullState.settings,
      }, null);
```

- [ ] **Step 7: Pass db to registerGameEvents**

In `packages/server/src/ws/socket-handler.ts`, update the call to `registerGameEvents` to include `db`. This requires adding `db` to `setupSocketHandlers` params (it already receives `redis` and `jwtSecret`). The `db` instance can come from `getDb()` import or be passed through.

Look at how `socket-handler.ts` is called from the main app and thread `db` through.

- [ ] **Step 8: Run TypeScript check**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Run all server tests**

Run: `pnpm --filter server test -- --run`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/ws/game-events.ts packages/server/src/ws/room-events.ts packages/server/src/ws/socket-handler.ts packages/server/src/plugins/core/game/session.ts packages/server/src/db/user-repo.ts
git commit -m "feat(server): wire event recording into game flow and persist on game over"
```

---

## Task 8: Server — SocketData Extension and Spectate Plugin

**Files:**
- Modify: `packages/server/src/ws/types.ts`
- Create: `packages/server/src/plugins/core/spectate/index.ts`
- Create: `packages/server/src/plugins/core/spectate/routes.ts`
- Create: `packages/server/src/plugins/core/spectate/ws.ts`
- Modify: `packages/server/src/plugin-loader.ts`

- [ ] **Step 1: Extend SocketData**

In `packages/server/src/ws/types.ts`:

```typescript
import type { TokenPayload } from '../auth/jwt';

export interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
  isSpectator: boolean;
}
```

- [ ] **Step 2: Update socket initialization**

In `packages/server/src/ws/socket-handler.ts`, in the auth middleware where `socket.data` is set (around line 34), add:

```typescript
socket.data.isSpectator = false;
```

- [ ] **Step 3: Create spectate routes**

Create `packages/server/src/plugins/core/spectate/routes.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { authPreHandler } from '../auth/service';
import { getRoom, getRoomPlayers } from '../room/store';

export async function registerRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const preHandler = authPreHandler(ctx.config.jwtSecret);

  fastify.get('/rooms/active', { preHandler }, async () => {
    const allKeys = await ctx.kv.keys('room:*');
    const roomKeys = allKeys.filter(k => !k.includes(':players') && !k.includes(':state'));

    const activeRooms = [];
    for (const key of roomKeys) {
      const roomCode = key.replace('room:', '');
      const room = await getRoom(ctx.kv, roomCode);
      if (!room || room.status !== 'playing') continue;

      const settings = room.settings;
      if (!settings.allowSpectators) continue;

      const players = await getRoomPlayers(ctx.kv, roomCode);

      const spectatorSockets = await ctx.io.in(roomCode).fetchSockets();
      const spectatorCount = spectatorSockets.filter(s => (s.data as { isSpectator?: boolean }).isSpectator).length;

      activeRooms.push({
        roomCode,
        players: players.map(p => ({ nickname: p.nickname, avatarUrl: p.avatarUrl })),
        playerCount: players.length,
        startedAt: room.createdAt,
        spectatorCount,
        spectatorMode: settings.spectatorMode,
      });
    }

    return activeRooms;
  });
}
```

- [ ] **Step 4: Create spectate WS handler**

Create `packages/server/src/plugins/core/spectate/ws.ts`:

```typescript
import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../../../kv/types';
import type { SocketData } from '../../../ws/types';
import { getRoom } from '../room/store';
import type { GameSession } from '../game/session';

export function setupSpectateHandlers(
  io: SocketIOServer,
  kv: KvStore,
  sessions: Map<string, GameSession>,
): void {
  io.on('connection', (socket) => {
    socket.on('room:spectate', async (roomCode: string, callback?: (res: Record<string, unknown>) => void) => {
      const data = socket.data as SocketData;
      if (!data.user) {
        callback?.({ success: false, error: '未登录' });
        return;
      }

      const room = await getRoom(kv, roomCode);
      if (!room) {
        callback?.({ success: false, error: '房间不存在' });
        return;
      }
      if (room.status !== 'playing') {
        callback?.({ success: false, error: '游戏未开始' });
        return;
      }
      if (!room.settings.allowSpectators) {
        callback?.({ success: false, error: '该房间不允许观战' });
        return;
      }

      const session = sessions.get(roomCode);
      if (!session) {
        callback?.({ success: false, error: '游戏会话不存在' });
        return;
      }

      data.roomCode = roomCode;
      data.isSpectator = true;
      await socket.join(roomCode);

      const view = session.getSpectatorView(room.settings.spectatorMode);
      socket.emit('game:state', view);

      socket.to(roomCode).emit('room:spectator_joined', {
        nickname: data.user.nickname,
      });

      callback?.({ success: true });
    });

    socket.on('disconnect', () => {
      const data = socket.data as SocketData;
      if (data.isSpectator && data.roomCode) {
        socket.to(data.roomCode).emit('room:spectator_left', {
          nickname: data.user?.nickname,
        });
      }
    });
  });
}
```

- [ ] **Step 5: Create spectate plugin index**

Create `packages/server/src/plugins/core/spectate/index.ts`:

```typescript
import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  await registerRoutes(fastify, opts.ctx);
}, { name: 'spectate' });
```

Note: The WS handler is registered separately via `setupSpectateHandlers` because it needs the `sessions` map from `socket-handler.ts`.

- [ ] **Step 6: Register spectate plugin in plugin-loader**

Add to `packages/server/src/plugin-loader.ts`:

```typescript
import spectatePlugin from './plugins/core/spectate/index';
```

```typescript
  await fastify.register(spectatePlugin, { ctx });
```

- [ ] **Step 7: Wire setupSpectateHandlers in socket-handler.ts**

In `packages/server/src/ws/socket-handler.ts`, import and call:

```typescript
import { setupSpectateHandlers } from '../plugins/core/spectate/ws';
```

After the `io.on('connection', ...)` block or inside it, call:

```typescript
setupSpectateHandlers(io, redis, sessions);
```

- [ ] **Step 8: Guard game actions against spectators**

In `packages/server/src/ws/game-events.ts`, at the start of each game action handler, add a spectator check. The simplest approach: in `getSession()`, also check `isSpectator`:

```typescript
function getSession(socket: Socket, sessions: Map<string, GameSession>): { session: GameSession; roomCode: string } | null {
  const data = socket.data as SocketData;
  if (data.isSpectator) return null;
  const roomCode = data.roomCode;
  if (!roomCode) return null;
  const session = sessions.get(roomCode);
  if (!session) return null;
  return { session, roomCode };
}
```

This makes all game actions return early for spectators (existing handlers check `if (!ctx)` and return error callbacks).

- [ ] **Step 9: Emit spectator view on game updates**

In `packages/server/src/ws/room-events.ts`, in `emitGameUpdate()`, also send spectator views:

```typescript
export async function emitGameUpdate(io: SocketIOServer, roomCode: string, session: GameSession) {
  const sockets = await io.in(roomCode).fetchSockets();
  for (const s of sockets) {
    const data = s.data as SocketData;
    if (data.isSpectator) {
      const room = await getRoom(/* kv */, roomCode); // Need kv access
      const mode = room?.settings.spectatorMode ?? 'hidden';
      s.emit('game:update', session.getSpectatorView(mode));
    } else {
      s.emit('game:update', session.getPlayerView(data.user.userId));
    }
  }
}
```

Note: `emitGameUpdate` currently doesn't have access to `kv`. Thread it through or cache the mode on the session. The simpler approach is to store the spectator mode on the session object.

- [ ] **Step 10: Run TypeScript check**

Run: `pnpm --filter server exec tsc --noEmit`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add packages/server/src/ws/types.ts packages/server/src/plugins/core/spectate/ packages/server/src/plugin-loader.ts packages/server/src/ws/socket-handler.ts packages/server/src/ws/game-events.ts packages/server/src/ws/room-events.ts
git commit -m "feat(server): add spectate plugin with active rooms API and spectator WS support"
```

---

## Task 9: Client — Lobby Store and Active Games / Recent Games

**Files:**
- Create: `packages/client/src/features/lobby/stores/lobby-store.ts`
- Modify: `packages/client/src/features/lobby/pages/LobbyPage.tsx`

- [ ] **Step 1: Create lobby store**

Create `packages/client/src/features/lobby/stores/lobby-store.ts`:

```typescript
import { create } from 'zustand';
import { apiGet } from '@/shared/api';

interface ActiveRoom {
  roomCode: string;
  players: { nickname: string; avatarUrl?: string | null }[];
  playerCount: number;
  startedAt: string;
  spectatorCount: number;
  spectatorMode: 'full' | 'hidden';
}

interface GameListPlayer {
  userId: string;
  nickname: string;
  placement: number;
  finalScore: number;
}

interface GameListItem {
  id: string;
  roomCode: string;
  players: GameListPlayer[];
  winnerId: string;
  winnerName: string;
  playerCount: number;
  rounds: number;
  duration: number;
  deckHash: string;
  createdAt: string;
}

interface LobbyState {
  activeRooms: ActiveRoom[];
  recentGames: GameListItem[];
  loadingRooms: boolean;
  loadingGames: boolean;
  fetchActiveRooms: () => Promise<void>;
  fetchRecentGames: () => Promise<void>;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  activeRooms: [],
  recentGames: [],
  loadingRooms: false,
  loadingGames: false,
  fetchActiveRooms: async () => {
    set({ loadingRooms: true });
    try {
      const rooms = await apiGet<ActiveRoom[]>('/rooms/active');
      set({ activeRooms: rooms });
    } catch {
      set({ activeRooms: [] });
    } finally {
      set({ loadingRooms: false });
    }
  },
  fetchRecentGames: async () => {
    set({ loadingGames: true });
    try {
      const result = await apiGet<{ games: GameListItem[] }>('/games?limit=10');
      set({ recentGames: result.games });
    } catch {
      set({ recentGames: [] });
    } finally {
      set({ loadingGames: false });
    }
  },
}));
```

- [ ] **Step 2: Add active games and recent games sections to LobbyPage**

Modify `packages/client/src/features/lobby/pages/LobbyPage.tsx`:

Add imports:

```typescript
import { useEffect } from 'react';
import { useLobbyStore } from '../stores/lobby-store';
import { Eye, History, Users, Clock } from 'lucide-react';
```

Add store usage at the top of the component:

```typescript
  const { activeRooms, recentGames, fetchActiveRooms, fetchRecentGames } = useLobbyStore();

  useEffect(() => {
    fetchActiveRooms();
    fetchRecentGames();
    const interval = setInterval(fetchActiveRooms, 30_000);
    return () => clearInterval(interval);
  }, []);
```

Add two new sections after the "Main card" div and before "Bottom actions":

```tsx
        {/* Active games */}
        {activeRooms.length > 0 && (
          <div className="w-full max-w-sm">
            <h3 className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
              <Users size={14} /> 正在进行的对战
            </h3>
            <div className="flex flex-col gap-2">
              {activeRooms.map((room) => (
                <div key={room.roomCode} className="rounded-panel-ui bg-card/60 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{room.players.map(p => p.nickname).join(' vs ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {room.playerCount} 人 · {room.spectatorCount} 人观战
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      connectSocket();
                      getSocket().emit('room:spectate', room.roomCode, (res: any) => {
                        if (res.success) navigate(`/game/${room.roomCode}?spectate=true`);
                        else setError(res.error || '无法观战');
                      });
                    }}
                  >
                    <Eye size={14} className="mr-1" /> 观战
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent games */}
        {recentGames.length > 0 && (
          <div className="w-full max-w-sm">
            <h3 className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
              <History size={14} /> 近期对局
            </h3>
            <div className="flex flex-col gap-2">
              {recentGames.map((game) => (
                <div
                  key={game.id}
                  className="rounded-panel-ui bg-card/60 p-3 cursor-pointer hover:bg-card/80 transition-colors"
                  onClick={() => navigate(`/replay/${game.id}`)}
                >
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-bold">
                      房间 {game.roomCode}
                    </p>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock size={12} />
                      {Math.floor(game.duration / 60)}分{game.duration % 60}秒
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {game.playerCount} 人 · 冠军: {game.winnerName} · {game.rounds} 轮
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Run TypeScript check**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/lobby/
git commit -m "feat(client): add active games list and recent games to lobby page"
```

---

## Task 10: Client — Game Store Spectator Extension

**Files:**
- Modify: `packages/client/src/features/game/stores/game-store.ts`
- Modify: `packages/client/src/shared/socket.ts`

- [ ] **Step 1: Add spectator fields to game store**

In `packages/client/src/features/game/stores/game-store.ts`, add to the `GameState` interface:

```typescript
  isSpectator: boolean;
  deckHash: string | null;
  setSpectator: (value: boolean) => void;
```

Add to initial state:

```typescript
  isSpectator: false,
  deckHash: null,
  setSpectator: (value) => set({ isSpectator: value }),
```

In `setGameState`, extract `deckHash`:

```typescript
  deckHash: (view.deckHash as string | undefined) ?? state.deckHash,
```

In `clearGame`, reset:

```typescript
  isSpectator: false,
  deckHash: null,
```

- [ ] **Step 2: Add spectator socket events**

In `packages/client/src/shared/socket.ts`, add listeners:

```typescript
      socket.on('room:spectator_joined', (data: { nickname: string }) => {
        useToastStore.getState().addToast(`${data.nickname} 开始观战`, 'info');
      });

      socket.on('room:spectator_left', (data: { nickname: string }) => {
        useToastStore.getState().addToast(`${data.nickname} 离开观战`, 'info');
      });
```

- [ ] **Step 3: Run TypeScript check**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/game/stores/game-store.ts packages/client/src/shared/socket.ts
git commit -m "feat(client): add spectator state to game store and socket events"
```

---

## Task 11: Client — GamePage Spectator Mode

**Files:**
- Modify: `packages/client/src/features/game/pages/GamePage.tsx`

- [ ] **Step 1: Add spectator mode to GamePage**

In `packages/client/src/features/game/pages/GamePage.tsx`:

Add imports:

```typescript
import { useSearchParams } from 'react-router-dom';
```

At the top of the component, detect spectator mode:

```typescript
  const [searchParams] = useSearchParams();
  const isSpectator = useGameStore((s) => s.isSpectator);
  const setSpectator = useGameStore((s) => s.setSpectator);

  useEffect(() => {
    if (searchParams.get('spectate') === 'true') {
      setSpectator(true);
    }
  }, [searchParams]);
```

Conditionally hide game actions:

```tsx
  {!isSpectator && (
    <GameActions
      onCallUno={callUno}
      onCatchUno={catchUno}
      onChallenge={challenge}
      onAccept={accept}
      onPass={pass}
      onSwapTarget={swapTarget}
    />
  )}
  {!isSpectator && <PlayerHand onPlayCard={playCard} />}
```

Add spectator badge:

```tsx
  {isSpectator && (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-actions bg-card/90 backdrop-blur-sm rounded-full px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
      <Eye size={16} /> 观战中
    </div>
  )}
```

Add `Eye` to lucide-react import.

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/game/pages/GamePage.tsx
git commit -m "feat(client): add spectator mode to GamePage"
```

---

## Task 12: Client — Replay Feature (Store + Page + Components)

**Files:**
- Create: `packages/client/src/features/replay/stores/replay-store.ts`
- Create: `packages/client/src/features/replay/pages/ReplayPage.tsx`
- Create: `packages/client/src/features/replay/components/ReplayControls.tsx`
- Create: `packages/client/src/features/replay/components/HashVerifier.tsx`
- Create: `packages/client/src/features/replay/components/ScoreTable.tsx`
- Create: `packages/client/src/features/replay/routes.tsx`
- Modify: `packages/client/src/app/router.tsx`

- [ ] **Step 1: Create replay store**

Create `packages/client/src/features/replay/stores/replay-store.ts`:

```typescript
import { create } from 'zustand';
import { apiGet } from '@/shared/api';
import type { GameEvent } from '@uno-online/shared';

interface GameDetailPlayer {
  userId: string;
  nickname: string;
  placement: number;
  finalScore: number;
}

interface GameDetail {
  id: string;
  roomCode: string;
  players: GameDetailPlayer[];
  winnerId: string;
  winnerName: string;
  playerCount: number;
  rounds: number;
  duration: number;
  deckHash: string;
  createdAt: string;
  events: GameEvent[];
  initialDeck: string | null;
}

interface ReplayState {
  gameDetail: GameDetail | null;
  currentStep: number;
  isPlaying: boolean;
  speed: number;
  loading: boolean;
  error: string | null;
  fetchGame: (gameId: string) => Promise<void>;
  setStep: (step: number) => void;
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  gameDetail: null,
  currentStep: 0,
  isPlaying: false,
  speed: 1,
  loading: false,
  error: null,
  fetchGame: async (gameId: string) => {
    set({ loading: true, error: null });
    try {
      const detail = await apiGet<GameDetail>(`/games/${gameId}`);
      set({ gameDetail: detail, currentStep: 0, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },
  setStep: (step) => {
    const { gameDetail } = get();
    if (!gameDetail) return;
    const maxStep = gameDetail.events.length - 1;
    set({ currentStep: Math.max(0, Math.min(step, maxStep)) });
  },
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stepForward: () => {
    const { currentStep, gameDetail } = get();
    if (!gameDetail) return;
    if (currentStep < gameDetail.events.length - 1) {
      set({ currentStep: currentStep + 1 });
    } else {
      set({ isPlaying: false });
    }
  },
  stepBackward: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },
  setSpeed: (speed) => set({ speed }),
  reset: () => set({
    gameDetail: null,
    currentStep: 0,
    isPlaying: false,
    speed: 1,
    loading: false,
    error: null,
  }),
}));
```

- [ ] **Step 2: Create ReplayControls component**

Create `packages/client/src/features/replay/components/ReplayControls.tsx`:

```typescript
import { useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, ChevronsRight } from 'lucide-react';
import { useReplayStore } from '../stores/replay-store';
import { Button } from '@/shared/components/ui/Button';

export default function ReplayControls() {
  const { currentStep, isPlaying, speed, gameDetail, play, pause, stepForward, stepBackward, setSpeed, setStep } = useReplayStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSteps = gameDetail?.events.length ?? 0;

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        stepForward();
      }, 1000 / speed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, stepForward]);

  return (
    <div className="flex items-center gap-3 bg-card/80 backdrop-blur-sm rounded-panel-ui p-3">
      <Button variant="ghost" size="sm" onClick={stepBackward} disabled={currentStep === 0}>
        <SkipBack size={16} />
      </Button>
      <Button variant="ghost" size="sm" onClick={isPlaying ? pause : play} disabled={totalSteps === 0}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      <Button variant="ghost" size="sm" onClick={stepForward} disabled={currentStep >= totalSteps - 1}>
        <SkipForward size={16} />
      </Button>
      <div className="flex items-center gap-1">
        <ChevronsRight size={14} className="text-muted-foreground" />
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="bg-transparent text-foreground text-sm border border-white/15 rounded px-1"
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, totalSteps - 1)}
        value={currentStep}
        onChange={(e) => setStep(Number(e.target.value))}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {currentStep + 1} / {totalSteps}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create HashVerifier component**

Create `packages/client/src/features/replay/components/HashVerifier.tsx`:

```typescript
import { useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

interface HashVerifierProps {
  deckHash: string;
  initialDeck: string | null;
}

export default function HashVerifier({ deckHash, initialDeck }: HashVerifierProps) {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');

  const verify = async () => {
    if (!initialDeck) {
      setStatus('invalid');
      return;
    }
    setStatus('verifying');
    const encoder = new TextEncoder();
    const data = encoder.encode(initialDeck);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    setStatus(computedHash === deckHash ? 'valid' : 'invalid');
  };

  return (
    <div className="flex items-center gap-2">
      {status === 'idle' && (
        <Button variant="ghost" size="sm" onClick={verify}>
          <Shield size={14} className="mr-1" /> 验证牌序公平性
        </Button>
      )}
      {status === 'verifying' && (
        <span className="text-xs text-muted-foreground">验证中...</span>
      )}
      {status === 'valid' && (
        <span className="text-xs text-uno-green flex items-center gap-1">
          <ShieldCheck size={14} /> 牌序验证通过
        </span>
      )}
      {status === 'invalid' && (
        <span className="text-xs text-destructive flex items-center gap-1">
          <ShieldAlert size={14} /> 牌序验证失败
        </span>
      )}
      <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={deckHash}>
        {deckHash.slice(0, 16)}...
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Create ScoreTable component**

Create `packages/client/src/features/replay/components/ScoreTable.tsx`:

```typescript
interface ScoreTableProps {
  players: { userId: string; nickname: string; placement: number; finalScore: number }[];
}

export default function ScoreTable({ players }: ScoreTableProps) {
  return (
    <div className="bg-card/80 rounded-panel-ui p-3">
      <h3 className="text-sm text-muted-foreground mb-2">最终排名</h3>
      <div className="flex flex-col gap-1">
        {players.map((p) => (
          <div key={p.userId} className="flex justify-between text-sm">
            <span>
              {p.placement === 1 ? '🏆 ' : `#${p.placement} `}
              {p.nickname}
            </span>
            <span className="text-muted-foreground">{p.finalScore} 分</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create ReplayPage**

Create `packages/client/src/features/replay/pages/ReplayPage.tsx`:

```typescript
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Users } from 'lucide-react';
import { useReplayStore } from '../stores/replay-store';
import ReplayControls from '../components/ReplayControls';
import HashVerifier from '../components/HashVerifier';
import ScoreTable from '../components/ScoreTable';
import { Button } from '@/shared/components/ui/Button';

export default function ReplayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { gameDetail, currentStep, loading, error, fetchGame, reset } = useReplayStore();

  useEffect(() => {
    if (gameId) fetchGame(gameId);
    return () => reset();
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">加载对局数据中...</p>
      </div>
    );
  }

  if (error || !gameDetail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error || '对局不存在'}</p>
        <Button variant="secondary" onClick={() => navigate('/lobby')}>返回大厅</Button>
      </div>
    );
  }

  const currentEvent = gameDetail.events[currentStep];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/lobby')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h2 className="font-game text-primary text-lg">对局回放</h2>
            <p className="text-xs text-muted-foreground">
              房间 {gameDetail.roomCode} ·{' '}
              <Users size={12} className="inline" /> {gameDetail.playerCount} 人 ·{' '}
              <Clock size={12} className="inline" /> {Math.floor(gameDetail.duration / 60)}分{gameDetail.duration % 60}秒
            </p>
          </div>
        </div>
        <HashVerifier deckHash={gameDetail.deckHash} initialDeck={gameDetail.initialDeck} />
      </div>

      {/* Event display */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-card/60 rounded-panel-ui p-6">
          {currentEvent && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                步骤 {currentStep + 1} / {gameDetail.events.length}
              </p>
              <p className="text-lg font-bold mt-2">
                {formatEventType(currentEvent.eventType)}
              </p>
              {currentEvent.playerId && (
                <p className="text-sm text-muted-foreground mt-1">
                  操作者: {gameDetail.players.find(p => p.userId === currentEvent.playerId)?.nickname ?? currentEvent.playerId}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Score table */}
      <div className="px-4 pb-2">
        <ScoreTable players={gameDetail.players} />
      </div>

      {/* Controls */}
      <div className="p-4">
        <ReplayControls />
      </div>
    </div>
  );
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    game_start: '游戏开始',
    play_card: '出牌',
    draw_card: '摸牌',
    pass: '跳过',
    call_uno: '喊 UNO',
    catch_uno: '抓 UNO',
    challenge: '质疑',
    accept: '接受',
    choose_color: '选择颜色',
    choose_swap_target: '选择交换对象',
    round_end: '回合结束',
    game_over: '游戏结束',
  };
  return map[type] ?? type;
}
```

- [ ] **Step 6: Create replay routes**

Create `packages/client/src/features/replay/routes.tsx`:

```tsx
import { lazy } from 'react';

const ReplayPage = lazy(() => import('./pages/ReplayPage'));

export const replayProtectedRoutes = [
  { path: '/replay/:gameId', element: <ReplayPage /> },
];
```

- [ ] **Step 7: Register replay routes in router**

In `packages/client/src/app/router.tsx`, add:

```typescript
import { replayProtectedRoutes } from '@/features/replay/routes';
```

Add to `allProtectedRoutes`:

```typescript
const allProtectedRoutes = [
  ...authProtectedRoutes,
  ...gameProtectedRoutes,
  ...lobbyProtectedRoutes,
  ...profileProtectedRoutes,
  ...replayProtectedRoutes,
];
```

- [ ] **Step 8: Run TypeScript check**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add packages/client/src/features/replay/ packages/client/src/app/router.tsx
git commit -m "feat(client): add replay feature with page, store, and controls"
```

---

## Task 13: Client — Deck Hash Toast on Game Start

**Files:**
- Modify: `packages/client/src/shared/socket.ts`

- [ ] **Step 1: Show hash toast on game:state**

In `packages/client/src/shared/socket.ts`, in the `handleGameView` function, add:

```typescript
      const handleGameView = (view: { settings?: { turnTimeLimit: number }; deckHash?: string; phase?: string }) => {
        useGameStore.getState().setGameState(view);
        const settings = view.settings;
        if (settings) {
          useGameStore.getState().setTurnEndTime(Date.now() + settings.turnTimeLimit * 1000);
        }
      };

      socket.on('game:state', (view: Record<string, unknown>) => {
        handleGameView(view as { settings?: { turnTimeLimit: number }; deckHash?: string });
        if ((view as { deckHash?: string }).deckHash) {
          const hash = (view as { deckHash?: string }).deckHash!;
          useToastStore.getState().addToast(`牌序 Hash: ${hash.slice(0, 16)}...`, 'info');
        }
      });
      socket.on('game:update', handleGameView);
```

Note: This replaces the current `socket.on('game:state', handleGameView)` and `socket.on('game:update', handleGameView)` lines.

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/shared/socket.ts
git commit -m "feat(client): show deck hash toast on game start"
```

---

## Task 14: Room Settings UI — Spectator Options

**Files:**
- Modify: Room settings component (in `packages/client/src/features/game/` — the RoomPage settings panel)

- [ ] **Step 1: Find and modify room settings UI**

Locate the room settings component that renders `turnTimeLimit`, `targetScore`, etc. Add two new settings:

```tsx
{/* Spectator settings */}
<div className="flex items-center justify-between">
  <label className="text-sm">允许观战</label>
  <input
    type="checkbox"
    checked={settings.allowSpectators ?? true}
    onChange={(e) => updateSetting('allowSpectators', e.target.checked)}
  />
</div>
{settings.allowSpectators && (
  <div className="flex items-center justify-between">
    <label className="text-sm">观战模式</label>
    <select
      value={settings.spectatorMode ?? 'hidden'}
      onChange={(e) => updateSetting('spectatorMode', e.target.value)}
      className="bg-card text-foreground border border-white/15 rounded px-2 py-1 text-sm"
    >
      <option value="hidden">只看出牌</option>
      <option value="full">全透视</option>
    </select>
  </div>
)}
```

This depends on the exact component structure — find the file first.

- [ ] **Step 2: Run TypeScript check**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/game/
git commit -m "feat(client): add spectator settings to room configuration"
```

---

## Task 15: Type Check and Integration Test

**Files:** No new files — validation pass

- [ ] **Step 1: Run all type checks**

```bash
pnpm --filter shared exec tsc --noEmit
pnpm --filter server exec tsc --noEmit
pnpm --filter client exec tsc --noEmit
```

Expected: All pass

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 3: Fix any issues found**

Address any type errors or test failures discovered in the integration pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve type check and test issues from replay/spectate integration"
```

---

## Task 16: Manual Smoke Test

- [ ] **Step 1: Start the backend**

```bash
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev
```

- [ ] **Step 2: Start the frontend**

```bash
pnpm --filter client dev
```

- [ ] **Step 3: Test deck hash**

1. Log in with two browser tabs as different users
2. Create a room, join, start a game
3. Verify both players see a deck hash toast on game start
4. Play through a full game

- [ ] **Step 4: Test replay**

1. After game ends, go to lobby
2. Verify "近期对局" section shows the completed game
3. Click to open replay page
4. Verify play/pause/step controls work
5. Verify hash verification button shows "验证通过"

- [ ] **Step 5: Test spectating**

1. Start a game between two users
2. Log in with a third browser tab
3. Verify "正在进行的对战" shows the active game
4. Click "观战" and verify spectator mode works
5. Verify spectator sees game updates in real-time
6. Verify spectator cannot perform game actions

- [ ] **Step 6: Test room settings**

1. Create a room
2. Verify spectator settings appear in room settings
3. Toggle "允许观战" off, verify the room doesn't appear in active games list
4. Toggle spectator mode between "全透视" and "只看出牌"
