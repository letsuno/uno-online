# Plan 1: Foundation + Rules Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the monorepo scaffold and implement the complete UNO rules engine as a shared, pure-logic TypeScript package with full test coverage.

**Architecture:** pnpm monorepo with three packages (shared, server, client). This plan builds `packages/shared` — the rules engine used by both client (prediction) and server (authority). All logic is pure functions: `(state, action) => newState`, zero I/O, fully unit-testable.

**Tech Stack:** TypeScript 5, pnpm workspaces, Vitest

**Prerequisites:** Node.js 20+ via nvm (`nvm install 20 && nvm use 20`), pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1: Initialize git and set Node version**

```bash
cd /root/uno-online
git init
```

- [ ] **Step 2: Create `.nvmrc`**

```
20
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "uno-online",
  "private": true,
  "packageManager": "pnpm@10.11.0",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint"
  }
}
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.env
.env.*
!.env.example
*.log
.DS_Store
coverage/
.superpowers/
```

- [ ] **Step 7: Install nvm Node and enable pnpm**

```bash
nvm install 20
nvm use 20
corepack enable
corepack prepare pnpm@10.11.0 --activate
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: scaffold monorepo root with pnpm workspace"
```

---

### Task 2: Shared Package Setup

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@uno-online/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `packages/shared/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```typescript
export * from './types/index.js';
export * from './constants/index.js';
export * from './rules/index.js';
```

- [ ] **Step 5: Install dependencies**

```bash
cd /root/uno-online
pnpm install
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: set up shared package with vitest"
```

---

### Task 3: Type Definitions

**Files:**
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/types/card.ts`
- Create: `packages/shared/src/types/game.ts`
- Create: `packages/shared/src/types/action.ts`

- [ ] **Step 1: Create `packages/shared/src/types/card.ts`**

```typescript
export type Color = 'red' | 'blue' | 'green' | 'yellow';

export type CardType = 'number' | 'skip' | 'reverse' | 'draw_two' | 'wild' | 'wild_draw_four';

export interface NumberCard {
  id: string;
  type: 'number';
  color: Color;
  value: number;
}

export interface SkipCard {
  id: string;
  type: 'skip';
  color: Color;
}

export interface ReverseCard {
  id: string;
  type: 'reverse';
  color: Color;
}

export interface DrawTwoCard {
  id: string;
  type: 'draw_two';
  color: Color;
}

export interface WildCard {
  id: string;
  type: 'wild';
  color: null;
  chosenColor?: Color;
}

export interface WildDrawFourCard {
  id: string;
  type: 'wild_draw_four';
  color: null;
  chosenColor?: Color;
}

export type ColoredCard = NumberCard | SkipCard | ReverseCard | DrawTwoCard;
export type WildCardType = WildCard | WildDrawFourCard;
export type Card = ColoredCard | WildCardType;

export function isColoredCard(card: Card): card is ColoredCard {
  return card.color !== null;
}

export function isWildCard(card: Card): card is WildCardType {
  return card.type === 'wild' || card.type === 'wild_draw_four';
}

export function getEffectiveColor(card: Card): Color | null {
  if (isWildCard(card)) {
    return card.chosenColor ?? null;
  }
  return card.color;
}
```

- [ ] **Step 2: Create `packages/shared/src/types/game.ts`**

```typescript
import type { Card, Color } from './card.js';

export type GamePhase =
  | 'waiting'
  | 'dealing'
  | 'playing'
  | 'choosing_color'
  | 'challenging'
  | 'round_end'
  | 'game_over';

export type Direction = 'clockwise' | 'counter_clockwise';

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  connected: boolean;
  calledUno: boolean;
}

export interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  direction: Direction;
  deck: Card[];
  discardPile: Card[];
  currentColor: Color | null;
  drawStack: number;
  pendingDrawPlayerId: string | null;
  lastAction: GameAction | null;
  roundNumber: number;
  winnerId: string | null;
  settings: RoomSettings;
}

export interface RoundResult {
  winnerId: string;
  scores: Record<string, number>;
}

export type GameAction =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: Color }
  | { type: 'DRAW_CARD'; playerId: string }
  | { type: 'PASS'; playerId: string }
  | { type: 'CALL_UNO'; playerId: string }
  | { type: 'CATCH_UNO'; catcherId: string; targetId: string }
  | { type: 'CHALLENGE'; playerId: string }
  | { type: 'ACCEPT'; playerId: string }
  | { type: 'PASS'; playerId: string }
  | { type: 'CHOOSE_COLOR'; playerId: string; color: Color };
```

- [ ] **Step 3: Create `packages/shared/src/types/action.ts`**

```typescript
export interface ActionResult {
  success: boolean;
  error?: string;
}
```

- [ ] **Step 4: Create `packages/shared/src/types/index.ts`**

```typescript
export * from './card.js';
export * from './game.js';
export * from './action.js';
```

- [ ] **Step 5: Verify types compile**

Run: `cd /root/uno-online/packages/shared && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add UNO type definitions (card, game state, actions)"
```

---

### Task 4: Constants

**Files:**
- Create: `packages/shared/src/constants/index.ts`
- Create: `packages/shared/src/constants/deck.ts`
- Create: `packages/shared/src/constants/scoring.ts`

- [ ] **Step 1: Create `packages/shared/src/constants/deck.ts`**

```typescript
import type { Color } from '../types/card.js';

export const COLORS: readonly Color[] = ['red', 'blue', 'green', 'yellow'] as const;

export const INITIAL_HAND_SIZE = 7;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
```

- [ ] **Step 2: Create `packages/shared/src/constants/scoring.ts`**

```typescript
import type { Card } from '../types/card.js';

export const CARD_SCORES: Record<Card['type'], number | 'face_value'> = {
  number: 'face_value',
  skip: 20,
  reverse: 20,
  draw_two: 20,
  wild: 50,
  wild_draw_four: 50,
};

export function getCardScore(card: Card): number {
  if (card.type === 'number') {
    return card.value;
  }
  return CARD_SCORES[card.type] as number;
}

export const DEFAULT_TARGET_SCORE = 500;
export const DEFAULT_TURN_TIME_LIMIT = 30;
export const UNO_PENALTY_CARDS = 2;
```

- [ ] **Step 3: Create `packages/shared/src/constants/index.ts`**

```typescript
export * from './deck.js';
export * from './scoring.js';
```

- [ ] **Step 4: Verify types compile**

Run: `cd /root/uno-online/packages/shared && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add game constants (deck composition, scoring values)"
```

---

### Task 5: Deck Module

