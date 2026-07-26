import { describe, it, expect } from 'vitest';
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
    connected: true,
    autopilot: false,
    calledUno: false,
    isBot: botConfig !== undefined,
    botConfig,
    ...extra,
  };
}

const hardBot: BotConfig = { difficulty: 'hard', personality: 'balanced' };
const normalBot: BotConfig = { difficulty: 'normal', personality: 'balanced' };

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

    // Normal bots have small score noise/mistake rates — sample repeatedly
    let wd4Plays = 0;
    for (let i = 0; i < 60; i++) {
      const actions = chooseBotAction(state, 'bot');
      if (actions[0]?.type === 'PLAY_CARD' && actions[0].cardId === 'wd4') wd4Plays++;
    }
    // Without the self-check the WD4 (actionValue 10) wins most of the time;
    // with the -20 risk penalty it should be rare (noise-only).
    expect(wd4Plays).toBeLessThan(10);
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
});

describe('endgame solver ranks winning starts with the evaluator', () => {
  it('prefers the draw_two line over the gamble line in a 2-player endgame', () => {
    // Hand: [red5, red draw_two]. Both start a "winning" sequence on paper,
    // but draw_two first is strictly better (opponent draws 2 and is skipped,
    // guaranteeing the follow-up red5 win in 2-player).
    const red5 = n('r5', 'red', 5);
    const redD2 = makeCard('draw_two', 'red', { id: 'rd2' });
    const state = makeState({
      players: [
        makePlayer('bot', [red5, redD2], hardBot),
        makePlayer('h1', [n('x1', 'blue', 1), n('x2', 'green', 2)]),
      ],
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
        makePlayer('bot', [d2, n('g9', 'green', 9), n('g8', 'green', 8), n('g7', 'green', 3), n('b9', 'blue', 9)], hardBot),
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
