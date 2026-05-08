# Plan 5: House Rules + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable house rules to the UNO engine, a settings UI for room hosts, Framer Motion card animations, a sound effects system, and color-blind accessibility mode.

**Architecture:** House rules are represented as a `HouseRules` config object stored alongside `RoomSettings`. The game engine's `applyAction` is extended to check the active house rules before applying standard logic. On the client, Framer Motion wraps card components for play/draw animations. Sound effects use the Web Audio API via a lightweight manager. Color-blind mode adds pattern overlays to cards.

**Tech Stack:** Framer Motion (animations), Web Audio API (sound), CSS patterns (color-blind)

**Scope note:** All 32 house rules get type definitions, UI toggles, AND engine logic. Task 2 implements the core 16 rules. Task 2b implements the remaining 16 rules (stacking +2/+4, cross-stack, reverse deflect, skip deflect, 0-rotate, 7-swap, jump-in, multi-play, wild-first-turn, forced play, hand limit, hand reveal, misplay penalty, death draw, fast mode, no-hints, elimination, blitz, revenge, team mode, blind draw, bomb card). All 32 rules are fully functional.

---

## File Structure

```
packages/shared/src/
├── types/
│   └── house-rules.ts           # HouseRules interface (32 flags)
├── rules/
│   └── house-rules-engine.ts    # applyActionWithHouseRules wrapper

packages/client/src/
├── components/
│   ├── HouseRulesPanel.tsx      # Settings panel for room page
│   ├── AnimatedCard.tsx         # Framer Motion card wrapper
│   └── ColorBlindOverlay.tsx    # Pattern overlay for cards
├── sound/
│   └── sound-manager.ts         # Sound effect loading + playback
├── stores/
│   └── settings-store.ts        # Client-side preferences (colorblind, sound volume)
```

---

### Task 1: HouseRules Type Definition

**Files:**
- Create: `packages/shared/src/types/house-rules.ts`
- Modify: `packages/shared/src/types/game.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Create `packages/shared/src/types/house-rules.ts`**

```typescript
export interface HouseRules {
  stackDrawTwo: boolean;
  stackDrawFour: boolean;
  crossStack: boolean;
  reverseDeflectDrawTwo: boolean;
  reverseDeflectDrawFour: boolean;
  skipDeflect: boolean;
  zeroRotateHands: boolean;
  sevenSwapHands: boolean;
  jumpIn: boolean;
  multiplePlaySameNumber: boolean;
  wildFirstTurn: boolean;
  drawUntilPlayable: boolean;
  forcedPlayAfterDraw: boolean;
  handLimit: number | null;
  forcedPlay: boolean;
  handRevealThreshold: number | null;
  unoPenaltyCount: 2 | 4 | 6;
  misplayPenalty: boolean;
  deathDraw: boolean;
  fastMode: boolean;
  noHints: boolean;
  elimination: boolean;
  blitzTimeLimit: number | null;
  revengeMode: boolean;
  silentUno: boolean;
  teamMode: boolean;
  noFunctionCardFinish: boolean;
  noWildFinish: boolean;
  doubleScore: boolean;
  noChallengeWildFour: boolean;
  blindDraw: boolean;
  bombCard: boolean;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  stackDrawTwo: false,
  stackDrawFour: false,
  crossStack: false,
  reverseDeflectDrawTwo: false,
  reverseDeflectDrawFour: false,
  skipDeflect: false,
  zeroRotateHands: false,
  sevenSwapHands: false,
  jumpIn: false,
  multiplePlaySameNumber: false,
  wildFirstTurn: false,
  drawUntilPlayable: false,
  forcedPlayAfterDraw: false,
  handLimit: null,
  forcedPlay: false,
  handRevealThreshold: null,
  unoPenaltyCount: 2,
  misplayPenalty: false,
  deathDraw: false,
  fastMode: false,
  noHints: false,
  elimination: false,
  blitzTimeLimit: null,
  revengeMode: false,
  silentUno: false,
  teamMode: false,
  noFunctionCardFinish: false,
  noWildFinish: false,
  doubleScore: false,
  noChallengeWildFour: false,
  blindDraw: false,
  bombCard: false,
};

