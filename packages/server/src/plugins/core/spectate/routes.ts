import type { FastifyInstance } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { ActiveRoomInfo } from '@uno-online/shared';
import type { PluginContext } from '../../../plugin-context.js';
import type { KvStore } from '../../../kv/types.js';
import { getRoom, getRoomPlayers } from '../room/store.js';

export async function getActiveRooms(kv: KvStore, io: SocketIOServer): Promise<ActiveRoomInfo[]> {
  const allKeys = await kv.keys('room:*');
  const roomKeys = allKeys.filter(k => !k.includes(':players') && !k.includes(':state'));

  const activeRooms: ActiveRoomInfo[] = [];
  for (const key of roomKeys) {
    const roomCode = key.replace('room:', '');
    const room = await getRoom(kv, roomCode);
    if (!room || room.status !== 'playing') continue;

    const settings = room.settings;
    if (!settings.allowSpectators) continue;

    const players = await getRoomPlayers(kv, roomCode);
    if (players.length === 0) continue;

    const spectatorSockets = await io.in(roomCode).fetchSockets();
    const spectatorCount = spectatorSockets.filter(s => (s.data as { isSpectator?: boolean }).isSpectator).length;

    activeRooms.push({
      roomCode,
      players: players.map(p => ({ nickname: p.nickname, avatarUrl: p.avatarUrl })),
      playerCount: players.length,
      startedAt: room.createdAt,
      spectatorCount,
      spectatorMode: settings.spectatorMode,
    });
  }

  return activeRooms;
}

export async function broadcastLobbyRooms(kv: KvStore, io: SocketIOServer): Promise<void> {
  const rooms = await getActiveRooms(kv, io);
  const sockets = await io.fetchSockets();
  for (const s of sockets) {
    const data = s.data as { roomCode?: string };
    if (!data.roomCode) {
      s.emit('lobby:rooms', rooms);
    }
  }
}

export async function registerRoutes(_fastify: FastifyInstance, _ctx: PluginContext) {
}
