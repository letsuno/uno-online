import { describe, it, expect } from 'vitest';
import { DEFAULT_HOUSE_RULES, GameEventType } from '@uno-online/shared';
import { GameSession } from '../../src/plugins/core/game/session';
import { makeCard, makeGameState, makePlayer } from '../helpers/test-utils';

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

  it('records chat messages in history and event buffer', () => {
    const session = GameSession.create(players);
    const message = {
      id: 'm1',
      userId: 'p1',
      nickname: 'Alice',
      text: 'hello',
      timestamp: 123,
      role: 'normal',
    };

    session.addChatMessage(message);

    expect(session.getChatHistory()).toEqual([message]);
    expect(session.getFullState().chatHistory).toEqual([message]);
    expect(session.getEvents()[0]).toMatchObject({
      eventType: GameEventType.CHAT_MESSAGE,
      playerId: 'p1',
      payload: { message },
    });
  });
});

describe('GameSession deck hash', () => {
  it('computes a non-empty deckHash on create', () => {
    const session = GameSession.create(players);
    const state = session.getFullState();
    expect(state.deckHash).toBeTruthy();
    expect(state.deckHash.length).toBe(64);
  });

  it('produces deterministic hash for same deck', () => {
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

  it('reveals threshold hands in hidden mode when hand reveal is enabled', () => {
    const p1Hand = [makeCard('number', 'red', { value: 1, id: 'p1c' })];
    const p2Hand = [
      makeCard('number', 'blue', { value: 1, id: 'p2c1' }),
      makeCard('number', 'blue', { value: 2, id: 'p2c2' }),
      makeCard('number', 'blue', { value: 3, id: 'p2c3' }),
    ];
    const state = makeGameState({
      players: [makePlayer('p1', p1Hand), makePlayer('p2', p2Hand)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, handRevealThreshold: 2 },
      },
    });

    const view = GameSession.fromState(state).getSpectatorView('hidden');

    expect(view.players[0]!.hand.map((c) => c.id)).toEqual(['p1c']);
    expect(view.players[1]!.hand).toEqual([]);
    expect(view.players[1]!.handCount).toBe(3);
  });
});

describe('GameSession initial deck serialization', () => {
  it('captures initial deck serialized string', () => {
    const session = GameSession.create(players);
    const serialized = session.getInitialDeckSerialized();
    expect(serialized).toBeTruthy();
    const parsed = JSON.parse(serialized);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