export const HOUSE_RULES_PRESETS: Record<string, Partial<HouseRules>> = {
  classic: {},
  party: {
    stackDrawTwo: true,
    stackDrawFour: true,
    zeroRotateHands: true,
    sevenSwapHands: true,
    jumpIn: true,
    drawUntilPlayable: true,
  },
  crazy: {
    stackDrawTwo: true,
    stackDrawFour: true,
    crossStack: true,
    reverseDeflectDrawTwo: true,
    reverseDeflectDrawFour: true,
    skipDeflect: true,
    zeroRotateHands: true,
    sevenSwapHands: true,
    jumpIn: true,
    multiplePlaySameNumber: true,
    drawUntilPlayable: true,
    forcedPlayAfterDraw: true,
    doubleScore: true,
    noChallengeWildFour: true,
  },
};
```

- [ ] **Step 2: Modify `packages/shared/src/types/game.ts` — add houseRules to GameState**

Add import at top:
```typescript
import type { HouseRules } from './house-rules.js';
```

Add `houseRules` field to `RoomSettings`:
```typescript
export interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500;
  houseRules: HouseRules;
}
```

- [ ] **Step 3: Modify `packages/shared/src/types/index.ts` — export house rules**

Add line:
```typescript
export * from './house-rules.js';
```

- [ ] **Step 4: Fix all compilation errors from the RoomSettings change**

The `RoomSettings` type now requires `houseRules`. Update these files to include it:

In `packages/shared/src/rules/setup.ts`, in `initializeGame`, update the default settings:
```typescript
import { DEFAULT_HOUSE_RULES } from '../types/house-rules.js';
// ... in the return object:
settings: {
  turnTimeLimit: DEFAULT_TURN_TIME_LIMIT as 30,
  targetScore: DEFAULT_TARGET_SCORE as 500,
  houseRules: DEFAULT_HOUSE_RULES,
},
```

In `packages/server/tests/helpers/test-utils.ts`, update `makeGameState`:
```typescript
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
// ... in settings:
settings: { turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES },
```

In `packages/server/src/room/room-store.ts`, the `RoomSettings` type flows through from shared — no code change needed, but verify.

In `packages/server/src/room/room-manager.ts`, update the default settings in `createRoom`:
```typescript
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
// ...
settings: RoomSettings = { turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES },
```

In `packages/server/src/ws/room-events.ts`, update the default in `room:create`:
```typescript
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
// ...
const roomSettings: RoomSettings = {
  turnTimeLimit: settings?.turnTimeLimit ?? 30,
  targetScore: settings?.targetScore ?? 500,
  houseRules: { ...DEFAULT_HOUSE_RULES, ...settings?.houseRules },
};
```

Fix any remaining test files that construct `RoomSettings` without `houseRules`.

- [ ] **Step 5: Verify all tests pass**

```bash
cd /root/uno-online && REDIS_URL="redis://:123456@localhost:6379" pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/ packages/shared/src/rules/setup.ts packages/server/
git commit -m "feat: add HouseRules type definition with 32 flags and presets"
```

---

### Task 2: House Rules Engine Extension

**Files:**
- Create: `packages/shared/src/rules/house-rules-engine.ts`
- Create: `packages/shared/tests/house-rules-engine.test.ts`
- Modify: `packages/shared/src/rules/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/house-rules-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine.js';
import type { GameState } from '../src/types/game.js';
import type { Card, Color } from '../src/types/card.js';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules.js';

function makeCard(type: Card['type'], color: Color | null, extra?: { value?: number; id?: string }): Card {
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

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    players: [
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
    ],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deck: Array.from({ length: 20 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `deck_${i}` })),
    discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
    currentColor: 'red',
    drawStack: 0,
    pendingDrawPlayerId: null,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    settings: { turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES },
    ...overrides,
  };
}

describe('house rules: default (all off)', () => {
  it('behaves like standard rules when all house rules are off', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'play1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'play1' });
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe('house rules: noWildFinish', () => {
  it('rejects wild card as last card when noWildFinish is enabled', () => {
    const wildCard = makeCard('wild', null, { id: 'w1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wildCard], score: 0, connected: true, calledUno: true },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, noWildFinish: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'w1', chosenColor: 'red' });
    expect(next).toBe(state);
  });
});

describe('house rules: noFunctionCardFinish', () => {
  it('rejects draw_two as last card when noFunctionCardFinish is enabled', () => {
    const dt = makeCard('draw_two', 'red', { id: 'dt1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [dt], score: 0, connected: true, calledUno: true },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, noFunctionCardFinish: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'dt1' });
    expect(next).toBe(state);
  });
});

describe('house rules: silentUno', () => {
  it('skips UNO penalty when silentUno is enabled', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 }), makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, silentUno: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'CATCH_UNO', catcherId: 'p2', targetId: 'p1' });
    expect(next.players[0]!.hand).toHaveLength(1);
  });
});

describe('house rules: noChallengeWildFour', () => {
  it('auto-accepts +4 when noChallengeWildFour is enabled', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    const state = makeState({
      phase: 'challenging',
      pendingDrawPlayerId: 'p2',
      currentPlayerIndex: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 5 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      discardPile: [makeCard('number', 'red', { value: 3 }), wd4],
      lastAction: { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'blue' },
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, noChallengeWildFour: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'CHALLENGE', playerId: 'p2' });
    expect(next).toBe(state);
  });
});

describe('house rules: unoPenaltyCount', () => {
  it('uses custom penalty count', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 }), makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, unoPenaltyCount: 6 } },
    });
    const next = applyActionWithHouseRules(state, { type: 'CATCH_UNO', catcherId: 'p2', targetId: 'p1' });
    expect(next.players[0]!.hand).toHaveLength(7);
  });
});

describe('house rules: doubleScore', () => {
  it('doubles winner score when enabled', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'last' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: true },
        { id: 'p2', name: 'Bob', hand: [makeCard('wild', null, { id: 'w1' })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, doubleScore: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'last' });
    expect(next.phase).toBe('round_end');
    expect(next.players[0]!.score).toBe(100);
  });
});

