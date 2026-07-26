import { describe, it, expect } from 'vitest';
import type { GameState } from '../../src/types/game';
import type { HouseRules } from '../../src/types/house-rules';
import type { BotConfig } from '../../src/types/bot';
import { DEFAULT_HOUSE_RULES } from '../../src/types/house-rules';
import { initializeGame, initializeNextRound } from '../../src/rules/setup';
import { applyActionWithHouseRules } from '../../src/rules/house-rules-engine';
import { chooseBotAction } from '../../src/rules/bot/bot-strategy';

/**
 * Full-game smoke test: four bots play unattended from deal to game_over.
 * Catches livelocks, crashes, and rules/bot interactions that stall a game.
 */

const BOTS: { id: string; config: BotConfig }[] = [
  { id: 'b1', config: { difficulty: 'novice', personality: 'chaotic' } },
  { id: 'b2', config: { difficulty: 'easy', personality: 'defensive' } },
  { id: 'b3', config: { difficulty: 'normal', personality: 'aggressive' } },
  { id: 'b4', config: { difficulty: 'hard', personality: 'strategic' } },
];

function fingerprint(s: GameState): string {
  const handTotal = s.players.reduce((n, p) => n + p.hand.length, 0);
  return [
    s.phase, s.currentPlayerIndex, s.currentColor, s.direction,
    handTotal, s.discardPile.length, s.drawStack,
    s.pendingPenaltyDraws ?? 0, s.pendingDrawPlayerId ?? '',
    s.lastAction?.type ?? '',
  ].join('|');
}

function simulateGame(houseRules: HouseRules, maxTurns = 8000): { state: GameState; turns: number } {
  let state = initializeGame(
    BOTS.map(b => ({ id: b.id, name: b.id, isBot: true, botConfig: b.config })),
    houseRules,
  );
  state = { ...state, settings: { ...state.settings, targetScore: 100 } };

  let stuck = 0;
  for (let turn = 0; turn < maxTurns; turn++) {
    if (state.phase === 'game_over') return { state, turns: turn };
    if (state.phase === 'round_end') {
      state = initializeNextRound(state);
      continue;
    }

    const actorId = state.phase === 'challenging'
      ? state.pendingDrawPlayerId
      : state.players[state.currentPlayerIndex]?.id;
    expect(actorId, `no actor in phase ${state.phase}`).toBeTruthy();
    const actor = state.players.find(p => p.id === actorId)!;
    expect(actor.eliminated, `eliminated player ${actorId} got a turn (phase ${state.phase})`).not.toBe(true);

    const actions = chooseBotAction(state, actorId!);
    expect(actions.length, `bot ${actorId} returned no actions in phase ${state.phase}`).toBeGreaterThan(0);

    const before = fingerprint(state);
    for (const action of actions) {
      state = applyActionWithHouseRules(state, action);
    }
    if (fingerprint(state) === before) {
      stuck++;
      expect(stuck, `game stalled: bot ${actorId} actions had no effect in phase ${state.phase}`).toBeLessThan(4);
    } else {
      stuck = 0;
    }
  }
  throw new Error(`game did not finish within ${maxTurns} turns (phase ${state.phase})`);
}

const RULESETS: { name: string; hr: HouseRules }[] = [
  { name: 'classic', hr: { ...DEFAULT_HOUSE_RULES } },
  {
    name: 'party',
    hr: {
      ...DEFAULT_HOUSE_RULES,
      stackDrawTwo: true, stackDrawFour: true, zeroRotateHands: true,
      sevenSwapHands: true, jumpIn: true, drawUntilPlayable: true,
    },
  },
  {
    name: 'attack-heavy',
    hr: {
      ...DEFAULT_HOUSE_RULES,
      stackDrawTwo: true, stackDrawFour: true, crossStack: true,
      reverseDeflectDrawTwo: true, reverseDeflectDrawFour: true, skipDeflect: true,
      revengeMode: true, noChallengeWildFour: true,
    },
  },
  {
    name: 'elimination-multiplay',
    hr: {
      ...DEFAULT_HOUSE_RULES,
      elimination: true, multiplePlaySameNumber: true, bombCard: true,
      noWildFinish: true, noFunctionCardFinish: true,
      sevenSwapHands: true, zeroRotateHands: true,
    },
  },
  {
    name: 'team-limits',
    hr: {
      ...DEFAULT_HOUSE_RULES,
      teamMode: true, handLimit: 15, forcedPlay: true, forcedPlayAfterDraw: true,
      strictUnoCall: true, wildFirstTurn: true,
    },
  },
];

describe('bot full-game simulation', () => {
  for (const { name, hr } of RULESETS) {
    it(`4 bots finish a full game under "${name}" rules`, () => {
      for (let run = 0; run < 3; run++) {
        const { state } = simulateGame(hr);
        expect(state.phase).toBe('game_over');
        expect(state.winnerId).toBeTruthy();
      }
    });
  }
});
