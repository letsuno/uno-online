import { describe, expect, it, beforeEach } from 'vitest';
import type { Server as SocketIOServer } from 'socket.io';
import {
  addSpectator,
  broadcastSpectatorLeftIfLast,
  clearRoomSpectators,
  getSpectatorNames,
  removeSpectatorFully,
  removeSpectatorSocket,
} from '../../src/plugins/core/spectate/ws';

/**
 * These tests cover the in-memory spectator registry — the authoritative
 * source of truth that broadcasts hang off. Every "user X is spectating"
 * mutation on the server must go through these helpers; if a future path
 * mutates `socket.data.isSpectator` without also moving the registry, the
 * UI ends up out of sync with reality (the original bug being guarded
 * against here).
 */
describe('spectator registry', () => {
  const ROOM = 'TEST01';

  beforeEach(() => {
    clearRoomSpectators(ROOM);
  });

  it('lists nicknames added via addSpectator', () => {
    addSpectator(ROOM, 'u1', 'Alice', 'sock1');
    addSpectator(ROOM, 'u2', 'Bob', 'sock2');
    expect(getSpectatorNames(ROOM).sort()).toEqual(['Alice', 'Bob']);
  });

  it('keeps the user listed when only one of multiple sockets disconnects', () => {
    addSpectator(ROOM, 'u1', 'Alice', 'sockA');
    addSpectator(ROOM, 'u1', 'Alice', 'sockB');
    const first = removeSpectatorSocket(ROOM, 'u1', 'sockA');
    expect(first.removed).toBe(false);
    expect(getSpectatorNames(ROOM)).toEqual(['Alice']);
    const second = removeSpectatorSocket(ROOM, 'u1', 'sockB');
    expect(second.removed).toBe(true);
    expect(second.nickname).toBe('Alice');
    expect(getSpectatorNames(ROOM)).toEqual([]);
  });

  it('refreshes nickname when the same user re-joins with a new one', () => {
    addSpectator(ROOM, 'u1', 'OldName', 'sockA');
    addSpectator(ROOM, 'u1', 'NewName', 'sockB');
    expect(getSpectatorNames(ROOM)).toEqual(['NewName']);
  });

  it('removeSpectatorSocket on an unknown user is a no-op (no throw)', () => {
    expect(removeSpectatorSocket(ROOM, 'ghost', 'sockX').removed).toBe(false);
    addSpectator(ROOM, 'u1', 'Alice', 'sockA');
    expect(removeSpectatorSocket(ROOM, 'u1', 'sockNotThere').removed).toBe(false);
    expect(getSpectatorNames(ROOM)).toEqual(['Alice']);
  });

  it('removeSpectatorFully drops every ref regardless of socket count', () => {
    addSpectator(ROOM, 'u1', 'Alice', 'sockA');
    addSpectator(ROOM, 'u1', 'Alice', 'sockB');
    removeSpectatorFully(ROOM, 'u1');
    expect(getSpectatorNames(ROOM)).toEqual([]);
  });

  describe('broadcastSpectatorLeftIfLast', () => {
    /** Minimal io stub that records every emit so we can assert payloads. */
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

    it('emits both room:spectator_list and room:spectator_left with full array when last socket leaves', () => {
      const { io, emits } = makeIoStub();
      addSpectator(ROOM, 'u1', 'Alice', 'sockA');
      addSpectator(ROOM, 'u2', 'Bob', 'sockB');
      broadcastSpectatorLeftIfLast(io, ROOM, 'u1', 'sockA');
      expect(emits).toEqual([
        { event: 'room:spectator_list', payload: { spectators: ['Bob'] } },
        { event: 'room:spectator_left', payload: { nickname: 'Alice', spectators: ['Bob'] } },
      ]);
    });

    it('emits nothing when the user still has other sockets attached (multi-tab)', () => {
      const { io, emits } = makeIoStub();
      addSpectator(ROOM, 'u1', 'Alice', 'sockA');
      addSpectator(ROOM, 'u1', 'Alice', 'sockB');
      broadcastSpectatorLeftIfLast(io, ROOM, 'u1', 'sockA');
      expect(emits).toEqual([]);
      expect(getSpectatorNames(ROOM)).toEqual(['Alice']);
    });

    it('emits nothing when the user is not in the registry at all', () => {
      const { io, emits } = makeIoStub();
      broadcastSpectatorLeftIfLast(io, ROOM, 'ghost', 'sockX');
      expect(emits).toEqual([]);
    });

    it('always includes the spectators array in the room:spectator_left payload (contract guard)', () => {
      // Regression test for the bug this whole refactor exists to fix: the
      // server used to emit { nickname } without `spectators`, leaving other
      // clients to either trust local state or fall back to a stale snapshot.
      const { io, emits } = makeIoStub();
      addSpectator(ROOM, 'u1', 'Alice', 'sockA');
      broadcastSpectatorLeftIfLast(io, ROOM, 'u1', 'sockA');
      const leftEvent = emits.find((e) => e.event === 'room:spectator_left');
      expect(leftEvent).toBeDefined();
      expect((leftEvent!.payload as { spectators: unknown }).spectators).toEqual([]);
    });
  });
});
