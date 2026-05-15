import { describe, it, expect } from 'vitest';
import type { Card, Color } from '../../src/types/card';
import type { GameState, Player } from '../../src/types/game';
import type { BotConfig } from '../../src/types/bot';
import { DEFAULT_HOUSE_RULES } from '../../src/types/house-rules';
import { chooseBotAction, chooseBotJumpInAction } from '../../src/rules/bot/bot-strategy';
import { makeState, makeCard } from '../helpers/test-utils';

function makeNumberCard(id: string, color: Color, value: number): Card {
  return { id, type: 'number', color, value };
}

function makeWildDrawFour(id: string): Card {
  return { id, type: 'wild_draw_four', color: null };
}

function makePlayer(
  id: string,
  name: string,
  hand: Card[],
  botConfig?: BotConfig,
): Player {
  return {
    id,
    name,
    hand,
    score: 0,
    connected: true,
    autopilot: false,
    calledUno: false,
    isBot: botConfig !== undefined,
    botConfig,
  };
}

const normalBot: BotConfig = { difficulty: 'normal', personality: 'balanced' };
const hardBot: BotConfig = { difficulty: 'hard', personality: 'strategic' };
const noviceBot: BotConfig = { difficulty: 'novice', personality: 'balanced' };

// ─── Playing phase ────────────────────────────────────────────────────────────

describe('chooseBotAction — playing phase', () => {
  it('returns PLAY_CARD when bot has playable cards', () => {
    const botHand: Card[] = [
      makeNumberCard('r5', 'red', 5),
      makeNumberCard('b3', 'blue', 3),
    ];
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 0,
      players: [
        makePlayer('bot', 'Bot', botHand, normalBot),
        makePlayer('p2', 'Human', [makeNumberCard('g1', 'green', 1)]),
      ],
      discardPile: [makeNumberCard('top', 'red', 2)],
      currentColor: 'red',
    });

    const actions = chooseBotAction(state, 'bot');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]).toMatchObject({ type: 'PLAY_CARD', playerId: 'bot' });
  });

  it('returns DRAW_CARD when bot has no playable cards', () => {
    const botHand: Card[] = [
      makeNumberCard('b3', 'blue', 3),
      makeNumberCard('g4', 'green', 4),
    ];
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 0,
      players: [
        makePlayer('bot', 'Bot', botHand, normalBot),
        makePlayer('p2', 'Human', [makeNumberCard('g1', 'green', 1)]),
      ],
      discardPile: [makeNumberCard('top', 'red', 2)],
      currentColor: 'red',
      deckLeft: [makeNumberCard('deck1', 'yellow', 7)],
      deckLeftInitialCount: 1,
    });

    const actions = chooseBotAction(state, 'bot');
    expect(actions.length).toBe(1);
    expect(actions[0]).toMatchObject({ type: 'DRAW_CARD', playerId: 'bot' });
  });

  it('returns empty array if it is not the bot\'s turn', () => {
    const botHand: Card[] = [makeNumberCard('r5', 'red', 5)];
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 1, // p2's turn, not bot's
      players: [
        makePlayer('bot', 'Bot', botHand, normalBot),
        makePlayer('p2', 'Human', [makeNumberCard('g1', 'green', 1)]),
      ],
      discardPile: [makeNumberCard('top', 'red', 2)],
      currentColor: 'red',
    });

    const actions = chooseBotAction(state, 'bot');
    expect(actions).toEqual([]);
  });

  it('returns empty array if bot player is not found', () => {
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 0,
      players: [
        makePlayer('p1', 'Human', [makeNumberCard('r5', 'red', 5)]),
        makePlayer('p2', 'Human2', [makeNumberCard('b3', 'blue', 3)]),
      ],
    });

    const actions = chooseBotAction(state, 'nonexistent');
    expect(actions).toEqual([]);
  });
});

// ─── Challenging phase ────────────────────────────────────────────────────────

