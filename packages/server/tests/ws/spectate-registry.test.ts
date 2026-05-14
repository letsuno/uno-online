import { describe, expect, it, beforeEach } from 'vitest';
import type { Server as SocketIOServer } from 'socket.io';
import {
  addSpectator,
  broadcastSpectatorLeft,
  clearRoomSpectators,
  getSpectatorNames,
  removeSpectator,
} from '../../src/plugins/core/spectate/ws';

const ROOM_A = 'TESTAA';
const ROOM_B = 'TESTBB';

/** Reset every room the suite touches so tests can't leak state into each other. */
function resetRegistry(): void {
  for (const code of [ROOM_A, ROOM_B]) clearRoomSpectators(code);
}

describe('spectator registry', () => {
  beforeEach(resetRegistry);

  it('lists nicknames added via addSpectator', () => {
    addSpectator(ROOM_A, 'u1', 'Alice');
    addSpectator(ROOM_A, 'u2', 'Bob');
    expect(getSpectatorNames(ROOM_A).sort()).toEqual(['Alice', 'Bob']);
  });

  it('refreshes the nickname when the same user re-adds with a new one', () => {
    addSpectator(ROOM_A, 'u1', 'OldName');
    addSpectator(ROOM_A, 'u1', 'NewName');
    expect(getSpectatorNames(ROOM_A)).toEqual(['NewName']);
  });

  it('removeSpectator returns the removed nickname and drops the entry', () => {
    addSpectator(ROOM_A, 'u1', 'Alice');
    expect(removeSpectator(ROOM_A, 'u1')).toBe('Alice');
    expect(getSpectatorNames(ROOM_A)).toEqual([]);
  });

  it('removeSpectator on an unknown user returns null (no throw)', () => {
    expect(removeSpectator(ROOM_A, 'ghost')).toBeNull();
    addSpectator(ROOM_A, 'u1', 'Alice');
    expect(removeSpectator(ROOM_A, 'someone-else')).toBeNull();
    expect(getSpectatorNames(ROOM_A)).toEqual(['Alice']);
  });

  it('keeps rooms isolated', () => {
    addSpectator(ROOM_A, 'u1', 'Alice');
    addSpectator(ROOM_B, 'u1', 'Alice');
    removeSpectator(ROOM_A, 'u1');
    expect(getSpectatorNames(ROOM_A)).toEqual([]);
    expect(getSpectatorNames(ROOM_B)).toEqual(['Alice']);
  });

  describe('broadcastSpectatorLeft', () => {
    function makeIoStub() {
      const emits: Array<{ event: string; payload: unknown }> = [];
      const io = {
        to(_room: string) {
          return {
            emit(event: string, payload: unknown) {
              emits.push({ event, payload });
            },
          };
        },
      } as unknown as SocketIOServer;
      return { io, emits };
    }

    it('emits both room:spectator_list and room:spectator_left with the updated array', () => {
      const { io, emits } = makeIoStub();
      addSpectator(ROOM_A, 'u1', 'Alice');
      addSpectator(ROOM_A, 'u2', 'Bob');
      broadcastSpectatorLeft(io, ROOM_A, 'u1');
      expect(emits).toEqual([
        { event: 'room:spectator_list', payload: { spectators: ['Bob'] } },
        { event: 'room:spectator_left', payload: { nickname: 'Alice', spectators: ['Bob'] } },
      ]);
    });

    it('is a no-op when the user is not tracked', () => {
      const { io, emits } = makeIoStub();
      broadcastSpectatorLeft(io, ROOM_A, 'ghost');
      expect(emits).toEqual([]);
    });

    // The bug this whole refactor exists to fix: the server used to emit
    // { nickname } without `spectators`. Lock the contract in a test so any
    // future path that bypasses broadcastSpectatorLeft will get caught.
    it('always populates the spectators array on room:spectator_left (contract guard)', () => {
      const { io, emits } = makeIoStub();
      addSpectator(ROOM_A, 'u1', 'Alice');
      broadcastSpectatorLeft(io, ROOM_A, 'u1');
      const left = emits.find((e) => e.event === 'room:spectator_left');
      expect(left).toBeDefined();
      expect((left!.payload as { spectators: unknown }).spectators).toEqual([]);
    });
  });
});
