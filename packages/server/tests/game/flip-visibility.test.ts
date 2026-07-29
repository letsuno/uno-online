import { describe, it, expect } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { RoomSettings } from '@uno-online/shared';
import { GameSession } from '../../src/plugins/core/game/session';

function flipSettings(overrides: Partial<RoomSettings> = {}): RoomSettings {
  return {
    turnTimeLimit: 30,
    targetScore: 500,
    gameMode: 'flip',
    houseRules: DEFAULT_HOUSE_RULES,
    allowSpectators: true,
    spectatorMode: 'hidden',
    ...overrides,
  };
}

function makeFlipSession(settings: RoomSettings = flipSettings()) {
  return GameSession.create(
    [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }, { id: 'p3', name: 'Carol' }],
    settings,
  );
}

describe('Flip 可见性协议', () => {
  it('对手手牌只下发背面，数量与 handCount 一致', () => {
    const view = makeFlipSession().getPlayerView('p1');
    const opponent = view.players.find(p => p.id === 'p2')!;

    expect(opponent.hand).toEqual([]);
    expect(opponent.handBacks).toHaveLength(opponent.handCount);
    expect(opponent.handBacks!.every(b => b.type !== undefined)).toBe(true);
  });

  it('本人手牌可见但不含背面，也不下发 handBacks', () => {
    const view = makeFlipSession().getPlayerView('p1');
    const me = view.players.find(p => p.id === 'p1')!;

    expect(me.hand.length).toBeGreaterThan(0);
    expect(me.handBacks).toBeUndefined();
    // 关键不变量：任何一张自己的手牌都不能携带 back
    expect(me.hand.every(c => c.back === undefined)).toBe(true);
  });

  it('批量广播路径同样不会把自己的背面发给自己', () => {
    const session = makeFlipSession();
    const { baseView, hands } = session.getGameUpdateBatch();

    // baseView 是广播底稿，每个人都带 handBacks
    expect(baseView.players.every(p => p.handBacks !== undefined)).toBe(true);
    // 单独下发的手牌一律剥离背面
    for (const hand of hands.values()) {
      expect(hand.every(c => c.back === undefined)).toBe(true);
    }

    // 模拟 room-events 的按人组装：本人的 handBacks 必须被剔除
    const userId = 'p1';
    const assembled = baseView.players.map(p => {
      if (p.id === userId) {
        const { handBacks: _own, ...rest } = p;
        return { ...rest, hand: hands.get(p.id) ?? [] };
      }
      return p;
    });

    const me = assembled.find(p => p.id === userId)!;
    expect((me as { handBacks?: unknown }).handBacks).toBeUndefined();
    expect(me.hand.every(c => c.back === undefined)).toBe(true);
    expect(assembled.find(p => p.id === 'p2')!.handBacks).toBeDefined();
  });

  it('手牌透明村规揭示正面时仍不泄露自己的背面', () => {
    const session = makeFlipSession(flipSettings({
      houseRules: { ...DEFAULT_HOUSE_RULES, handRevealThreshold: 10 },
    }));
    const view = session.getPlayerView('p1');

    for (const p of view.players) {
      expect(p.hand.every(c => c.back === undefined)).toBe(true);
    }
    expect(view.players.find(p => p.id === 'p1')!.handBacks).toBeUndefined();
    expect(view.players.find(p => p.id === 'p2')!.handBacks).toBeDefined();
  });

  it('classic 模式完全不下发 handBacks', () => {
    const session = GameSession.create(
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      flipSettings({ gameMode: 'classic' }),
    );
    const view = session.getPlayerView('p1');
    expect(view.players.every(p => p.handBacks === undefined)).toBe(true);
    expect(view.flipSide).toBe('light');
  });

  it('view 带上当前牌面，供客户端切主题', () => {
    const view = makeFlipSession().getPlayerView('p1');
    expect(['light', 'dark']).toContain(view.flipSide);
    expect(view.settings.gameMode).toBe('flip');
  });
});
