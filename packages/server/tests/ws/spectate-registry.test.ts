import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as SocketIOServer } from 'socket.io';
import { MemoryKvStore } from '../../src/kv/memory';
import {
  addSpectatorToRoom,
  removeSpectatorFromRoom,
  getRoomSpectators,
  clearRoomSpectators,
  setSpectatorConnected,
} from '../../src/plugins/core/room/store';
import {
  broadcastSpectatorLeft,
  broadcastSpectatorList,
} from '../../src/plugins/core/spectate/ws';

const kv = new MemoryKvStore();
const ROOM_A = 'TESTAA';
const ROOM_B = 'TESTBB';

async function resetRegistry(): Promise<void> {
  for (const code of [ROOM_A, ROOM_B]) await clearRoomSpectators(kv, code);
}

function spectator(userId: string, nickname: string, avatarUrl?: string | null) {
  return { userId, nickname, avatarUrl: avatarUrl ?? null, role: 'normal', connected: true };
}

function info(nickname: string, connected = true, avatarUrl?: string | null) {
  return { nickname, avatarUrl: avatarUrl ?? null, connected };
}

describe('spectator registry', () => {
  beforeEach(resetRegistry);

  it('lists spectators added via addSpectatorToRoom', async () => {
    await addSpectatorToRoom(kv, ROOM_A, spectator('u1', 'Alice'));
    await addSpectatorToRoom(kv, ROOM_A, spectator('u2', 'Bob'));
    const names = (await getRoomSpectators(kv, ROOM_A)).map(s => s.nickname).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('refreshes the info when the same user re-adds', async () => {
    await addSpectatorToRoom(kv, ROOM_A, spectator('u1', 'OldName'));
    await addSpectatorToRoom(kv, ROOM_A, spectator('u1', 'NewName'));
    expect((await getRoomSpectators(kv, ROOM_A)).map(s => s.nickname)).toEqual(['NewName']);
  });

  it('removeSpectatorFromRoom returns the removed nickname', async () => {
    await addSpectatorToRoom(kv, ROOM_A, spectator('u1', 'Alice'));
    expect(await removeSpectatorFromRoom(kv, ROOM_A, 'u1')).toBe('Alice');
    expect(await getRoomSpectators(kv, ROOM_A)).toEqual([]);
  });

  it('removeSpectatorFromRoom on unknown user returns null', async () => {
    expect(await removeSpectatorFromRoom(kv, ROOM_A, 'ghost')).toBeNull();
  });

  it('keeps rooms isolated', async () => {
    await addSpectatorToRoom(kv, ROOM_A, spectator('u1', 'Alice'));
    await addSpectatorToRoom(kv, ROOM_B, spectator('u1', 'Alice'));
    await removeSpectatorFromRoom(kv, ROOM_A, 'u1');
    expect(await getRoomSpectators(kv, ROOM_A)).toEqual([]);
    expect(await getRoomSpectators(kv, ROOM_B)).toHaveLength(1);
  });

  it('setSpectatorConnected toggles the connected flag', async () => {
    await addSpectatorToRoom(kv, ROOM_A, spectator('u1', 'Alice'));
    await setSpectatorConnected(kv, ROOM_A, 'u1', false);
    const [s] = await getRoomSpectators(kv, ROOM_A);
    expect(s!.connected).toBe(false);
    await setSpectatorConnected(kv, ROOM_A, 'u1', true);
    const [s2] = await getRoomSpectators(kv, ROOM_A);
    expect(s2!.connected).toBe(true);
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

    it('broadcastSpectatorList emits all spectators with connected flag', async () => {
      const { io, emits } = makeIoStub();
      await addSpectatorToRoom(kv, ROOM_A, spectator('u1', 'Alice'));
      await addSpectatorToRoom(kv, ROOM_A, spectator('u2', 'Bob'));
      await setSpectatorConnected(kv, ROOM_A, 'u2', false);
      await broadcastSpectatorList(io, kv, ROOM_A);
      expect(emits).toEqual([
        { event: 'room:spectator_list', payload: { spectators: [info('Alice'), info('Bob', false)] } },
      ]);
    });

    it('broadcastSpectatorLeft emits departure events', async () => {
      const { io, emits } = makeIoStub();
      await addSpectatorToRoom(kv, ROOM_A, spectator('u1', 'Alice'));
      await addSpectatorToRoom(kv, ROOM_A, spectator('u2', 'Bob'));
      await broadcastSpectatorLeft(io, kv, ROOM_A, 'u1', 'Alice');
      expect(emits).toEqual([
        { event: 'room:spectator_list', payload: { spectators: [info('Alice'), info('Bob')] } },
        { event: 'room:spectator_left', payload: { nickname: 'Alice', spectators: [info('Alice'), info('Bob')] } },
      ]);
    });
  });
});
