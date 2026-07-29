import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import { initializeGame } from '../src/rules/setup';
import { chooseBotAction } from '../src/rules/bot/bot-strategy';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import type { HouseRules } from '../src/types/house-rules';
import type { GameMode, GameState } from '../src/types/game';

/**
 * 全机器人自动对局：每一步都必须让局面前进。
 *
 * 服务端的机器人循环是「动作被拒绝就 break」，而被拒绝不会触发重新调度——
 * 机器人一旦提出非法动作，整局就永久卡死。所以「机器人产出的动作必须总能被引擎接受」
 * 是一条硬约束，这里用随机对局把它压出来。
 */
function playOut(mode: GameMode, houseRules: HouseRules, maxSteps = 4000) {
  const players = [
    { id: 'b1', name: 'B1', isBot: true, botConfig: { difficulty: 'hard' as const, personality: 'strategic' as const } },
    { id: 'b2', name: 'B2', isBot: true, botConfig: { difficulty: 'normal' as const, personality: 'balanced' as const } },
    { id: 'b3', name: 'B3', isBot: true, botConfig: { difficulty: 'easy' as const, personality: 'balanced' as const } },
  ];

  let state: GameState = initializeGame(players, houseRules, mode);
  state = { ...state, settings: { ...state.settings, houseRules, gameMode: mode } };

  for (let step = 0; step < maxSteps; step++) {
    if (state.phase === 'round_end' || state.phase === 'game_over') {
      return { ok: true as const, steps: step };
    }

    const actorId = state.pendingDrawPlayerId && state.phase === 'challenging'
      ? state.pendingDrawPlayerId
      : state.players[state.currentPlayerIndex]!.id;

    const actions = chooseBotAction(state, actorId);
    if (actions.length === 0) {
      return { ok: false as const, reason: '机器人没有给出任何动作', state, actorId };
    }

    const before = state;
    for (const action of actions) {
      const next = applyActionWithHouseRules(state, action);
      if (next === state) {
        return {
          ok: false as const,
          reason: `机器人的动作被引擎拒绝：${JSON.stringify(action)}`,
          state,
          actorId,
        };
      }
      state = next;
      if (state.phase === 'round_end' || state.phase === 'game_over') break;
    }
    if (state === before) {
      return { ok: false as const, reason: '一整轮动作后局面没有变化', state, actorId };
    }
  }
  return { ok: false as const, reason: `${maxSteps} 步仍未结束`, state, actorId: '' };
}

function describeFailure(r: Extract<ReturnType<typeof playOut>, { ok: false }>): string {
  const s = r.state;
  const top = s.discardPile[s.discardPile.length - 1];
  const actor = s.players.find(p => p.id === r.actorId);
  return [
    r.reason,
    `phase=${s.phase} flipSide=${s.flipSide} color=${s.currentColor}`,
    `drawStack=${s.drawStack} pendingPenalty=${s.pendingPenaltyDraws} untilColor=${s.pendingPenaltyUntilColor}`,
    `top=${top?.color ?? 'wild'}-${top?.type}${top?.type === 'number' ? top.value : ''}`,
    `actor=${r.actorId} hand=[${(actor?.hand ?? []).map(c => `${c.color ?? 'wild'}-${c.type}${c.type === 'number' ? c.value : ''}`).join(', ')}]`,
  ].join('\n    ');
}

function hr(overrides: Partial<HouseRules>): HouseRules {
  return { ...DEFAULT_HOUSE_RULES, ...overrides };
}

describe('机器人自动对局不会卡死', () => {
  it('classic 无村规', () => {
    for (let i = 0; i < 60; i++) {
      const r = playOut('classic', hr({}));
      expect(r.ok, r.ok ? '' : describeFailure(r)).toBe(true);
    }
  });

  it('flip 无村规', () => {
    for (let i = 0; i < 60; i++) {
      const r = playOut('flip', hr({}));
      expect(r.ok, r.ok ? '' : describeFailure(r)).toBe(true);
    }
  });

  it('flip + 罚摸叠加村规', () => {
    for (let i = 0; i < 60; i++) {
      const r = playOut('flip', hr({
        flipStackDrawOne: true,
        flipStackDrawFive: true,
        flipWildFlip: true,
      }));
      expect(r.ok, r.ok ? '' : describeFailure(r)).toBe(true);
    }
  });

  // 对照组：同样的通用村规在经典模式下会不会也卡——用来判断问题是不是 Flip 专属
  it('classic + 同一批通用村规（对照组）', () => {
    for (let i = 0; i < 60; i++) {
      const r = playOut('classic', hr({
        sevenSwapHands: true,
        jumpIn: true,
        multiplePlaySameNumber: true,
        drawUntilPlayable: true,
        forcedPlayAfterDraw: true,
        doubleScore: true,
      }));
      expect(r.ok, r.ok ? '' : describeFailure(r)).toBe(true);
    }
  });

  it('flip + 全套 Flip 村规', () => {
    for (let i = 0; i < 60; i++) {
      const r = playOut('flip', hr({
        flipStackDrawOne: true,
        flipStackDrawFive: true,
        flipStackWildDraw: true,
        flipReverseDeflect: true,
        flipSkipDeflect: true,
        flipWildFlip: true,
        flipDarkDoubleScore: true,
        flipDrawColorCap: 5,
        sevenSwapHands: true,
        jumpIn: true,
        multiplePlaySameNumber: true,
        drawUntilPlayable: true,
        forcedPlayAfterDraw: true,
        doubleScore: true,
      }));
      expect(r.ok, r.ok ? '' : describeFailure(r)).toBe(true);
    }
  });
});
