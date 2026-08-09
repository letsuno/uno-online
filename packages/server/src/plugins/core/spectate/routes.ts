import type { FastifyInstance } from 'fastify';
import type { UnoServer as SocketIOServer } from '../../../ws/types.js';
import type { ActiveRoomInfo } from '@uno-online/shared';
import type { PluginContext } from '../../../plugin-context.js';
import type { KvStore } from '../../../kv/types.js';
import { getRoom, getRoomSeats, getSeatedPlayers } from '../room/store.js';
import { loadGameState } from '../game/state-store.js';

export async function getActiveRooms(kv: KvStore, io: SocketIOServer): Promise<ActiveRoomInfo[]> {
  const allKeys = await kv.keys('room:*');
  const roomCodes = allKeys.filter(key => /^room:[^:]+$/u.test(key)).map(key => key.slice('room:'.length));

  const activeRooms: ActiveRoomInfo[] = [];
  for (const roomCode of roomCodes) {
    const room = await getRoom(kv, roomCode);
    if (!room || room.status !== 'playing') continue;

    const settings = room.settings;
    if (!settings.allowSpectators) continue;

    const seats = await getRoomSeats(kv, roomCode);
    const players = getSeatedPlayers(seats);
    if (players.length === 0) continue;

    const spectatorSockets = await io.in(roomCode).fetchSockets();
    const spectatorCount = spectatorSockets.filter(s => s.data.isSpectator).length;

    const gameState = await loadGameState(kv, roomCode);
    if (typeof gameState?.gameStartedAt !== 'number') {
      throw new Error(`Playing room ${roomCode} is missing its current game snapshot`);
    }

    activeRooms.push({
      roomCode,
      players: players.map(p => ({ nickname: p.nickname, avatarUrl: p.avatarUrl })),
      playerCount: players.length,
      gameStartedAt: gameState.gameStartedAt,
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
    if (!s.data.roomCode) {
      s.emit('lobby:rooms', rooms);
    }
  }
}

export async function registerRoutes(_fastify: FastifyInstance, _ctx: PluginContext) {}
