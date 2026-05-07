import { describe, it, expect } from 'vitest';
import type { GameState, RoomSettings } from '../src/types/game';

describe('GameState extensions', () => {
  it('accepts deckHash field', () => {
    const partial: Pick<GameState, 'deckHash'> = { deckHash: 'abc123' };
    expect(partial.deckHash).toBe('abc123');
  });
});

describe('RoomSettings extensions', () => {
  it('accepts spectator settings', () => {
    const settings: Pick<RoomSettings, 'allowSpectators' | 'spectatorMode'> = {
      allowSpectators: true,
      spectatorMode: 'hidden',
    };
    expect(settings.allowSpectators).toBe(true);
    expect(settings.spectatorMode).toBe('hidden');
  });
});
