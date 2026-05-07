import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { authPreHandler } from '../auth/service';
import { getRoom, getRoomPlayers } from '../room/store';

export async function registerRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const preHandler = authPreHandler(ctx.config.jwtSecret);

  fastify.get('/rooms/active', { preHandler }, async () => {
    const allKeys = await ctx.kv.keys('room:*');
    const roomKeys = allKeys.filter(k => !k.includes(':players') && !k.includes(':state'));

    const activeRooms = [];
    for (const key of roomKeys) {
      const roomCode = key.replace('room:', '');
      const room = await getRoom(ctx.kv, roomCode);
      if (!room || room.status !== 'playing') continue;

      const settings = room.settings;
      if (!settings.allowSpectators) continue;

      const players = await getRoomPlayers(ctx.kv, roomCode);

      const spectatorSockets = await ctx.io.in(roomCode).fetchSockets();
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
  });
}
