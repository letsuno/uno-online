import { describe, it, expect, vi } from 'vitest';
import type { Card, Color } from '../../src/types/card';
import type { GameState, Player } from '../../src/types/game';
import type { BotConfig } from '../../src/types/bot';
import { DEFAULT_HOUSE_RULES } from '../../src/types/house-rules';
import { chooseBotAction } from '../../src/rules/bot/bot-strategy';
import { bestColorsForHand } from '../../src/rules/bot/card-evaluator';
import { makeState, makeCard } from '../helpers/test-utils';

function n(id: string, color: Color, value: number): Card {
  return { id, type: 'number', color, value };
}

function makePlayer(id: string, hand: Card[], botConfig?: BotConfig, extra: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    hand,
    score: 0,
    roundWins: 0,
    connected: true,
    autopilot: false,
    calledUno: false,
    unoCaught: false,
    eliminated: false,
    isBot: botConfig !== undefined,
    botConfig,
    ...extra,
  };
}

const hardBot: BotConfig = { difficulty: 'hard', personality: 'balanced' };
const normalBot: BotConfig = { difficulty: 'normal', personality: 'balanced' };
const chaoticHardBot: BotConfig = { difficulty: 'hard', personality: 'chaotic' };

describe('WD4 legality self-check', () => {
  it('normal bot avoids a challengeable WD4 when a safe alternative exists', () => {
    // Bot holds a red card while red is the current color → WD4 would be invalid.
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    const botHand = [wd4, n('r3', 'red', 3), n('g9', 'green', 9)];
    const state = makeState({
      players: [
        makePlayer('bot', botHand, normalBot),
        makePlayer('h1', [n('x1', 'blue', 1), n('x2', 'blue', 2), n('x3', 'green', 5)]),
      ],
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });

    // Keep noise and the mistake roll deterministic so this regression does
    // not occasionally fail at the edge of a probabilistic sample.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      const actions = chooseBotAction(state, 'bot');
      expect(actions[0]).toMatchObject({ type: 'PLAY_CARD', cardId: 'r3' });
    } finally {
      random.mockRestore();
    }
  });

  it('hard bot plays WD4 freely when it holds no card of the current color', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    // No red in hand and no playable colored card → WD4 is legal AND the only playable card
    const botHand = [wd4, n('g9', 'green', 9)];
    const state = makeState({
      players: [
        makePlayer('bot', botHand, hardBot),
        makePlayer('h1', [n('x1', 'blue', 1), n('x2', 'blue', 2), n('x3', 'green', 5)]),
      ],
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });
    const actions = chooseBotAction(state, 'bot');
    expect(actions[0]).toMatchObject({ type: 'PLAY_CARD', cardId: 'wd4' });
  });

  it('hard chaotic bot may use a challengeable WD4 before recurrence is observed', () => {
    const wd4a = makeCard('wild_draw_four', null, { id: 'wd4-a' });
    const wd4b = makeCard('wild_draw_four', null, { id: 'wd4-b' });
    const safeRed = n('safe-red', 'red', 6);
    const state = makeState({
      players: [
        makePlayer(
          'bot',
          [wd4a, safeRed, wd4b, n('red-9', 'red', 9), n('yellow-2', 'yellow', 2), n('green-4', 'green', 4)],
          chaoticHardBot,
        ),
        makePlayer('human-close', [n('human-green', 'green', 5)]),
        makePlayer(
          'ally',
          [
            n('ally-yellow-6a', 'yellow', 6),
            n('ally-yellow-4a', 'yellow', 4),
            n('ally-green-8', 'green', 8),
            n('ally-yellow-4b', 'yellow', 4),
            n('ally-red-0', 'red', 0),
            n('ally-yellow-8', 'yellow', 8),
            n('ally-yellow-6b', 'yellow', 6),
            n('ally-blue-9', 'blue', 9),
            n('ally-red-1', 'red', 1),
            n('ally-red-8', 'red', 8),
            n('ally-blue-5', 'blue', 5),
          ],
          normalBot,
        ),
        makePlayer('human-last', [n('human-red', 'red', 8)]),
      ],
      deckLeft: [],
      deckRight: [],
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });

    expect(chooseBotAction(state, 'bot')[0]).toMatchObject({
      type: 'PLAY_CARD',
      cardId: wd4a.id,
    });
  });

  it('hard bot may still play a challengeable WD4 when cards remain to resolve the risk', () => {
    const wd4a = makeCard('wild_draw_four', null, { id: 'wd4-a' });
    const wd4b = makeCard('wild_draw_four', null, { id: 'wd4-b' });
    const state = makeState({
      players: [
        makePlayer(
          'bot',
          [
            wd4a,
            n('safe-red', 'red', 6),
            wd4b,
            n('red-9', 'red', 9),
            n('yellow-2', 'yellow', 2),
            n('green-4', 'green', 4),
          ],
          chaoticHardBot,
        ),
        makePlayer('human-close', [n('human-green', 'green', 5)]),
        makePlayer(
          'ally',
          [
            n('ally-yellow-6a', 'yellow', 6),
            n('ally-yellow-4a', 'yellow', 4),
            n('ally-green-8', 'green', 8),
            n('ally-yellow-4b', 'yellow', 4),
            n('ally-red-0', 'red', 0),
            n('ally-yellow-8', 'yellow', 8),
            n('ally-yellow-6b', 'yellow', 6),
            n('ally-blue-9', 'blue', 9),
            n('ally-red-1', 'red', 1),
            n('ally-red-8', 'red', 8),
            n('ally-blue-5', 'blue', 5),
          ],
          normalBot,
        ),
        makePlayer('human-last', [n('human-red', 'red', 8)]),
      ],
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });

    // This policy guard is specifically a no-progress safeguard; the normal
    // score-based bluff/risk trade-off remains available while cards exist.
    expect(chooseBotAction(state, 'bot')[0]).toMatchObject({
      type: 'PLAY_CARD',
      cardId: wd4a.id,
    });
  });
});

