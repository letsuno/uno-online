import { describe, expect, it } from 'vitest';
import { resolveCurrentRoom } from '../src/features/lobby/current-room-resolution';

describe('resolveCurrentRoom', () => {
  it('treats authoritative no-room as a full client reset boundary', () => {
    expect(resolveCurrentRoom('ABC123', 'ABC123', null, false)).toEqual({ kind: 'reset' });
    expect(resolveCurrentRoom(null, null, null, false)).toEqual({ kind: 'reset' });
  });

  it('ignores a response issued before the suspension marker changed', () => {
    expect(resolveCurrentRoom(null, 'NEW456', null, false)).toEqual({ kind: 'ignore' });
    expect(resolveCurrentRoom('OLD123', 'NEW456', 'OLD123', true)).toEqual({ kind: 'ignore' });
  });

  it('keeps a matching suspended membership in the lobby unless return was requested', () => {
    expect(resolveCurrentRoom('ABC123', 'ABC123', 'ABC123', false)).toEqual({
      kind: 'suspended',
      roomCode: 'ABC123',
      returnToGame: false,
    });
    expect(resolveCurrentRoom('ABC123', 'ABC123', 'ABC123', true)).toEqual({
      kind: 'suspended',
      roomCode: 'ABC123',
      returnToGame: true,
    });
  });

  it('routes ordinary membership to the room and retires only an older marker', () => {
    expect(resolveCurrentRoom(null, null, 'ABC123', false)).toEqual({
      kind: 'room',
      roomCode: 'ABC123',
      clearPreviousSuspension: false,
    });
    expect(resolveCurrentRoom('OLD123', 'OLD123', 'NEW456', false)).toEqual({
      kind: 'room',
      roomCode: 'NEW456',
      clearPreviousSuspension: true,
    });
  });
});