describe('chooseBotAction — challenging phase', () => {
  it('hard bot challenges when opponent clearly had the current color (peeks at hand)', () => {
    // Hard bot can see opponent hands.
    // The previous player (p2) played a WD4 but had a red card in their hand
    // → hard bot should challenge (isValidWildDrawFour returns false)
    const prevPlayerHand: Card[] = [
      makeNumberCard('r9', 'red', 9), // has a red card → WD4 was invalid
      makeNumberCard('g2', 'green', 2),
    ];
    const botHand: Card[] = [makeNumberCard('b1', 'blue', 1)];
    // WD4 is on top; current color before was 'red'
    const wd4Top: Card = makeWildDrawFour('wd4_top');
    const prevRedCard: Card = makeNumberCard('prev_red', 'red', 3);

    const state = makeState({
      phase: 'challenging',
      currentPlayerIndex: 1, // bot's turn in the challenging phase
      pendingDrawPlayerId: 'bot',
      players: [
        makePlayer('p2', 'Human', prevPlayerHand), // previous player who played WD4
        makePlayer('bot', 'Bot', botHand, hardBot),
      ],
      discardPile: [prevRedCard, wd4Top],
      // The current color was 'red' before the WD4 was played
      currentColor: 'red',
    });

    const actions = chooseBotAction(state, 'bot');
    // Hard bot should challenge because p2 had a red card
    expect(actions.length).toBe(1);
    expect(actions[0]).toMatchObject({ type: 'CHALLENGE', playerId: 'bot' });
  });

  it('novice bot always accepts (challengeRate=0)', () => {
    const botHand: Card[] = [makeNumberCard('b1', 'blue', 1)];
    const wd4Top: Card = makeWildDrawFour('wd4_top');
    const prevCard: Card = makeNumberCard('prev', 'green', 3);

    const state = makeState({
      phase: 'challenging',
      currentPlayerIndex: 1,
      pendingDrawPlayerId: 'bot',
      players: [
        makePlayer('p2', 'Human', [makeNumberCard('b5', 'blue', 5)]), // no red → WD4 was valid
        makePlayer('bot', 'Bot', botHand, noviceBot),
      ],
      discardPile: [prevCard, wd4Top],
      currentColor: 'green',
    });

    // Run many times — novice has challengeRate=0, should ALWAYS accept
    for (let i = 0; i < 20; i++) {
      const actions = chooseBotAction(state, 'bot');
      expect(actions.length).toBe(1);
      expect(actions[0]).toMatchObject({ type: 'ACCEPT', playerId: 'bot' });
    }
  });
});

// ─── Choosing color phase ─────────────────────────────────────────────────────

describe('chooseBotAction — choosing_color phase', () => {
  it('returns CHOOSE_COLOR with a valid color', () => {
    const botHand: Card[] = [
      makeNumberCard('b1', 'blue', 1),
      makeNumberCard('b2', 'blue', 2),
      makeNumberCard('r1', 'red', 1),
    ];
    const state = makeState({
      phase: 'choosing_color',
      currentPlayerIndex: 0,
      players: [
        makePlayer('bot', 'Bot', botHand, normalBot),
        makePlayer('p2', 'Human', [makeNumberCard('g1', 'green', 1)]),
      ],
    });

    const actions = chooseBotAction(state, 'bot');
    expect(actions.length).toBe(1);
    expect(actions[0]).toMatchObject({ type: 'CHOOSE_COLOR', playerId: 'bot' });
    const action = actions[0] as { type: string; playerId: string; color: Color };
    expect(['red', 'blue', 'green', 'yellow']).toContain(action.color);
  });

  it('normal bot picks the most common color in hand', () => {
    const botHand: Card[] = [
      makeNumberCard('b1', 'blue', 1),
      makeNumberCard('b2', 'blue', 2),
      makeNumberCard('b3', 'blue', 3),
      makeNumberCard('r1', 'red', 1),
    ];
    const state = makeState({
      phase: 'choosing_color',
      currentPlayerIndex: 0,
      players: [
        makePlayer('bot', 'Bot', botHand, normalBot),
        makePlayer('p2', 'Human', [makeNumberCard('g1', 'green', 1)]),
      ],
    });

    const actions = chooseBotAction(state, 'bot');
    const action = actions[0] as { type: string; playerId: string; color: Color };
    expect(action.color).toBe('blue');
  });
});

// ─── Choosing swap target phase ───────────────────────────────────────────────

describe('chooseBotAction — choosing_swap_target phase', () => {
  it('normal bot picks the player with fewest cards', () => {
    const botHand: Card[] = [
      makeNumberCard('b1', 'blue', 1),
      makeNumberCard('b2', 'blue', 2),
      makeNumberCard('b3', 'blue', 3),
    ];
    const state = makeState({
      phase: 'choosing_swap_target',
      currentPlayerIndex: 0,
      players: [
        makePlayer('bot', 'Bot', botHand, normalBot),
        makePlayer('p2', 'Human', [
          makeNumberCard('r1', 'red', 1),
          makeNumberCard('r2', 'red', 2),
          makeNumberCard('r3', 'red', 3),
          makeNumberCard('r4', 'red', 4),
        ]),
        makePlayer('p3', 'Human2', [makeNumberCard('g1', 'green', 1)]), // fewest cards
      ],
    });

    const actions = chooseBotAction(state, 'bot');
    expect(actions.length).toBe(1);
    expect(actions[0]).toMatchObject({
      type: 'CHOOSE_SWAP_TARGET',
      playerId: 'bot',
      targetId: 'p3',
    });
  });
});