describe('endgame solver ranks winning starts with the evaluator', () => {
  it('prefers the draw_two line over the gamble line in a 2-player endgame', () => {
    // Hand: [red5, red draw_two]. Both start a "winning" sequence on paper,
    // but draw_two first is strictly better (opponent draws 2 and is skipped,
    // guaranteeing the follow-up red5 win in 2-player).
    const red5 = n('r5', 'red', 5);
    const redD2 = makeCard('draw_two', 'red', { id: 'rd2' });
    const state = makeState({
      players: [makePlayer('bot', [red5, redD2], hardBot), makePlayer('h1', [n('x1', 'blue', 1), n('x2', 'green', 2)])],
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });
    const actions = chooseBotAction(state, 'bot');
    expect(actions[0]).toMatchObject({ type: 'PLAY_CARD', cardId: 'rd2' });
  });

  it('still finds the only winning start', () => {
    // Hand: [red5, blue skip]. Only red5 → blue? no. red5 leaves blue skip
    // unplayable; blue skip is unplayable now. Only red5 is playable at all.
    const state = makeState({
      players: [
        makePlayer('bot', [n('r5', 'red', 5), makeCard('skip', 'blue', { id: 'bsk' })], hardBot),
        makePlayer('h1', [n('x1', 'blue', 1)]),
      ],
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });
    const actions = chooseBotAction(state, 'bot');
    expect(actions[0]!.type).toBe('PLAY_CARD');
  });
});

describe('multi-play chain ordering', () => {
  it('ends the chain on the color the bot holds most of', () => {
    // Hand: three 5s (red, blue, green) + two extra yellow… no — extras are
    // blue so blue is the dominant remaining color; chain must end on blue-5? No:
    // blue-5 is chained too. Remaining after chain: two blue cards → the LAST
    // chained 5 should be the one whose color matches remaining (blue).
    const r5 = n('r5', 'red', 5);
    const b5 = n('b5', 'blue', 5);
    const g5 = n('g5', 'green', 5);
    const b1 = n('b1', 'blue', 1);
    const b2 = n('b2', 'blue', 2);
    const state = makeState({
      players: [
        makePlayer('bot', [r5, b5, g5, b1, b2], hardBot),
        makePlayer('h1', [n('x1', 'yellow', 9), n('x2', 'yellow', 8), n('x3', 'green', 7)]),
      ],
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, multiplePlaySameNumber: true },
      },
    });

    const actions = chooseBotAction(state, 'bot');
    const plays = actions.filter(a => a.type === 'PLAY_CARD');
    // Hard bot (specialCardAwareness=1) chains all three 5s
    expect(plays.length).toBe(3);
    const lastPlay = plays[plays.length - 1] as { cardId: string };
    // Last chained card must be the blue 5 (bot's remaining hand is blue-heavy).
    // The first play is the evaluator's pick; regardless of which 5 starts,
    // blue must come last among the chained cards.
    expect(lastPlay.cardId).toBe('b5');
  });
});

describe('bestColorsForHand', () => {
  it('returns all tied colors', () => {
    const hand = [n('r1', 'red', 1), n('b1', 'blue', 1)];
    expect(new Set(bestColorsForHand(hand))).toEqual(new Set(['red', 'blue']));
  });

  it('returns the single dominant color when there is one', () => {
    const hand = [n('r1', 'red', 1), n('r2', 'red', 2), n('b1', 'blue', 1)];
    expect(bestColorsForHand(hand)).toEqual(['red']);
  });
});

describe('elimination-aware targeting', () => {
  it('hard bot draw_two pressure targets the alive next player', () => {
    // Seat order: bot, eliminated seat, human with 1 card (the real next player).
    // globalThreat should still see the human as dist=1 and favor draw_two.
    const d2 = makeCard('draw_two', 'red', { id: 'rd2' });
    const state = makeState({
      players: [
        makePlayer(
          'bot',
          [d2, n('g9', 'green', 9), n('g8', 'green', 8), n('g7', 'green', 3), n('b9', 'blue', 9)],
          hardBot,
        ),
        makePlayer('gone', [], undefined, { eliminated: true }),
        makePlayer('h1', [n('x1', 'red', 1)]),
        makePlayer('h2', [n('y1', 'blue', 1), n('y2', 'blue', 2), n('y3', 'green', 5), n('y4', 'yellow', 6)]),
      ],
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true },
      },
    });
    const actions = chooseBotAction(state, 'bot');
    // The one-card human right after the zombie seat must be hit with the +2
    expect(actions[0]).toMatchObject({ type: 'PLAY_CARD', cardId: 'rd2' });
  });
});