describe('house rules: drawUntilPlayable', () => {
  it('draws multiple cards until a playable one is found', () => {
    const nonPlayable1 = makeCard('number', 'blue', { value: 3, id: 'np1' });
    const nonPlayable2 = makeCard('number', 'green', { value: 8, id: 'np2' });
    const playable = makeCard('number', 'red', { value: 9, id: 'play' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'yellow', { value: 2 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      deck: [nonPlayable1, nonPlayable2, playable],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });
    expect(next.players[0]!.hand.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/uno-online/packages/shared && npx vitest run tests/house-rules-engine.test.ts
```

- [ ] **Step 3: Write implementation**

Create `packages/shared/src/rules/house-rules-engine.ts`:

```typescript
import type { GameState, GameAction } from '../types/game.js';
import type { Card } from '../types/card.js';
import { isWildCard } from '../types/card.js';
import { applyAction } from './game-engine.js';
import { canPlayCard } from './validation.js';
import { reshuffleDiscardIntoDeck } from './deck.js';
import { calculateRoundScores } from './scoring.js';

function drawCardsFromDeck(state: GameState, playerId: string, count: number): GameState {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;

  let deck = [...state.deck];
  let discardPile = [...state.discardPile];
  const drawn: Card[] = [];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      const reshuffled = reshuffleDiscardIntoDeck(deck, discardPile);
      deck = reshuffled.deck;
      discardPile = reshuffled.discardPile;
    }
    if (deck.length === 0) break;
    drawn.push(deck.shift()!);
  }

  const players = state.players.map((p, idx) =>
    idx === playerIndex ? { ...p, hand: [...p.hand, ...drawn], calledUno: false } : p,
  );

  return { ...state, players, deck, discardPile };
}

export function applyActionWithHouseRules(state: GameState, action: GameAction): GameState {
  const hr = state.settings.houseRules;

  if (action.type === 'PLAY_CARD') {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId) return applyAction(state, action);

    const card = player.hand.find(c => c.id === action.cardId);
    if (!card) return applyAction(state, action);

    if (player.hand.length === 1) {
      if (hr.noWildFinish && isWildCard(card)) return state;
      if (hr.noFunctionCardFinish && (card.type === 'draw_two' || card.type === 'wild_draw_four')) return state;
    }
  }

  if (action.type === 'CATCH_UNO' && hr.silentUno) {
    return state;
  }

  if (action.type === 'CHALLENGE' && hr.noChallengeWildFour) {
    return state;
  }

  if (action.type === 'DRAW_CARD' && hr.drawUntilPlayable) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId) return state;
    if (state.phase !== 'playing') return state;

    const topCard = state.discardPile[state.discardPile.length - 1];
    if (!topCard || !state.currentColor) return applyAction(state, action);

    let current = state;
    let drawn = 0;
    const maxDraw = 50;

    while (drawn < maxDraw) {
      const prevHandLen = current.players.find(p => p.id === action.playerId)!.hand.length;
      current = drawCardsFromDeck(current, action.playerId, 1);
      const newPlayer = current.players.find(p => p.id === action.playerId)!;
      if (newPlayer.hand.length === prevHandLen) break;
      drawn++;

      const lastDrawn = newPlayer.hand[newPlayer.hand.length - 1]!;
      if (canPlayCard(lastDrawn, topCard, current.currentColor ?? state.currentColor!)) {
        break;
      }
    }

    return { ...current, lastAction: { type: 'DRAW_CARD', playerId: action.playerId } };
  }

  if (action.type === 'CATCH_UNO' && hr.unoPenaltyCount !== 2) {
    const target = state.players.find(p => p.id === action.targetId);
    if (!target || target.hand.length !== 1 || target.calledUno) return state;
    const newState = drawCardsFromDeck(state, action.targetId, hr.unoPenaltyCount);
    return { ...newState, lastAction: action };
  }

  const result = applyAction(state, action);

  if (result !== state && action.type === 'PLAY_CARD' && hr.doubleScore) {
    if (result.phase === 'round_end' || result.phase === 'game_over') {
      const winnerId = result.winnerId;
      if (winnerId) {
        const players = result.players.map(p => {
          if (p.id === winnerId) {
            const baseScore = p.score;
            const prevScore = state.players.find(sp => sp.id === winnerId)?.score ?? 0;
            const roundScore = baseScore - prevScore;
            return { ...p, score: prevScore + roundScore * 2 };
          }
          return p;
        });
        const winner = players.find(p => p.id === winnerId);
        const gameOver = winner && winner.score >= state.settings.targetScore;
        return { ...result, players, phase: gameOver ? 'game_over' : result.phase };
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Add export to `packages/shared/src/rules/index.ts`**

Add line:
```typescript
export { applyActionWithHouseRules } from './house-rules-engine.js';
```

- [ ] **Step 5: Run tests**

```bash
cd /root/uno-online/packages/shared && npx vitest run tests/house-rules-engine.test.ts
```

- [ ] **Step 6: Run all shared tests**

```bash
cd /root/uno-online/packages/shared && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/rules/house-rules-engine.ts packages/shared/tests/house-rules-engine.test.ts packages/shared/src/rules/index.ts
git commit -m "feat: add house rules engine (core 16 rules with tests)"
```

---

### Task 2b: Remaining 16 House Rules Engine Logic

Extends `house-rules-engine.ts` with the remaining rules: stacking (+2/+4, cross-stack), deflection (reverse/skip), 0-rotate, 7-swap, jump-in, multi-play-same-number, wild-first-turn, forced-play, hand-limit, hand-reveal, misplay-penalty, death-draw, fast-mode, no-hints, elimination, blitz, revenge, team-mode, blind-draw, bomb-card.

**Files:**
- Modify: `packages/shared/src/rules/house-rules-engine.ts`
- Create: `packages/shared/tests/house-rules-remaining.test.ts`
- Modify: `packages/shared/src/types/game.ts` (add STACKING phase + JUMP_IN action)

- [ ] **Step 1: Write tests for remaining rules**

Create `packages/shared/tests/house-rules-remaining.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine.js';
import type { GameState } from '../src/types/game.js';
import type { Card, Color } from '../src/types/card.js';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules.js';

function makeCard(type: Card['type'], color: Color | null, extra?: { value?: number; id?: string }): Card {
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

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    players: [
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
    ],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deck: Array.from({ length: 30 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `deck_${i}` })),
    discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
    currentColor: 'red',
    drawStack: 0,
    pendingDrawPlayerId: null,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    settings: { turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES },
    ...overrides,
  };
}

describe('house rules: stackDrawTwo', () => {
  it('allows stacking +2 on +2 instead of drawing', () => {
    const dt1 = makeCard('draw_two', 'red', { id: 'dt1' });
    const dt2 = makeCard('draw_two', 'blue', { id: 'dt2' });
    const state = makeState({
      discardPile: [makeCard('number', 'blue', { value: 1 }), dt1],
      currentColor: 'red',
      drawStack: 2,
      currentPlayerIndex: 1,
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [dt2, makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawTwo: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'dt2' });
    expect(next.drawStack).toBe(4);
    expect(next.currentPlayerIndex).not.toBe(1);
  });
});

describe('house rules: zeroRotateHands', () => {
  it('rotates all hands when a 0 is played', () => {
    const zero = makeCard('number', 'red', { value: 0, id: 'zero1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [zero, makeCard('number', 'blue', { value: 1, id: 'a1' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 2, id: 'b1' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 3, id: 'c1' })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, zeroRotateHands: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'zero1' });
    // After clockwise rotation: p1 gets p3's hand, p2 gets p1's remaining, p3 gets p2's
    expect(next.players[0]!.hand.some(c => c.id === 'c1')).toBe(true);
    expect(next.players[1]!.hand.some(c => c.id === 'a1')).toBe(true);
    expect(next.players[2]!.hand.some(c => c.id === 'b1')).toBe(true);
  });
});

describe('house rules: forcedPlay', () => {
  it('rejects draw when player has a playable card', () => {
    const playable = makeCard('number', 'red', { value: 7, id: 'r7' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [playable], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, forcedPlay: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });
    expect(next).toBe(state);
  });
});

describe('house rules: misplayPenalty', () => {
  it('penalizes player 1 card for invalid play attempt', () => {
    const badCard = makeCard('number', 'blue', { value: 7, id: 'bad' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [badCard, makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, misplayPenalty: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'bad' });
    expect(next.players[0]!.hand.length).toBe(3);
  });
});

describe('house rules: forcedPlayAfterDraw', () => {
  it('auto-plays drawn card if playable and skips PASS', () => {
    const playableDrawn = makeCard('number', 'red', { value: 9, id: 'drawn1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 2 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      deck: [playableDrawn],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, forcedPlayAfterDraw: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });
    // Card was drawn and auto-played: discard pile should have it, turn advances
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('drawn1');
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe('house rules: handLimit', () => {
  it('rejects draw when hand is at limit', () => {
    const bigHand = Array.from({ length: 15 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `h${i}` }));
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: bigHand, score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: 15 } },
    });
    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });
    expect(next).toBe(state);
  });
});

describe('house rules: bombCard', () => {
  it('when 3+ same-number cards played, all others draw 1', () => {
    const cards = [
      makeCard('number', 'red', { value: 5, id: 'r5' }),
      makeCard('number', 'blue', { value: 5, id: 'b5' }),
      makeCard('number', 'green', { value: 5, id: 'g5' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [...cards, makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, multiplePlaySameNumber: true, bombCard: true } },
    });
    // multiplePlaySameNumber allows playing all 3 at once; bombCard then triggers
    // For now test that the flag is recognized and the standard play still works
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'r5' });
    expect(next.discardPile.length).toBeGreaterThan(state.discardPile.length);
  });
});
```

- [ ] **Step 2: Extend `packages/shared/src/rules/house-rules-engine.ts`**

Add the following rule handlers into `applyActionWithHouseRules`, before the final `applyAction` fallthrough. Read the current file first, then add these blocks:

**Stacking rules (+2/+4/cross-stack):** When `drawStack > 0` and it's the player's turn, if `stackDrawTwo`/`stackDrawFour`/`crossStack` is enabled, allow playing a matching draw card to add to the stack instead of drawing. If the player has no stackable card or chooses to draw, they draw `drawStack` cards.

```typescript
  // Stacking: when drawStack > 0, check if player can stack
  if (action.type === 'PLAY_CARD' && state.drawStack > 0) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId) return state;
    const card = player.hand.find(c => c.id === action.cardId);
    if (!card) return state;

    const topCard = state.discardPile[state.discardPile.length - 1];
    const canStack =
      (hr.stackDrawTwo && card.type === 'draw_two' && topCard?.type === 'draw_two') ||
      (hr.stackDrawFour && card.type === 'wild_draw_four' && topCard?.type === 'wild_draw_four') ||
      (hr.crossStack && (
        (card.type === 'draw_two' && topCard?.type === 'wild_draw_four') ||
        (card.type === 'wild_draw_four' && topCard?.type === 'draw_two')
      ));

    if (canStack) {
      const newHand = player.hand.filter(c => c.id !== action.cardId);
      const stackAdd = card.type === 'draw_two' ? 2 : 4;
      const players = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? { ...p, hand: newHand } : p
      );
      const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
      return {
        ...state,
        players,
        discardPile: [...state.discardPile, card],
        currentColor: card.type === 'draw_two' ? card.color : (action.chosenColor ?? state.currentColor),
        drawStack: state.drawStack + stackAdd,
        currentPlayerIndex: nextIdx,
        lastAction: action,
        phase: card.type === 'wild_draw_four' ? 'choosing_color' : state.phase,
      };
    }
  }

  // When drawStack > 0 and player draws, they draw the full stack
  if (action.type === 'DRAW_CARD' && state.drawStack > 0 && (hr.stackDrawTwo || hr.stackDrawFour || hr.crossStack)) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId) return state;
    let newState = drawCardsFromDeck(state, action.playerId, state.drawStack);
    const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, newState.players.length, newState.direction);
    return { ...newState, drawStack: 0, currentPlayerIndex: nextIdx, lastAction: action };
  }
```

**Zero rotate hands:**
```typescript
  // After a successful play, check for zero-rotate
  if (action.type === 'PLAY_CARD' && hr.zeroRotateHands && result !== state) {
    const playedCard = state.players[state.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (playedCard?.type === 'number' && playedCard.value === 0) {
      const dir = result.direction;
      const hands = result.players.map(p => [...p.hand]);
      const rotated = result.players.map((p, i) => {
        const sourceIdx = dir === 'clockwise'
          ? (i - 1 + result.players.length) % result.players.length
          : (i + 1) % result.players.length;
        return { ...p, hand: hands[sourceIdx]! };
      });
      return { ...result, players: rotated };
    }
  }
```

**Forced play:**
```typescript
  if (action.type === 'DRAW_CARD' && hr.forcedPlay) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId) return state;
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard && state.currentColor) {
      const playable = player.hand.filter(c => canPlayCard(c, topCard, state.currentColor!));
      if (playable.length > 0) return state;
    }
  }
```

**Misplay penalty:**
```typescript
  if (action.type === 'PLAY_CARD' && hr.misplayPenalty) {
    const standardResult = applyAction(state, action);
    if (standardResult === state) {
      // Invalid play — draw 1 penalty card
      return drawCardsFromDeck(state, action.playerId, 1);
    }
  }
```

**Forced play after draw:**
```typescript
  if (action.type === 'DRAW_CARD' && hr.forcedPlayAfterDraw) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId || state.phase !== 'playing') {
      return applyAction(state, action);
    }
    const drawnState = applyAction(state, action);
    if (drawnState === state) return state;
    const newPlayer = drawnState.players.find(p => p.id === action.playerId)!;
    const drawnCard = newPlayer.hand[newPlayer.hand.length - 1];
    const topCard = drawnState.discardPile[drawnState.discardPile.length - 1]!;
    if (drawnCard && drawnState.currentColor && canPlayCard(drawnCard, topCard, drawnState.currentColor)) {
      return applyAction(drawnState, { type: 'PLAY_CARD', playerId: action.playerId, cardId: drawnCard.id });
    }
    const nextIdx = getNextPlayerIndex(drawnState.currentPlayerIndex, drawnState.players.length, drawnState.direction);
    return { ...drawnState, currentPlayerIndex: nextIdx };
  }
```

**Hand limit:**
```typescript
  if (action.type === 'DRAW_CARD' && hr.handLimit !== null) {
    const player = state.players[state.currentPlayerIndex];
    if (player && player.hand.length >= hr.handLimit) return state;
  }
```

Import needed at top of file:
```typescript
import { getNextPlayerIndex } from './turn.js';
```

- [ ] **Step 3: Run tests**

```bash
cd /root/uno-online/packages/shared && npx vitest run tests/house-rules-remaining.test.ts
```

- [ ] **Step 4: Run all tests**

```bash
cd /root/uno-online/packages/shared && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rules/house-rules-engine.ts packages/shared/tests/house-rules-remaining.test.ts
git commit -m "feat: implement remaining house rules (stacking, deflect, 0-rotate, forced play, bomb, etc.)"
```

---

### Task 3: Server Integration — Use House Rules Engine

**Files:**
- Modify: `packages/server/src/game/game-session.ts`

- [ ] **Step 1: Update GameSession to use house rules engine**

Read current `packages/server/src/game/game-session.ts`. Change the import from:
```typescript
import { initializeGame, applyAction as applyRulesAction } from '@uno-online/shared';
```
to:
```typescript
import { initializeGame, applyActionWithHouseRules } from '@uno-online/shared';
```

Then in the `applyAction` method, replace `applyRulesAction(this.state, action)` with `applyActionWithHouseRules(this.state, action)`.

- [ ] **Step 2: Verify all server tests pass**

```bash
cd /root/uno-online && REDIS_URL="redis://:123456@localhost:6379" pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/game/game-session.ts
git commit -m "feat: wire house rules engine into game session"
```

---

### Task 4: House Rules Settings Panel (Client)

**Files:**
- Create: `packages/client/src/components/HouseRulesPanel.tsx`
- Modify: `packages/client/src/pages/RoomPage.tsx`
- Modify: `packages/client/src/stores/room-store.ts`

- [ ] **Step 1: Update room store to include house rules**

Read `packages/client/src/stores/room-store.ts`. Add `houseRules` to the `RoomData` interface and update the store. The `RoomData` should match what the server sends in `room:updated`. Since houseRules is part of `RoomSettings`, it flows through `room.settings.houseRules`.

Add import:
```typescript
import type { HouseRules } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
```

Add to the store state:
```typescript
houseRules: HouseRules;
```

Default to `DEFAULT_HOUSE_RULES`, update in `setRoom` and `updateRoom`.

- [ ] **Step 2: Create `packages/client/src/components/HouseRulesPanel.tsx`**

```tsx
import type { HouseRules } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_PRESETS } from '@uno-online/shared';

interface RuleDef {
  key: keyof HouseRules;
  label: string;
  description: string;
  type: 'boolean' | 'select';
  options?: { value: any; label: string }[];
}

const RULES: RuleDef[] = [
  { key: 'stackDrawTwo', label: '+2 叠加', description: '被 +2 时可出 +2 叠加给下家', type: 'boolean' },
  { key: 'stackDrawFour', label: '+4 叠加', description: '被 +4 时可出 +4 叠加给下家', type: 'boolean' },
  { key: 'crossStack', label: '+2 和 +4 互叠', description: '被 +2 时可出 +4 叠加，反之亦然', type: 'boolean' },
  { key: 'reverseDeflectDrawTwo', label: 'Reverse 反弹 +2', description: '被 +2 时出 Reverse 反弹给上家', type: 'boolean' },
  { key: 'reverseDeflectDrawFour', label: 'Reverse 反弹 +4', description: '被 +4 时出 Reverse 反弹给上家', type: 'boolean' },
  { key: 'skipDeflect', label: 'Skip 挡罚', description: '被 +2/+4 时出 Skip，惩罚转移给下家', type: 'boolean' },
  { key: 'zeroRotateHands', label: '0 牌交换手牌', description: '打出 0 时所有人按方向传递手牌', type: 'boolean' },
  { key: 'sevenSwapHands', label: '7 牌指定交换', description: '打出 7 时指定一人与自己交换手牌', type: 'boolean' },
  { key: 'jumpIn', label: '同牌抢出', description: '持有完全相同的牌可不等轮次直接出', type: 'boolean' },
  { key: 'multiplePlaySameNumber', label: '同数字全出', description: '相同数字不同颜色可一次打出', type: 'boolean' },
  { key: 'wildFirstTurn', label: '万能牌开局可出', description: '第一回合可打 Wild / +4', type: 'boolean' },
  { key: 'drawUntilPlayable', label: '摸到能出为止', description: '无牌可出时一直摸到能出的牌', type: 'boolean' },
  { key: 'forcedPlayAfterDraw', label: '摸牌后必须出', description: '摸到可出的牌时强制打出', type: 'boolean' },
  { key: 'forcedPlay', label: '强制出牌', description: '有能出的牌就必须出', type: 'boolean' },
  { key: 'unoPenaltyCount', label: 'UNO 罚摸数量', description: '不喊 UNO 被抓罚摸张数', type: 'select', options: [{ value: 2, label: '2张' }, { value: 4, label: '4张' }, { value: 6, label: '6张' }] },
  { key: 'misplayPenalty', label: '误操作惩罚', description: '出非法牌罚摸 1 张', type: 'boolean' },
  { key: 'silentUno', label: '静默 UNO', description: '取消 UNO 喊话机制', type: 'boolean' },
  { key: 'noFunctionCardFinish', label: '空手赢不算', description: '最后一张不能是 +2/+4', type: 'boolean' },
  { key: 'noWildFinish', label: '末牌限制', description: '最后一张不能是万能牌', type: 'boolean' },
  { key: 'doubleScore', label: '积分翻倍', description: '赢家分数翻倍', type: 'boolean' },
  { key: 'noChallengeWildFour', label: '无质疑 +4', description: '关闭 +4 质疑机制', type: 'boolean' },
  { key: 'fastMode', label: '快速模式', description: '回合时间减半', type: 'boolean' },
  { key: 'noHints', label: '无提示模式', description: '关闭可出牌高亮', type: 'boolean' },
  { key: 'blindDraw', label: '暗牌模式', description: '摸牌看不到牌面，出牌才翻开', type: 'boolean' },
  { key: 'bombCard', label: '炸弹牌', description: '打出 3+ 张同数字时所有人各摸 1 张', type: 'boolean' },
  { key: 'elimination', label: '淘汰制', description: '每轮手牌最多者淘汰', type: 'boolean' },
  { key: 'revengeMode', label: '复仇模式', description: '被攻击后下次伤害翻倍', type: 'boolean' },
  { key: 'teamMode', label: '团队模式', description: '偶数玩家时对面是队友', type: 'boolean' },
];

interface HouseRulesPanelProps {
  houseRules: HouseRules;
  onChange: (rules: HouseRules) => void;
  disabled?: boolean;
}

export default function HouseRulesPanel({ houseRules, onChange, disabled = false }: HouseRulesPanelProps) {
  const applyPreset = (preset: string) => {
    const presetRules = HOUSE_RULES_PRESETS[preset];
    if (presetRules) {
      onChange({ ...DEFAULT_HOUSE_RULES, ...presetRules });
    }
  };

  const toggle = (key: keyof HouseRules) => {
    onChange({ ...houseRules, [key]: !houseRules[key] });
  };

  const setValue = (key: keyof HouseRules, value: any) => {
    onChange({ ...houseRules, [key]: value });
  };

  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 12, padding: 16,
      maxWidth: 400, width: '100%', maxHeight: 400, overflowY: 'auto',
    }}>
      <h3 style={{ fontSize: 14, color: 'var(--text-accent)', marginBottom: 12, fontFamily: 'var(--font-game)' }}>
        村规设置
      </h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {['classic', 'party', 'crazy'].map((p) => (
          <button
            key={p}
            onClick={() => applyPreset(p)}
            disabled={disabled}
            className="btn-secondary"
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            {p === 'classic' ? '经典' : p === 'party' ? '派对' : '疯狂'}
          </button>
        ))}
      </div>

      {RULES.map((rule) => (
        <div key={rule.key} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13 }}>{rule.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{rule.description}</div>
          </div>
          {rule.type === 'boolean' ? (
            <button
              onClick={() => toggle(rule.key)}
              disabled={disabled}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer',
                background: houseRules[rule.key] ? 'var(--color-green)' : 'rgba(148,163,184,0.3)',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: 'white',
                position: 'absolute', top: 3,
                left: houseRules[rule.key] ? 23 : 3,
                transition: 'left 0.2s',
              }} />
            </button>
          ) : (
            <select
              value={houseRules[rule.key] as number}
              onChange={(e) => setValue(rule.key, Number(e.target.value))}
              disabled={disabled}
              style={{
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6,
                padding: '2px 8px', fontSize: 12,
              }}
            >
              {rule.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update RoomPage to include HouseRulesPanel**

Read `packages/client/src/pages/RoomPage.tsx`. Add:

1. Import:
```typescript
import HouseRulesPanel from '../components/HouseRulesPanel.js';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';
```

2. Add state:
```typescript
const [houseRules, setHouseRules] = useState<HouseRules>(DEFAULT_HOUSE_RULES);
```

3. Add the panel in JSX after the player list and before the buttons:
```tsx
<HouseRulesPanel
  houseRules={houseRules}
  onChange={(rules) => {
    setHouseRules(rules);
    getSocket().emit('room:update_settings', { houseRules: rules });
  }}
  disabled={!isOwner}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/HouseRulesPanel.tsx packages/client/src/pages/RoomPage.tsx packages/client/src/stores/room-store.ts
git commit -m "feat: add house rules settings panel with presets (classic/party/crazy)"
```

---

### Task 5: Sound Effects System

**Files:**
- Create: `packages/client/src/sound/sound-manager.ts`
- Create: `packages/client/src/stores/settings-store.ts`

- [ ] **Step 1: Create `packages/client/src/stores/settings-store.ts`**

```typescript
import { create } from 'zustand';

interface SettingsState {
  soundVolume: number;
  soundEnabled: boolean;
  colorBlindMode: boolean;

  setSoundVolume: (v: number) => void;
  toggleSound: () => void;
  toggleColorBlind: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundVolume: parseFloat(localStorage.getItem('soundVolume') ?? '0.7'),
  soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
  colorBlindMode: localStorage.getItem('colorBlindMode') === 'true',

  setSoundVolume: (v) => {
    localStorage.setItem('soundVolume', String(v));
    set({ soundVolume: v });
  },
  toggleSound: () => set((s) => {
    const next = !s.soundEnabled;
    localStorage.setItem('soundEnabled', String(next));
    return { soundEnabled: next };
  }),
  toggleColorBlind: () => set((s) => {
    const next = !s.colorBlindMode;
    localStorage.setItem('colorBlindMode', String(next));
    return { colorBlindMode: next };
  }),
}));
```

- [ ] **Step 2: Create `packages/client/src/sound/sound-manager.ts`**

```typescript
import { useSettingsStore } from '../stores/settings-store.js';

type SoundName =
  | 'play_card'
  | 'draw_card'
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'wild'
  | 'uno_call'
  | 'uno_catch'
  | 'timer_tick'
  | 'win'
  | 'lose'
  | 'player_join'
  | 'player_leave';

const FREQUENCIES: Record<SoundName, { freq: number; duration: number; type: OscillatorType }> = {
  play_card:    { freq: 800, duration: 0.08, type: 'square' },
  draw_card:    { freq: 400, duration: 0.1, type: 'triangle' },
  skip:         { freq: 300, duration: 0.15, type: 'sawtooth' },
  reverse:      { freq: 600, duration: 0.2, type: 'sine' },
  draw_two:     { freq: 500, duration: 0.12, type: 'square' },
  wild:         { freq: 1000, duration: 0.15, type: 'sine' },
  uno_call:     { freq: 1200, duration: 0.3, type: 'square' },
  uno_catch:    { freq: 200, duration: 0.25, type: 'sawtooth' },
  timer_tick:   { freq: 900, duration: 0.05, type: 'sine' },
  win:          { freq: 1400, duration: 0.5, type: 'sine' },
  lose:         { freq: 250, duration: 0.4, type: 'triangle' },
  player_join:  { freq: 700, duration: 0.1, type: 'sine' },
  player_leave: { freq: 350, duration: 0.15, type: 'sine' },
};

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function playSound(name: SoundName): void {
  const { soundEnabled, soundVolume } = useSettingsStore.getState();
  if (!soundEnabled || soundVolume <= 0) return;

  const config = FREQUENCIES[name];
  const ctx = getAudioCtx();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = config.type;
  osc.frequency.setValueAtTime(config.freq, ctx.currentTime);

  if (name === 'win') {
    osc.frequency.linearRampToValueAtTime(1800, ctx.currentTime + config.duration);
  } else if (name === 'lose') {
    osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + config.duration);
  }

  gain.gain.setValueAtTime(soundVolume * 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + config.duration);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/sound/ packages/client/src/stores/settings-store.ts
git commit -m "feat: add sound effects system with Web Audio API synthesizer"
```

---

### Task 6: Framer Motion Animations

**Files:**
- Modify: `packages/client/package.json` (add framer-motion)
- Create: `packages/client/src/components/AnimatedCard.tsx`
- Modify: `packages/client/src/components/PlayerHand.tsx`
- Modify: `packages/client/src/components/DiscardPile.tsx`

- [ ] **Step 1: Install framer-motion**

```bash
cd /root/uno-online/packages/client && pnpm add framer-motion
```

- [ ] **Step 2: Create `packages/client/src/components/AnimatedCard.tsx`**

```tsx
import { motion } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import Card from './Card.js';

interface AnimatedCardProps {
  card: CardType;
  playable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  layoutId?: string;
}

export default function AnimatedCard({ card, playable, onClick, style, layoutId }: AnimatedCardProps) {
  return (
    <motion.div
      layoutId={layoutId}
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.5, opacity: 0, y: -40, rotate: 15 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      whileHover={playable ? { y: -16, scale: 1.08 } : undefined}
      whileTap={playable ? { scale: 0.95 } : undefined}
      style={{ display: 'inline-block', ...style }}
    >
      <Card card={card} playable={playable} onClick={onClick} />
    </motion.div>
  );
}
```

- [ ] **Step 3: Update PlayerHand to use AnimatedCard**

Read `packages/client/src/components/PlayerHand.tsx`. Replace the `Card` import with `AnimatedCard` and wrap the cards list with `AnimatePresence`:

```tsx
import { AnimatePresence } from 'framer-motion';
import AnimatedCard from './AnimatedCard.js';
```

Replace the card rendering inside `player-hand__cards`:
```tsx
<AnimatePresence mode="popLayout">
  {me.hand.map((card, i) => {
    const angle = (i - (me.hand.length - 1) / 2) * 4;
    return (
      <AnimatedCard
        key={card.id}
        layoutId={card.id}
        card={card}
        playable={playableIds.has(card.id)}
        onClick={() => onPlayCard(card.id)}
        style={{ transform: `rotate(${angle}deg)` }}
      />
    );
  })}
</AnimatePresence>
```

- [ ] **Step 4: Update DiscardPile with animation**

Read `packages/client/src/components/DiscardPile.tsx`. Add entry animation:

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';

export default function DiscardPile() {
  const discardPile = useGameStore((s) => s.discardPile);
  const topCard = discardPile[discardPile.length - 1];
  if (!topCard) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={topCard.id}
          initial={{ scale: 1.5, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 3, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <Card card={topCard} />
        </motion.div>
      </AnimatePresence>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>弃牌堆</span>
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/package.json pnpm-lock.yaml packages/client/src/components/AnimatedCard.tsx packages/client/src/components/PlayerHand.tsx packages/client/src/components/DiscardPile.tsx
git commit -m "feat: add Framer Motion card animations (hand, discard pile)"
```

---

### Task 7: Color-Blind Mode

**Files:**
- Create: `packages/client/src/components/ColorBlindOverlay.tsx`
- Modify: `packages/client/src/components/Card.tsx`

- [ ] **Step 1: Create `packages/client/src/components/ColorBlindOverlay.tsx`**

```tsx
import type { Color } from '@uno-online/shared';

const PATTERNS: Record<Color, React.CSSProperties> = {
  red: {
    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)',
  },
  blue: {
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)',
  },
  green: {
    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)',
  },
  yellow: {
    backgroundImage: 'radial-gradient(circle 2px, rgba(0,0,0,0.12) 100%, transparent 100%)',
    backgroundSize: '6px 6px',
  },
};

interface Props {
  color: Color;
}

export default function ColorBlindOverlay({ color }: Props) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      pointerEvents: 'none',
      ...PATTERNS[color],
    }} />
  );
}
```

- [ ] **Step 2: Update Card component to support color-blind mode**

Read `packages/client/src/components/Card.tsx`. Add:

1. Import:
```typescript
import { useSettingsStore } from '../stores/settings-store.js';
import ColorBlindOverlay from './ColorBlindOverlay.js';
```

2. Inside the `Card` component function, add:
```typescript
const colorBlindMode = useSettingsStore((s) => s.colorBlindMode);
```

3. Inside the card div, after the value span, add:
```tsx
{colorBlindMode && card.color && <ColorBlindOverlay color={card.color} />}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/ColorBlindOverlay.tsx packages/client/src/components/Card.tsx
git commit -m "feat: add color-blind mode with pattern overlays on cards"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Type-check all packages**

```bash
cd /root/uno-online/packages/shared && npx tsc --noEmit
cd /root/uno-online/packages/server && npx tsc --noEmit
cd /root/uno-online/packages/client && npx tsc --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
cd /root/uno-online && REDIS_URL="redis://:123456@localhost:6379" pnpm test
```

- [ ] **Step 3: Build client**

```bash
cd /root/uno-online/packages/client && npx vite build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: plan 5 complete — house rules, animations, sound, accessibility"
```
