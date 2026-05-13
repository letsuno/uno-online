import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import type { UserRole } from '@uno-online/shared';
import type { AuthenticatedRequest } from '../auth/service.js';
import { adminOnly } from './middleware.js';
import { getRoom, getRoomPlayers, deleteRoom } from '../room/store.js';
import { sql } from 'kysely';

export function registerAdminRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config, kv, db } = ctx;
  const preHandler = adminOnly(config.jwtSecret);

  // Dashboard stats
  fastify.get('/admin/dashboard', { preHandler }, async () => {
    const userStats = await db
      .selectFrom('users')
      .select([
        sql<number>`count(*)`.as('totalUsers'),
      ])
      .executeTakeFirstOrThrow();

    const roomKeys = await kv.keys('room:*');
    // Filter to only room keys (not room:CODE:players etc.)
    const roomCodes = [...new Set(roomKeys.map(k => {
      const parts = k.split(':');
      return parts[1]!;
    }))];

    return {
      totalUsers: Number(userStats.totalUsers),
      activeRooms: roomCodes.length,
    };
  });

  // Paginated user list
  fastify.get<{
    Querystring: { search?: string; page?: string; limit?: string };
  }>('/admin/users', { preHandler }, async (request) => {
    const search = request.query.search?.trim() ?? '';
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    let query = db.selectFrom('users').select([
      'id', 'username', 'nickname', 'role', 'createdAt',
    ]);

    let countQuery = db.selectFrom('users').select(sql<number>`count(*)`.as('count'));

    if (search) {
      const pattern = `%${search}%`;
      query = query.where((eb) =>
        eb.or([
          eb('username', 'like', pattern),
          eb('nickname', 'like', pattern),
        ])
      );
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb('username', 'like', pattern),
          eb('nickname', 'like', pattern),
        ])
      );
    }

    const [users, countResult] = await Promise.all([
      query.orderBy('createdAt', 'asc').offset(offset).limit(limit).execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);

    return {
      users,
      total: Number(countResult.count),
      page,
      limit,
    };
  });

  // Change user role
  fastify.patch<{
    Params: { id: string };
    Body: { role: UserRole };
  }>('/admin/users/:id/role', { preHandler }, async (request, reply) => {
    const { id } = request.params;
    const { role } = request.body;
    const validRoles: UserRole[] = ['normal', 'member', 'vip', 'admin'];

    if (!validRoles.includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }

    const result = await db
      .updateTable('users')
      .set({ role, updatedAt: sql`datetime('now')` })
      .where('id', '=', id)
      .execute();

    if (!result.length || Number(result[0]!.numUpdatedRows) === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return { success: true };
  });

  // Update user profile (username / nickname)
  fastify.patch<{
    Params: { id: string };
    Body: { username?: string; nickname?: string };
  }>('/admin/users/:id/profile', { preHandler }, async (request, reply) => {
    const { id } = request.params;
    const { username, nickname } = request.body;

    if (!username && !nickname) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }

    const updates: Record<string, unknown> = { updatedAt: sql`datetime('now')` };

    if (username) {
      const trimmed = username.trim();
      if (trimmed.length < 2 || trimmed.length > 20) {
        return reply.code(400).send({ error: 'Username must be 2-20 characters' });
      }
      const existing = await db.selectFrom('users').select('id').where('username', '=', trimmed).where('id', '!=', id).executeTakeFirst();
      if (existing) {
        return reply.code(409).send({ error: 'Username already taken' });
      }
      updates.username = trimmed;
    }

    if (nickname) {
      const trimmed = nickname.trim();
      if (trimmed.length < 1 || trimmed.length > 20) {
        return reply.code(400).send({ error: 'Nickname must be 1-20 characters' });
      }
      updates.nickname = trimmed;
    }

    const result = await db.updateTable('users').set(updates).where('id', '=', id).execute();

    if (!result.length || Number(result[0]!.numUpdatedRows) === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return { success: true };
  });

  // Active rooms list
  fastify.get('/admin/rooms', { preHandler }, async () => {
    const roomKeys = await kv.keys('room:*');
    // Extract unique room codes (keys are like room:CODE, room:CODE:players)
    const roomCodes = [...new Set(
      roomKeys
        .filter(k => !k.includes(':players') && !k.includes(':game'))
        .map(k => k.replace('room:', ''))
    )];

    const rooms = await Promise.all(
      roomCodes.map(async (code) => {
        const room = await getRoom(kv, code);
        if (!room) return null;
        const players = await getRoomPlayers(kv, code);
        return {
          code,
          ownerId: room.ownerId,
          status: room.status,
          playerCount: players.length,
          players: players.map(p => ({ userId: p.userId, nickname: p.nickname })),
          createdAt: room.createdAt,
        };
      })
    );

    return { rooms: rooms.filter(Boolean) };
  });

  // Force dissolve a room
  fastify.delete<{ Params: { code: string } }>('/admin/rooms/:code', { preHandler }, async (request, reply) => {
    const { code } = request.params;
    const room = await getRoom(kv, code);
    if (!room) {
      return reply.code(404).send({ error: 'Room not found' });
    }

    await deleteRoom(kv, code);
    return { success: true };
  });

}
