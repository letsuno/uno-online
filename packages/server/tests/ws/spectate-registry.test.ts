import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as SocketIOServer } from 'socket.io';
import {
  addSpectator,
  broadcastSpectatorLeft,
  broadcastSpectatorList,
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

  describe('broadcast helpers', () => {
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

    it('broadcastSpectatorList emits the current authoritative list', () => {
      const { io, emits } = makeIoStub();
      addSpectator(ROOM_A, 'u1', 'Alice');
      addSpectator(ROOM_A, 'u2', 'Bob');
      broadcastSpectatorList(io, ROOM_A);
      expect(emits).toEqual([
        { event: 'room:spectator_list', payload: { spectators: ['Alice', 'Bob'] } },
      ]);
    });

    it('broadcastSpectatorLeft emits both events with the updated array', () => {
      const { io, emits } = makeIoStub();
      addSpectator(ROOM_A, 'u1', 'Alice');
      addSpectator(ROOM_A, 'u2', 'Bob');
      broadcastSpectatorLeft(io, ROOM_A, 'u1', 'Alice');
      expect(emits).toEqual([
        { event: 'room:spectator_list', payload: { spectators: ['Bob'] } },
        { event: 'room:spectator_left', payload: { nickname: 'Alice', spectators: ['Bob'] } },
      ]);
    });

    // The room:spectator_left payload's `nickname` should come from the
    // authoritative registry, not the caller — guards against a stale
    // caller-supplied nickname after rename.
    it('broadcastSpectatorLeft uses the registry nickname for room:spectator_left', () => {
      const { io, emits } = makeIoStub();
      addSpectator(ROOM_A, 'u1', 'RegistryName');
      broadcastSpectatorLeft(io, ROOM_A, 'u1', 'StaleCallerName');
      const left = emits.find((e) => e.event === 'room:spectator_left');
      expect((left!.payload as { nickname: string }).nickname).toBe('RegistryName');
    });

    // The bug this whole refactor exists to fix: the server used to emit
    // { nickname } without `spectators`. Lock the contract in a test so any
    // future path that bypasses broadcastSpectatorLeft will get caught.
    it('broadcastSpectatorLeft always populates spectators on room:spectator_left (contract guard)', () => {
      const { io, emits } = makeIoStub();
      addSpectator(ROOM_A, 'u1', 'Alice');
      broadcastSpectatorLeft(io, ROOM_A, 'u1', 'Alice');
      const left = emits.find((e) => e.event === 'room:spectator_left');
      expect(left).toBeDefined();
      expect((left!.payload as { spectators: unknown }).spectators).toEqual([]);
    });

    describe('fail-loud on drift', () => {
      let warnSpy: ReturnType<typeof vi.spyOn>;
      beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      });
      afterEach(() => {
        warnSpy.mockRestore();
      });

      it('broadcastSpectatorLeft warns and does not emit when the user is untracked', () => {
        const { io, emits } = makeIoStub();
        broadcastSpectatorLeft(io, ROOM_A, 'ghost', 'Ghost');
        expect(emits).toEqual([]);
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toMatch(/untracked user/);
      });
    });
  });
});