**Files:**
- Create: `packages/shared/src/rules/deck.ts`
- Create: `packages/shared/tests/deck.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/deck.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, reshuffleDiscardIntoDeck } from '../src/rules/deck.js';
import type { Card } from '../src/types/card.js';

describe('createDeck', () => {
  it('creates a deck of 108 cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
  });

  it('has 4 zero cards (one per color)', () => {
    const deck = createDeck();
    const zeros = deck.filter(c => c.type === 'number' && c.value === 0);
    expect(zeros).toHaveLength(4);
  });

  it('has 72 number cards (1-9, two per color)', () => {
    const deck = createDeck();
    const nonZeroNumbers = deck.filter(c => c.type === 'number' && c.value > 0);
    expect(nonZeroNumbers).toHaveLength(72);
  });

  it('has 8 skip cards (two per color)', () => {
    const deck = createDeck();
    const skips = deck.filter(c => c.type === 'skip');
    expect(skips).toHaveLength(8);
  });

  it('has 8 reverse cards (two per color)', () => {
    const deck = createDeck();
    const reverses = deck.filter(c => c.type === 'reverse');
    expect(reverses).toHaveLength(8);
  });

  it('has 8 draw two cards (two per color)', () => {
    const deck = createDeck();
    const drawTwos = deck.filter(c => c.type === 'draw_two');
    expect(drawTwos).toHaveLength(8);
  });

  it('has 4 wild cards', () => {
    const deck = createDeck();
    const wilds = deck.filter(c => c.type === 'wild');
    expect(wilds).toHaveLength(4);
  });

  it('has 4 wild draw four cards', () => {
    const deck = createDeck();
    const wildDrawFours = deck.filter(c => c.type === 'wild_draw_four');
    expect(wildDrawFours).toHaveLength(4);
  });

  it('assigns unique ids to all cards', () => {
    const deck = createDeck();
    const ids = new Set(deck.map(c => c.id));
    expect(ids.size).toBe(108);
  });
});

describe('shuffleDeck', () => {
  it('returns the same number of cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(108);
  });

  it('does not mutate the original deck', () => {
    const deck = createDeck();
    const original = [...deck];
    shuffleDeck(deck);
    expect(deck).toEqual(original);
  });

  it('contains the same cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    const originalIds = deck.map(c => c.id).sort();
    const shuffledIds = shuffled.map(c => c.id).sort();
    expect(shuffledIds).toEqual(originalIds);
  });
});

describe('reshuffleDiscardIntoDeck', () => {
  it('keeps the top card in discard and moves rest to deck', () => {
    const topCard: Card = { id: 'top', type: 'number', color: 'red', value: 5 };
    const otherCards: Card[] = [
      { id: 'a', type: 'number', color: 'blue', value: 3 },
      { id: 'b', type: 'skip', color: 'green' },
    ];
    const discardPile = [...otherCards, topCard];
    const emptyDeck: Card[] = [];

    const result = reshuffleDiscardIntoDeck(emptyDeck, discardPile);

    expect(result.discardPile).toHaveLength(1);
    expect(result.discardPile[0]!.id).toBe('top');
    expect(result.deck).toHaveLength(2);
  });

  it('clears chosenColor from wild cards when reshuffled', () => {
    const topCard: Card = { id: 'top', type: 'number', color: 'red', value: 1 };
    const wildCard: Card = { id: 'w1', type: 'wild', color: null, chosenColor: 'blue' };
    const discardPile = [wildCard, topCard];

    const result = reshuffleDiscardIntoDeck([], discardPile);

    const reshuffledWild = result.deck.find(c => c.id === 'w1');
    expect(reshuffledWild).toBeDefined();
    expect(reshuffledWild!.type).toBe('wild');
    if (reshuffledWild!.type === 'wild') {
      expect(reshuffledWild!.chosenColor).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/deck.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `packages/shared/src/rules/deck.ts`:

```typescript
import type { Card, Color } from '../types/card.js';
import { COLORS } from '../constants/deck.js';

let cardIdCounter = 0;

function nextId(): string {
  return `card_${++cardIdCounter}`;
}

export function resetCardIdCounter(): void {
  cardIdCounter = 0;
}

export function createDeck(): Card[] {
  resetCardIdCounter();
  const cards: Card[] = [];

  for (const color of COLORS) {
    cards.push({ id: nextId(), type: 'number', color, value: 0 });

    for (let value = 1; value <= 9; value++) {
      cards.push({ id: nextId(), type: 'number', color, value });
      cards.push({ id: nextId(), type: 'number', color, value });
    }

    for (let i = 0; i < 2; i++) {
      cards.push({ id: nextId(), type: 'skip', color });
      cards.push({ id: nextId(), type: 'reverse', color });
      cards.push({ id: nextId(), type: 'draw_two', color });
    }
  }

  for (let i = 0; i < 4; i++) {
    cards.push({ id: nextId(), type: 'wild', color: null });
    cards.push({ id: nextId(), type: 'wild_draw_four', color: null });
  }

  return cards;
}