// ─── Jump-in ──────────────────────────────────────────────────────────────────

describe('chooseBotJumpInAction', () => {
  it('returns empty array when jumpIn rule is disabled', () => {
    const botHand: Card[] = [makeNumberCard('r5', 'red', 5)];
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 0,
      players: [
        makePlayer('p2', 'Human', []),
        makePlayer('bot', 'Bot', botHand, normalBot),
      ],
      discardPile: [makeNumberCard('top', 'red', 5)],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: false },
      },
    });

    const actions = chooseBotJumpInAction(state, 'bot');
    expect(actions).toEqual([]);
  });

  it('returns empty array when it is already the bot\'s turn', () => {
    const botHand: Card[] = [makeNumberCard('r5', 'red', 5)];
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 1, // bot's own turn
      players: [
        makePlayer('p2', 'Human', []),
        makePlayer('bot', 'Bot', botHand, normalBot),
      ],
      discardPile: [makeNumberCard('top', 'red', 5)],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true },
      },
    });

    const actions = chooseBotJumpInAction(state, 'bot');
    expect(actions).toEqual([]);
  });

  it('can jump in with an exact match card', () => {
    const botHand: Card[] = [
      makeNumberCard('r5', 'red', 5), // exact match for top card
      makeNumberCard('b3', 'blue', 3),
    ];
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 0, // p2's turn
      players: [
        makePlayer('p2', 'Human', []),
        makePlayer('bot', 'Bot', botHand, hardBot), // hard bot has specialCardAwareness=1.0
      ],
      discardPile: [makeNumberCard('top', 'red', 5)],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true },
      },
    });

    // Hard bot has specialCardAwareness=1.0, so Math.random() < 1.0 always
    // Run multiple times to confirm at least one jump-in
    let jumped = false;
    for (let i = 0; i < 20; i++) {
      const actions = chooseBotJumpInAction(state, 'bot');
      if (actions.length > 0) {
        jumped = true;
        expect(actions[0]).toMatchObject({ type: 'PLAY_CARD', playerId: 'bot', cardId: 'r5' });
        break;
      }
    }
    expect(jumped).toBe(true);
  });

  it('novice bot never jumps in (specialCardAwareness=0)', () => {
    const botHand: Card[] = [makeNumberCard('r5', 'red', 5)];
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 0,
      players: [
        makePlayer('p2', 'Human', []),
        makePlayer('bot', 'Bot', botHand, noviceBot),
      ],
      discardPile: [makeNumberCard('top', 'red', 5)],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true },
      },
    });

    // Novice has specialCardAwareness=0, so Math.random() < 0 is always false
    for (let i = 0; i < 20; i++) {
      const actions = chooseBotJumpInAction(state, 'bot');
      expect(actions).toEqual([]);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('chooseBotAction — edge cases', () => {
  it('uses a default fallback when botConfig is missing', () => {
    // Player without botConfig — should still produce a valid action
    const botHand: Card[] = [makeNumberCard('r5', 'red', 5)];
    const playerNoBotConfig: Player = {
      id: 'bot',
      name: 'Bot',
      hand: botHand,
      score: 0,
      connected: true,
      autopilot: false,
      calledUno: false,
      isBot: true,
      // no botConfig
    };
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 0,
      players: [
        playerNoBotConfig,
        makePlayer('p2', 'Human', [makeNumberCard('g1', 'green', 1)]),
      ],
      discardPile: [makeNumberCard('top', 'red', 2)],
      currentColor: 'red',
    });

    const actions = chooseBotAction(state, 'bot');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]).toHaveProperty('type');
  });

  it('returns PASS when deck is empty and no playable cards', () => {
    const botHand: Card[] = [makeNumberCard('b3', 'blue', 3)];
    const state = makeState({
      phase: 'playing',
      currentPlayerIndex: 0,
      players: [
        makePlayer('bot', 'Bot', botHand, normalBot),
        makePlayer('p2', 'Human', [makeNumberCard('g1', 'green', 1)]),
      ],
      discardPile: [makeNumberCard('top', 'red', 2)],
      currentColor: 'red',
      deckLeft: [],
      deckRight: [],
      deckLeftInitialCount: 0,
      deckRightInitialCount: 0,
    });

    const actions = chooseBotAction(state, 'bot');
    expect(actions.length).toBe(1);
    expect(actions[0]).toMatchObject({ type: 'PASS', playerId: 'bot' });
  });
});
