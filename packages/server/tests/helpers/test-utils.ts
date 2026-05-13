import type { GameState, Player } from '@uno-online/shared';
import type { Card, Color } from '@uno-online/shared';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';

export function makeCard(
  type: Card['type'],
  color: Color | null,
  extra?: { value?: number; id?: string },
): Card {
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

export function makePlayer(id: string, hand: Card[] = []): Player {
  return { id, name: `Player_${id}`, hand, score: 0, connected: true, calledUno: false };
}

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    players: [makePlayer('p1'), makePlayer('p2')],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deckLeft: [],
    deckRight: [],
    deckLeftInitialCount: 0,
    deckRightInitialCount: 0,
    deckHash: '',
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