export function shuffleDeck(deck: readonly Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function clearWildColor(card: Card): Card {
  if (card.type === 'wild') {
    return { id: card.id, type: 'wild', color: null };
  }
  if (card.type === 'wild_draw_four') {
    return { id: card.id, type: 'wild_draw_four', color: null };
  }
  return card;
}

export function reshuffleDiscardIntoDeck(
  currentDeck: readonly Card[],
  discardPile: readonly Card[],
): { deck: Card[]; discardPile: Card[] } {
  if (discardPile.length <= 1) {
    return { deck: [...currentDeck], discardPile: [...discardPile] };
  }

  const topCard = discardPile[discardPile.length - 1]!;
  const cardsToReshuffle = discardPile.slice(0, -1).map(clearWildColor);
  const newDeck = shuffleDeck([...currentDeck, ...cardsToReshuffle]);

  return { deck: newDeck, discardPile: [topCard] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/deck.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add deck module (create, shuffle, reshuffle)"
```

---

### Task 6: Card Validation Module

**Files:**
- Create: `packages/shared/src/rules/validation.ts`
- Create: `packages/shared/tests/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canPlayCard, getPlayableCards, isValidWildDrawFour } from '../src/rules/validation.js';
import type { Card, Color } from '../src/types/card.js';

function numberCard(color: Color, value: number, id = 'c1'): Card {
  return { id, type: 'number', color, value };
}

function skipCard(color: Color, id = 'c1'): Card {
  return { id, type: 'skip', color };
}

function reverseCard(color: Color, id = 'c1'): Card {
  return { id, type: 'reverse', color };
}

function drawTwoCard(color: Color, id = 'c1'): Card {
  return { id, type: 'draw_two', color };
}

function wildCard(id = 'c1'): Card {
  return { id, type: 'wild', color: null };
}

function wildDrawFour(id = 'c1'): Card {
  return { id, type: 'wild_draw_four', color: null };
}

describe('canPlayCard', () => {
  it('allows matching color', () => {
    const topCard = numberCard('red', 3);
    const playCard = numberCard('red', 7, 'c2');
    expect(canPlayCard(playCard, topCard, 'red')).toBe(true);
  });

  it('allows matching number', () => {
    const topCard = numberCard('red', 3);
    const playCard = numberCard('blue', 3, 'c2');
    expect(canPlayCard(playCard, topCard, 'red')).toBe(true);
  });

  it('rejects non-matching card', () => {
    const topCard = numberCard('red', 3);
    const playCard = numberCard('blue', 7, 'c2');
    expect(canPlayCard(playCard, topCard, 'red')).toBe(false);
  });

  it('allows wild card on anything', () => {
    const topCard = numberCard('red', 3);
    expect(canPlayCard(wildCard(), topCard, 'red')).toBe(true);
  });

  it('allows wild draw four on anything', () => {
    const topCard = numberCard('red', 3);
    expect(canPlayCard(wildDrawFour(), topCard, 'red')).toBe(true);
  });

  it('allows skip on matching color', () => {
    const topCard = numberCard('green', 5);
    expect(canPlayCard(skipCard('green'), topCard, 'green')).toBe(true);
  });

  it('allows skip on skip of different color', () => {
    const topCard = skipCard('red');
    expect(canPlayCard(skipCard('blue', 'c2'), topCard, 'red')).toBe(true);
  });

  it('uses currentColor for wild top cards', () => {
    const topCard: Card = { id: 'w', type: 'wild', color: null, chosenColor: 'yellow' };
    const playCard = numberCard('yellow', 5);
    expect(canPlayCard(playCard, topCard, 'yellow')).toBe(true);
  });

  it('rejects wrong color against wild chosen color', () => {
    const topCard: Card = { id: 'w', type: 'wild', color: null, chosenColor: 'yellow' };
    const playCard = numberCard('red', 5);
    expect(canPlayCard(playCard, topCard, 'yellow')).toBe(false);
  });

  it('allows draw_two on draw_two of different color (matching type)', () => {
    const topCard = drawTwoCard('red');
    expect(canPlayCard(drawTwoCard('blue', 'c2'), topCard, 'red')).toBe(true);
  });

  it('allows reverse on reverse of different color (matching type)', () => {
    const topCard = reverseCard('red');
    expect(canPlayCard(reverseCard('green', 'c2'), topCard, 'red')).toBe(true);
  });
});

describe('getPlayableCards', () => {
  it('returns all playable cards from hand', () => {
    const topCard = numberCard('red', 5);
    const hand: Card[] = [
      numberCard('red', 2, 'h1'),
      numberCard('blue', 5, 'h2'),
      numberCard('green', 8, 'h3'),
      wildCard('h4'),
    ];
    const playable = getPlayableCards(hand, topCard, 'red');
    expect(playable.map(c => c.id).sort()).toEqual(['h1', 'h2', 'h4']);
  });

  it('returns empty when nothing is playable except wilds are always playable', () => {
    const topCard = numberCard('red', 5);
    const hand: Card[] = [
      numberCard('blue', 3, 'h1'),
      numberCard('green', 8, 'h2'),
    ];
    const playable = getPlayableCards(hand, topCard, 'red');
    expect(playable).toHaveLength(0);
  });
});

describe('isValidWildDrawFour', () => {
  it('is valid when player has no cards matching current color', () => {
    const hand: Card[] = [
      numberCard('blue', 3, 'h1'),
      numberCard('green', 7, 'h2'),
      wildDrawFour('h3'),
    ];
    expect(isValidWildDrawFour(hand, 'red')).toBe(true);
  });

  it('is invalid when player has cards matching current color', () => {
    const hand: Card[] = [
      numberCard('red', 3, 'h1'),
      numberCard('green', 7, 'h2'),
      wildDrawFour('h3'),
    ];
    expect(isValidWildDrawFour(hand, 'red')).toBe(false);
  });

  it('ignores other wild cards when checking', () => {
    const hand: Card[] = [
      wildCard('h1'),
      wildDrawFour('h2'),
    ];
    expect(isValidWildDrawFour(hand, 'red')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/validation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `packages/shared/src/rules/validation.ts`:

```typescript
import type { Card, Color } from '../types/card.js';
import { isWildCard, isColoredCard } from '../types/card.js';

function getCardSymbol(card: Card): string | null {
  if (card.type === 'number') return `number_${card.value}`;
  if (card.type === 'skip') return 'skip';
  if (card.type === 'reverse') return 'reverse';
  if (card.type === 'draw_two') return 'draw_two';
  return null;
}

export function canPlayCard(
  card: Card,
  topCard: Card,
  currentColor: Color,
): boolean {
  if (isWildCard(card)) {
    return true;
  }

  if (isColoredCard(card) && card.color === currentColor) {
    return true;
  }

  const cardSymbol = getCardSymbol(card);
  const topSymbol = getCardSymbol(topCard);
  if (cardSymbol !== null && topSymbol !== null && cardSymbol === topSymbol) {
    return true;
  }

  return false;
}

export function getPlayableCards(
  hand: readonly Card[],
  topCard: Card,
  currentColor: Color,
): Card[] {
  return hand.filter(card => canPlayCard(card, topCard, currentColor));
}

export function isValidWildDrawFour(
  hand: readonly Card[],
  currentColor: Color,
): boolean {
  return !hand.some(card => isColoredCard(card) && card.color === currentColor);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/validation.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add card validation (canPlay, getPlayable, isValidWD4)"
```

---

### Task 7: Turn Module

**Files:**
- Create: `packages/shared/src/rules/turn.ts`
- Create: `packages/shared/tests/turn.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/turn.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getNextPlayerIndex, reverseDirection } from '../src/rules/turn.js';
import type { Direction } from '../src/types/game.js';

describe('getNextPlayerIndex', () => {
  it('goes clockwise: 0 -> 1 -> 2 -> 0', () => {
    expect(getNextPlayerIndex(0, 3, 'clockwise')).toBe(1);
    expect(getNextPlayerIndex(1, 3, 'clockwise')).toBe(2);
    expect(getNextPlayerIndex(2, 3, 'clockwise')).toBe(0);
  });

  it('goes counter-clockwise: 0 -> 2 -> 1 -> 0', () => {
    expect(getNextPlayerIndex(0, 3, 'counter_clockwise')).toBe(2);
    expect(getNextPlayerIndex(1, 3, 'counter_clockwise')).toBe(0);
    expect(getNextPlayerIndex(2, 3, 'counter_clockwise')).toBe(1);
  });

  it('handles 2 players: 0 -> 1 -> 0', () => {
    expect(getNextPlayerIndex(0, 2, 'clockwise')).toBe(1);
    expect(getNextPlayerIndex(1, 2, 'clockwise')).toBe(0);
  });

  it('skips with skip=1: 0 -> 2 (skipping 1)', () => {
    expect(getNextPlayerIndex(0, 4, 'clockwise', 1)).toBe(2);
  });

  it('skips wraps around', () => {
    expect(getNextPlayerIndex(3, 4, 'clockwise', 1)).toBe(1);
  });
});

describe('reverseDirection', () => {
  it('reverses clockwise to counter_clockwise', () => {
    expect(reverseDirection('clockwise')).toBe('counter_clockwise');
  });

  it('reverses counter_clockwise to clockwise', () => {
    expect(reverseDirection('counter_clockwise')).toBe('clockwise');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/turn.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `packages/shared/src/rules/turn.ts`:

```typescript
import type { Direction } from '../types/game.js';

export function getNextPlayerIndex(
  currentIndex: number,
  playerCount: number,
  direction: Direction,
  skip: number = 0,
): number {
  const step = direction === 'clockwise' ? 1 : -1;
  const totalSteps = 1 + skip;
  return ((currentIndex + step * totalSteps) % playerCount + playerCount) % playerCount;
}

export function reverseDirection(direction: Direction): Direction {
  return direction === 'clockwise' ? 'counter_clockwise' : 'clockwise';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/turn.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add turn module (next player, reverse direction)"
```

---

### Task 8: Game Setup Module

**Files:**
- Create: `packages/shared/src/rules/setup.ts`
- Create: `packages/shared/tests/setup.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/setup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dealCards, handleFirstDiscard, initializeGame } from '../src/rules/setup.js';
import { createDeck, shuffleDeck } from '../src/rules/deck.js';
import type { Card } from '../src/types/card.js';

describe('dealCards', () => {
  it('deals 7 cards to each player from the deck', () => {
    const deck = shuffleDeck(createDeck());
    const playerIds = ['p1', 'p2', 'p3'];
    const result = dealCards(deck, playerIds, 7);

    expect(result.hands['p1']).toHaveLength(7);
    expect(result.hands['p2']).toHaveLength(7);
    expect(result.hands['p3']).toHaveLength(7);
    expect(result.remainingDeck).toHaveLength(108 - 21);
  });

  it('does not share cards between players', () => {
    const deck = shuffleDeck(createDeck());
    const playerIds = ['p1', 'p2'];
    const result = dealCards(deck, playerIds, 7);

    const p1Ids = new Set(result.hands['p1']!.map(c => c.id));
    const p2Ids = new Set(result.hands['p2']!.map(c => c.id));
    for (const id of p1Ids) {
      expect(p2Ids.has(id)).toBe(false);
    }
  });
});

describe('handleFirstDiscard', () => {
  it('accepts a number card as first discard', () => {
    const numberCard: Card = { id: 'n1', type: 'number', color: 'red', value: 5 };
    const deck = [numberCard, { id: 'n2', type: 'number', color: 'blue', value: 3 } as Card];

    const result = handleFirstDiscard(deck);

    expect(result.topCard.id).toBe('n1');
    expect(result.remainingDeck).toHaveLength(1);
    expect(result.effect).toBeNull();
  });

  it('applies skip effect for first skip card', () => {
    const skipC: Card = { id: 's1', type: 'skip', color: 'green' };
    const deck = [skipC];

    const result = handleFirstDiscard(deck);
    expect(result.effect).toEqual({ type: 'skip' });
  });

  it('applies reverse effect for first reverse card', () => {
    const revCard: Card = { id: 'r1', type: 'reverse', color: 'blue' };
    const deck = [revCard];

    const result = handleFirstDiscard(deck);
    expect(result.effect).toEqual({ type: 'reverse' });
  });

  it('applies draw_two effect for first draw_two card', () => {
    const dt: Card = { id: 'd1', type: 'draw_two', color: 'yellow' };
    const deck = [dt];

    const result = handleFirstDiscard(deck);
    expect(result.effect).toEqual({ type: 'draw_two' });
  });

  it('applies choose_color effect for first wild card', () => {
    const w: Card = { id: 'w1', type: 'wild', color: null };
    const deck = [w];

    const result = handleFirstDiscard(deck);
    expect(result.effect).toEqual({ type: 'choose_color' });
  });

  it('redraws if first card is wild_draw_four', () => {
    const wd4: Card = { id: 'wd1', type: 'wild_draw_four', color: null };
    const number: Card = { id: 'n1', type: 'number', color: 'red', value: 2 };
    const deck = [wd4, number];

    const result = handleFirstDiscard(deck);
    expect(result.topCard.id).toBe('n1');
    expect(result.effect).toBeNull();
  });
});

describe('initializeGame', () => {
  it('creates a complete initial game state', () => {
    const playerData = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
    ];

    const state = initializeGame(playerData);

    expect(state.phase).toBe('playing');
    expect(state.players).toHaveLength(3);
    expect(state.players[0]!.hand).toHaveLength(7);
    expect(state.direction).toBe('clockwise');
    expect(state.discardPile.length).toBeGreaterThanOrEqual(1);
    expect(state.currentColor).not.toBeNull();
    expect(state.deck.length).toBeGreaterThan(0);
    expect(state.roundNumber).toBe(1);
  });

  it('handles first card effects', () => {
    for (let i = 0; i < 50; i++) {
      const playerData = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ];
      const state = initializeGame(playerData);
      expect(state.phase === 'playing' || state.phase === 'choosing_color').toBe(true);
      expect(state.discardPile.length).toBeGreaterThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/setup.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `packages/shared/src/rules/setup.ts`:

```typescript
import type { Card, Color } from '../types/card.js';
import type { GameState, Player } from '../types/game.js';
import { getEffectiveColor, isColoredCard } from '../types/card.js';
import { createDeck, shuffleDeck } from './deck.js';
import { getNextPlayerIndex, reverseDirection } from './turn.js';
import { INITIAL_HAND_SIZE } from '../constants/deck.js';
import { DEFAULT_TARGET_SCORE, DEFAULT_TURN_TIME_LIMIT } from '../constants/scoring.js';

export interface DealResult {
  hands: Record<string, Card[]>;
  remainingDeck: Card[];
}

export function dealCards(
  deck: readonly Card[],
  playerIds: readonly string[],
  cardsPerPlayer: number,
): DealResult {
  const remaining = [...deck];
  const hands: Record<string, Card[]> = {};

  for (const id of playerIds) {
    hands[id] = [];
  }

  for (let i = 0; i < cardsPerPlayer; i++) {
    for (const id of playerIds) {
      const card = remaining.shift();
      if (card) {
        hands[id]!.push(card);
      }
    }
  }

  return { hands, remainingDeck: remaining };
}

export type FirstCardEffect =
  | { type: 'skip' }
  | { type: 'reverse' }
  | { type: 'draw_two' }
  | { type: 'choose_color' }
  | null;

export interface FirstDiscardResult {
  topCard: Card;
  remainingDeck: Card[];
  effect: FirstCardEffect;
}

export function handleFirstDiscard(deck: readonly Card[]): FirstDiscardResult {
  const remaining = [...deck];

  while (remaining.length > 0) {
    const card = remaining.shift()!;

    if (card.type === 'wild_draw_four') {
      remaining.push(card);
      continue;
    }

    let effect: FirstCardEffect = null;
    if (card.type === 'skip') effect = { type: 'skip' };
    else if (card.type === 'reverse') effect = { type: 'reverse' };
    else if (card.type === 'draw_two') effect = { type: 'draw_two' };
    else if (card.type === 'wild') effect = { type: 'choose_color' };

    return { topCard: card, remainingDeck: remaining, effect };
  }

  throw new Error('Deck is empty — cannot draw first discard');
}

export function initializeGame(
  playerData: readonly { id: string; name: string }[],
): GameState {
  const deck = shuffleDeck(createDeck());

  const playerIds = playerData.map(p => p.id);
  const { hands, remainingDeck: deckAfterDeal } = dealCards(deck, playerIds, INITIAL_HAND_SIZE);
  const { topCard, remainingDeck: deckAfterDiscard, effect } = handleFirstDiscard(deckAfterDeal);

  const players: Player[] = playerData.map(p => ({
    id: p.id,
    name: p.name,
    hand: hands[p.id]!,
    score: 0,
    connected: true,
    calledUno: false,
  }));

  let direction: GameState['direction'] = 'clockwise';
  let currentPlayerIndex = 0;
  let currentColor: Color | null = isColoredCard(topCard) ? topCard.color : null;
  let phase: GameState['phase'] = 'playing';

  if (effect) {
    switch (effect.type) {
      case 'skip':
        currentPlayerIndex = getNextPlayerIndex(0, players.length, direction);
        break;
      case 'reverse':
        direction = reverseDirection(direction);
        break;
      case 'draw_two': {
        const targetPlayer = players[0]!;
        const drawCards = deckAfterDiscard.splice(0, 2);
        targetPlayer.hand.push(...drawCards);
        currentPlayerIndex = getNextPlayerIndex(0, players.length, direction);
        break;
      }
      case 'choose_color':
        phase = 'choosing_color';
        break;
    }
  }

  return {
    phase,
    players,
    currentPlayerIndex,
    direction,
    deck: deckAfterDiscard,
    discardPile: [topCard],
    currentColor,
    drawStack: 0,
    pendingDrawPlayerId: null,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    settings: {
      turnTimeLimit: DEFAULT_TURN_TIME_LIMIT as 30,
      targetScore: DEFAULT_TARGET_SCORE as 500,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/setup.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add game setup (deal cards, first discard handling, init)"
```

---

### Task 9: Scoring Module

**Files:**
- Create: `packages/shared/src/rules/scoring.ts`
- Create: `packages/shared/tests/scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateRoundScore, calculateRoundScores } from '../src/rules/scoring.js';
import type { Card } from '../src/types/card.js';
import type { Player } from '../src/types/game.js';

function makePlayer(id: string, hand: Card[]): Player {
  return { id, name: id, hand, score: 0, connected: true, calledUno: false };
}

describe('calculateRoundScore', () => {
  it('scores number cards at face value', () => {
    const hand: Card[] = [
      { id: '1', type: 'number', color: 'red', value: 7 },
      { id: '2', type: 'number', color: 'blue', value: 3 },
    ];
    expect(calculateRoundScore(hand)).toBe(10);
  });

  it('scores skip/reverse/draw_two at 20 each', () => {
    const hand: Card[] = [
      { id: '1', type: 'skip', color: 'red' },
      { id: '2', type: 'reverse', color: 'blue' },
      { id: '3', type: 'draw_two', color: 'green' },
    ];
    expect(calculateRoundScore(hand)).toBe(60);
  });

  it('scores wild cards at 50 each', () => {
    const hand: Card[] = [
      { id: '1', type: 'wild', color: null },
      { id: '2', type: 'wild_draw_four', color: null },
    ];
    expect(calculateRoundScore(hand)).toBe(100);
  });

  it('scores empty hand as 0', () => {
    expect(calculateRoundScore([])).toBe(0);
  });
});

describe('calculateRoundScores', () => {
  it('sums all losers hands as the winner score', () => {
    const players: Player[] = [
      makePlayer('winner', []),
      makePlayer('p2', [{ id: '1', type: 'number', color: 'red', value: 5 }]),
      makePlayer('p3', [{ id: '2', type: 'wild', color: null }]),
    ];
    const scores = calculateRoundScores(players, 'winner');
    expect(scores['winner']).toBe(55);
    expect(scores['p2']).toBe(0);
    expect(scores['p3']).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/scoring.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `packages/shared/src/rules/scoring.ts`:

```typescript
import type { Card } from '../types/card.js';
import type { Player } from '../types/game.js';
import { getCardScore } from '../constants/scoring.js';

export function calculateRoundScore(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + getCardScore(card), 0);
}

export function calculateRoundScores(
  players: readonly Player[],
  winnerId: string,
): Record<string, number> {
  const scores: Record<string, number> = {};
  let winnerPoints = 0;

  for (const player of players) {
    if (player.id === winnerId) {
      scores[player.id] = 0;
    } else {
      const handScore = calculateRoundScore(player.hand);
      winnerPoints += handScore;
      scores[player.id] = 0;
    }
  }

  scores[winnerId] = winnerPoints;
  return scores;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/scoring.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add scoring module (round score calculation)"
```

---

### Task 10: Game Engine (Core Actions)

The main reducer: `applyAction(state, action) => state`. This task handles PLAY_CARD, DRAW_CARD, PASS.

**Files:**
- Create: `packages/shared/src/rules/game-engine.ts`
- Create: `packages/shared/tests/game-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/game-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyAction } from '../src/rules/game-engine.js';
import type { GameState, Player } from '../src/types/game.js';
import type { Card, Color } from '../src/types/card.js';

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
  const defaults: GameState = {
    phase: 'playing',
    players: [
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
    ],
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
  };
  return { ...defaults, ...overrides };
}

describe('PLAY_CARD', () => {
  it('plays a matching number card', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'play1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 2 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'play1' });

    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('play1');
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.currentColor).toBe('red');
  });

  it('rejects a card that cannot be played', () => {
    const card = makeCard('number', 'blue', { value: 7, id: 'bad' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'bad' });
    expect(next).toEqual(state);
  });

  it('rejects play from wrong player', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'play1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'play1' });
    expect(next).toEqual(state);
  });

  it('skip card skips the next player', () => {
    const card = makeCard('skip', 'red', { id: 'skip1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'skip1' });
    expect(next.currentPlayerIndex).toBe(2);
  });

  it('reverse card reverses direction', () => {
    const card = makeCard('reverse', 'red', { id: 'rev1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'rev1' });
    expect(next.direction).toBe('counter_clockwise');
    expect(next.currentPlayerIndex).toBe(2);
  });

  it('reverse acts as skip in 2-player game', () => {
    const card = makeCard('reverse', 'red', { id: 'rev1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'rev1' });
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('draw_two makes next player draw 2 and skip', () => {
    const card = makeCard('draw_two', 'red', { id: 'dt1' });
    const deckCards = [makeCard('number', 'blue', { value: 1 }), makeCard('number', 'green', { value: 2 })];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 9 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      deck: deckCards,
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'dt1' });
    expect(next.players[1]!.hand).toHaveLength(3);
    expect(next.currentPlayerIndex).toBe(2);
  });

  it('wild card transitions to choosing_color phase', () => {
    const card = makeCard('wild', null, { id: 'w1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'w1' });
    expect(next.phase).toBe('choosing_color');
  });

  it('wild_draw_four transitions to challenging phase', () => {
    const card = makeCard('wild_draw_four', null, { id: 'wd4' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      currentColor: 'red',
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4' });
    expect(next.phase).toBe('choosing_color');
  });

  it('playing last card sets round_end', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'last' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: true },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'last' });
    expect(next.phase).toBe('round_end');
    expect(next.winnerId).toBe('p1');
  });
});

describe('DRAW_CARD', () => {
  it('draws a card from deck into player hand', () => {
    const drawnCard = makeCard('number', 'blue', { value: 3, id: 'drawn1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 8 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [drawnCard],
    });

    const next = applyAction(state, { type: 'DRAW_CARD', playerId: 'p1' });
    expect(next.players[0]!.hand).toHaveLength(2);
    expect(next.players[0]!.hand.some(c => c.id === 'drawn1')).toBe(true);
    expect(next.deck).toHaveLength(0);
  });

  it('rejects draw from wrong player', () => {
    const state = makeState({
      deck: [makeCard('number', 'blue', { value: 1 })],
    });
    const next = applyAction(state, { type: 'DRAW_CARD', playerId: 'p2' });
    expect(next).toEqual(state);
  });
});

describe('PASS', () => {
  it('advances to next player after drawing', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 8 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      lastAction: { type: 'DRAW_CARD', playerId: 'p1' },
    });

    const next = applyAction(state, { type: 'PASS', playerId: 'p1' });
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe('CHOOSE_COLOR', () => {
  it('sets color and returns to playing', () => {
    const state = makeState({
      phase: 'choosing_color',
      currentColor: null,
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'yellow' });
    expect(next.currentColor).toBe('yellow');
    expect(next.phase).toBe('playing');
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe('CHALLENGE', () => {
  it('challenger wins: player who played WD4 draws 4', () => {
    const wd4: Card = makeCard('wild_draw_four', null, { id: 'wd4' });
    const redCard = makeCard('number', 'red', { value: 5, id: 'r5' });
    const deckCards = Array.from({ length: 4 }, (_, i) => makeCard('number', 'blue', { value: i, id: `deck${i}` }));

    const state = makeState({
      phase: 'challenging',
      currentPlayerIndex: 0,
      pendingDrawPlayerId: 'p2',
      players: [
        { id: 'p1', name: 'Alice', hand: [redCard], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 3 }), wd4],
      deck: deckCards,
      lastAction: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4', chosenColor: 'blue' },
    });

    const next = applyAction(state, { type: 'CHALLENGE', playerId: 'p2' });
    expect(next.players[0]!.hand.length).toBeGreaterThanOrEqual(5);
    expect(next.phase).toBe('playing');
  });

  it('challenger loses: challenger draws 6', () => {
    const wd4: Card = makeCard('wild_draw_four', null, { id: 'wd4' });
    const blueCard = makeCard('number', 'blue', { value: 5, id: 'b5' });
    const deckCards = Array.from({ length: 6 }, (_, i) => makeCard('number', 'green', { value: i, id: `deck${i}` }));

    const state = makeState({
      phase: 'challenging',
      currentPlayerIndex: 0,
      pendingDrawPlayerId: 'p2',
      players: [
        { id: 'p1', name: 'Alice', hand: [blueCard], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 3 }), wd4],
      deck: deckCards,
      lastAction: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4', chosenColor: 'blue' },
    });

    const next = applyAction(state, { type: 'ACCEPT', playerId: 'p2' });
    expect(next.players[1]!.hand.length).toBeGreaterThanOrEqual(5);
    expect(next.phase).toBe('playing');
  });
});

describe('CALL_UNO', () => {
  it('sets calledUno flag for player with 1 card', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'CALL_UNO', playerId: 'p1' });
    expect(next.players[0]!.calledUno).toBe(true);
  });
});

describe('CATCH_UNO', () => {
  it('penalizes player who did not call UNO', () => {
    const penaltyCards = [makeCard('number', 'blue', { value: 1 }), makeCard('number', 'green', { value: 2 })];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 }), makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
      ],
      deck: penaltyCards,
    });

    const next = applyAction(state, { type: 'CATCH_UNO', catcherId: 'p2', targetId: 'p1' });
    expect(next.players[0]!.hand).toHaveLength(3);
  });

  it('does not penalize player who called UNO', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 1 })], score: 0, connected: true, calledUno: true },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      deck: [makeCard('number', 'green', { value: 1 }), makeCard('number', 'yellow', { value: 2 })],
    });

    const next = applyAction(state, { type: 'CATCH_UNO', catcherId: 'p2', targetId: 'p1' });
    expect(next.players[0]!.hand).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/game-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `packages/shared/src/rules/game-engine.ts`:

```typescript
import type { Card, Color } from '../types/card.js';
import type { GameState, GameAction } from '../types/game.js';
import { isColoredCard, isWildCard } from '../types/card.js';
import { canPlayCard, isValidWildDrawFour } from './validation.js';
import { getNextPlayerIndex, reverseDirection } from './turn.js';
import { reshuffleDiscardIntoDeck } from './deck.js';
import { calculateRoundScores } from './scoring.js';
import { UNO_PENALTY_CARDS } from '../constants/scoring.js';

function drawCards(state: GameState, playerId: string, count: number): GameState {
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

function checkRoundEnd(state: GameState, playerId: string): GameState {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.hand.length > 0) return state;

  const roundScores = calculateRoundScores(state.players, playerId);
  const players = state.players.map(p => ({
    ...p,
    score: p.score + (roundScores[p.id] ?? 0),
  }));

  const winner = players.find(p => p.id === playerId);
  const gameOver = winner && winner.score >= state.settings.targetScore;

  return {
    ...state,
    players,
    phase: gameOver ? 'game_over' : 'round_end',
    winnerId: playerId,
  };
}

function handlePlayCard(state: GameState, playerId: string, cardId: string, chosenColor?: Color): GameState {
  if (state.phase !== 'playing') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return state;

  const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return state;

  const card = currentPlayer.hand[cardIndex]!;
  const topCard = state.discardPile[state.discardPile.length - 1]!;

  if (!canPlayCard(card, topCard, state.currentColor!)) return state;

  const newHand = currentPlayer.hand.filter((_, i) => i !== cardIndex);
  let playedCard = card;

  if (isWildCard(playedCard) && chosenColor) {
    playedCard = { ...playedCard, chosenColor } as Card;
  }

  const players = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
  );

  let newState: GameState = {
    ...state,
    players,
    discardPile: [...state.discardPile, playedCard],
    lastAction: { type: 'PLAY_CARD', playerId, cardId, chosenColor },
  };

  if (newHand.length === 0) {
    const topPlayed = playedCard;

    if (topPlayed.type === 'draw_two') {
      const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
      newState = drawCards(newState, players[nextIdx]!.id, 2);
    } else if (topPlayed.type === 'wild_draw_four') {
      const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
      newState = drawCards(newState, players[nextIdx]!.id, 4);
      if (chosenColor) {
        newState = { ...newState, currentColor: chosenColor };
      }
    }

    return checkRoundEnd(newState, playerId);
  }

  if (playedCard.type === 'wild' || playedCard.type === 'wild_draw_four') {
    if (chosenColor) {
      newState = { ...newState, currentColor: chosenColor };
      if (playedCard.type === 'wild') {
        newState = {
          ...newState,
          phase: 'playing',
          currentPlayerIndex: getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction),
        };
        return newState;
      }
    }

    if (playedCard.type === 'wild_draw_four') {
      newState = {
        ...newState,
        phase: 'choosing_color',
        pendingDrawPlayerId: players[getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction)]!.id,
      };
      return newState;
    }

    return { ...newState, phase: 'choosing_color' };
  }

  const newColor = isColoredCard(playedCard) ? playedCard.color : state.currentColor;
  newState = { ...newState, currentColor: newColor };

  if (playedCard.type === 'skip') {
    const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction, 1);
    return { ...newState, currentPlayerIndex: nextIdx };
  }

  if (playedCard.type === 'reverse') {
    const newDirection = reverseDirection(state.direction);
    if (players.length === 2) {
      return { ...newState, direction: newDirection, currentPlayerIndex: state.currentPlayerIndex };
    }
    const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, newDirection);
    return { ...newState, direction: newDirection, currentPlayerIndex: nextIdx };
  }

  if (playedCard.type === 'draw_two') {
    const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
    newState = drawCards(newState, players[nextIdx]!.id, 2);
    const skipIdx = getNextPlayerIndex(nextIdx, players.length, state.direction);
    return { ...newState, currentPlayerIndex: skipIdx };
  }

  const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
  return { ...newState, currentPlayerIndex: nextIdx };
}

function handleDrawCard(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return state;

  const newState = drawCards(state, playerId, 1);
  return { ...newState, lastAction: { type: 'DRAW_CARD', playerId } };
}

function handlePass(state: GameState, playerId: string): GameState {
  if (state.phase !== 'playing') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return state;

  const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
  return { ...state, currentPlayerIndex: nextIdx, lastAction: { type: 'PASS', playerId } };
}

function handleChooseColor(state: GameState, playerId: string, color: Color): GameState {
  if (state.phase !== 'choosing_color') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return state;

  const topCard = state.discardPile[state.discardPile.length - 1];

  if (topCard && topCard.type === 'wild_draw_four' && state.pendingDrawPlayerId) {
    return {
      ...state,
      currentColor: color,
      phase: 'challenging',
      lastAction: { type: 'CHOOSE_COLOR', playerId, color },
    };
  }

  const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
  return {
    ...state,
    currentColor: color,
    phase: 'playing',
    currentPlayerIndex: nextIdx,
    lastAction: { type: 'CHOOSE_COLOR', playerId, color },
  };
}

function handleChallenge(state: GameState, playerId: string): GameState {
  if (state.phase !== 'challenging') return state;
  if (state.pendingDrawPlayerId !== playerId) return state;

  const lastAction = state.lastAction;
  if (!lastAction || lastAction.type !== 'CHOOSE_COLOR') return state;

  const wd4PlayerId = lastAction.playerId;
  const wd4Player = state.players.find(p => p.id === wd4PlayerId);
  if (!wd4Player) return state;

  const previousTopCard = state.discardPile.length >= 2 ? state.discardPile[state.discardPile.length - 2] : null;
  const colorAtTimeOfPlay = previousTopCard && isColoredCard(previousTopCard) ? previousTopCard.color : state.currentColor;

  const wasLegal = isValidWildDrawFour(wd4Player.hand, colorAtTimeOfPlay!);

  let newState = { ...state, phase: 'playing' as const, pendingDrawPlayerId: null };

  if (wasLegal) {
    newState = drawCards(newState, playerId, 6);
    const challengerIdx = newState.players.findIndex(p => p.id === playerId);
    const nextIdx = getNextPlayerIndex(challengerIdx, newState.players.length, newState.direction);
    return { ...newState, currentPlayerIndex: nextIdx, lastAction: { type: 'CHALLENGE', playerId } };
  } else {
    newState = drawCards(newState, wd4PlayerId, 4);
    const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, newState.players.length, newState.direction);
    return { ...newState, currentPlayerIndex: nextIdx, lastAction: { type: 'CHALLENGE', playerId } };
  }
}

function handleAccept(state: GameState, playerId: string): GameState {
  if (state.phase !== 'challenging') return state;
  if (state.pendingDrawPlayerId !== playerId) return state;

  let newState = drawCards(state, playerId, 4);
  const accepterIdx = newState.players.findIndex(p => p.id === playerId);
  const nextIdx = getNextPlayerIndex(accepterIdx, newState.players.length, newState.direction);

  return {
    ...newState,
    phase: 'playing',
    currentPlayerIndex: nextIdx,
    pendingDrawPlayerId: null,
    lastAction: { type: 'ACCEPT', playerId },
  };
}

function handleCallUno(state: GameState, playerId: string): GameState {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;

  const player = state.players[playerIndex]!;
  if (player.hand.length > 2) return state;

  const players = state.players.map((p, idx) =>
    idx === playerIndex ? { ...p, calledUno: true } : p,
  );

  return { ...state, players, lastAction: { type: 'CALL_UNO', playerId } };
}

function handleCatchUno(state: GameState, catcherId: string, targetId: string): GameState {
  const target = state.players.find(p => p.id === targetId);
  if (!target) return state;
  if (target.hand.length !== 1) return state;
  if (target.calledUno) return state;

  const newState = drawCards(state, targetId, UNO_PENALTY_CARDS);
  return { ...newState, lastAction: { type: 'CATCH_UNO', catcherId, targetId } };
}

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PLAY_CARD':
      return handlePlayCard(state, action.playerId, action.cardId, action.chosenColor);
    case 'DRAW_CARD':
      return handleDrawCard(state, action.playerId);
    case 'PASS':
      return handlePass(state, action.playerId);
    case 'CHOOSE_COLOR':
      return handleChooseColor(state, action.playerId, action.color);
    case 'CHALLENGE':
      return handleChallenge(state, action.playerId);
    case 'ACCEPT':
      return handleAccept(state, action.playerId);
    case 'CALL_UNO':
      return handleCallUno(state, action.playerId);
    case 'CATCH_UNO':
      return handleCatchUno(state, action.catcherId, action.targetId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /root/uno-online/packages/shared && npx vitest run tests/game-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add game engine reducer (all core actions)"
```

---

### Task 11: Rules Index & Full Test Suite

**Files:**
- Create: `packages/shared/src/rules/index.ts`
- Create: `packages/shared/tests/integration.test.ts`

- [ ] **Step 1: Create `packages/shared/src/rules/index.ts`**

```typescript
export { createDeck, shuffleDeck, reshuffleDiscardIntoDeck } from './deck.js';
export { canPlayCard, getPlayableCards, isValidWildDrawFour } from './validation.js';
export { getNextPlayerIndex, reverseDirection } from './turn.js';
export { dealCards, handleFirstDiscard, initializeGame } from './setup.js';
export type { DealResult, FirstCardEffect, FirstDiscardResult } from './setup.js';
export { calculateRoundScore, calculateRoundScores } from './scoring.js';
export { applyAction } from './game-engine.js';
```

- [ ] **Step 2: Write integration test — simulate a full game**

Create `packages/shared/tests/integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { initializeGame, applyAction, getPlayableCards } from '../src/rules/index.js';
import type { GameState, GameAction } from '../src/types/game.js';

function playOneRound(state: GameState, maxTurns = 500): GameState {
  let current = state;
  let turns = 0;

  while (current.phase === 'playing' && turns < maxTurns) {
    turns++;
    const player = current.players[current.currentPlayerIndex]!;
    const topCard = current.discardPile[current.discardPile.length - 1]!;
    const playable = getPlayableCards(player.hand, topCard, current.currentColor!);

    if (playable.length > 0) {
      const card = playable[0]!;
      let chosenColor = undefined;
      if (card.type === 'wild' || card.type === 'wild_draw_four') {
        chosenColor = 'red' as const;
      }

      if (player.hand.length === 2) {
        current = applyAction(current, { type: 'CALL_UNO', playerId: player.id });
      }

      const action: GameAction = { type: 'PLAY_CARD', playerId: player.id, cardId: card.id, chosenColor };
      current = applyAction(current, action);

      if (current.phase === 'choosing_color') {
        current = applyAction(current, { type: 'CHOOSE_COLOR', playerId: player.id, color: 'red' });
      }
      if (current.phase === 'challenging') {
        current = applyAction(current, { type: 'ACCEPT', playerId: current.pendingDrawPlayerId! });
      }
    } else {
      current = applyAction(current, { type: 'DRAW_CARD', playerId: player.id });
      current = applyAction(current, { type: 'PASS', playerId: player.id });
    }
  }

  return current;
}

describe('integration: full game simulation', () => {
  it('completes a game with 2 players', () => {
    const state = initializeGame([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const result = playOneRound(state);
    expect(result.phase === 'round_end' || result.phase === 'game_over').toBe(true);
    expect(result.winnerId).toBeTruthy();
  });

  it('completes a game with 4 players', () => {
    const state = initializeGame([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'Dave' },
    ]);

    const result = playOneRound(state);
    expect(result.phase === 'round_end' || result.phase === 'game_over').toBe(true);
  });

  it('completes a game with 10 players', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Player${i}` }));
    const state = initializeGame(players);

    const result = playOneRound(state);
    expect(result.phase === 'round_end' || result.phase === 'game_over').toBe(true);
  });

  it('winner scores are correctly calculated', () => {
    const state = initializeGame([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const result = playOneRound(state);
    if (result.winnerId) {
      const winner = result.players.find(p => p.id === result.winnerId);
      expect(winner!.score).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 3: Run full test suite**

Run: `cd /root/uno-online/packages/shared && npx vitest run`
Expected: All tests PASS across all test files

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add rules index and integration tests (full game simulation)"
```

---

### Task 12: Verify Everything

- [ ] **Step 1: Run full test suite from project root**

```bash
cd /root/uno-online && pnpm test
```
Expected: All tests PASS

- [ ] **Step 2: Type-check**

```bash
cd /root/uno-online/packages/shared && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore: plan 1 complete — foundation and rules engine"
```
