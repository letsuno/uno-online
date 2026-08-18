import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { UserRole } from '@uno-online/shared';
import { PROTOCOL_VERSION, isUserRole } from '@uno-online/shared';
import type { PluginContext } from '../../../plugin-context.js';
import { resolveAvatar } from '../../../db/user-repo.js';
import { AiPluginNotFoundError, BuiltInAiPluginMutationError, aiProviderRegistry } from '../../../ai/model-registry.js';
import { loadGameState } from '../game/state-store.js';
import { getRoom, getRoomSeats, getRoomSpectators, getUserRoom } from '../room/store.js';
import { adminOnly } from './middleware.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../../package.json') as { version: string };

async function loadAdminRooms(kv: PluginContext['kv']) {
  const roomKeys = await kv.keys('room:*');
  const roomCodes = roomKeys.filter(key => /^room:[^:]+$/u.test(key)).map(key => key.slice('room:'.length));

  const rooms = await Promise.all(
    roomCodes.map(async code => {
      const room = await getRoom(kv, code);
      if (!room) return null;

      const [seats, spectators, gameState] = await Promise.all([
        getRoomSeats(kv, code),
        getRoomSpectators(kv, code),
        room.status === 'playing' ? loadGameState(kv, code) : Promise.resolve(null),
      ]);
      const players = seats.flatMap((player, seatIndex) => {
        if (!player) return [];
        return [
          {
            seatIndex,
            userId: player.userId,
            nickname: player.nickname,
            avatarUrl: player.avatarUrl,
            role: player.role,
            ready: player.ready,
            connected: player.connected,
            isBot: player.isBot,
            botDifficulty: player.botConfig?.difficulty ?? null,
            aiProviderId: player.botConfig?.difficulty === 'rl' ? player.botConfig.aiProviderId : null,
          },
        ];
      });
      const spectatorItems = spectators.map(spectator => ({
        userId: spectator.userId,
        nickname: spectator.nickname,
        avatarUrl: spectator.avatarUrl,
        role: spectator.role,
        connected: spectator.connected,
      }));
      const owner =
        players.find(player => player.userId === room.ownerId) ??
        spectatorItems.find(spectator => spectator.userId === room.ownerId);
      const currentPlayer = gameState?.players[gameState.currentPlayerIndex];

      return {
        code,
        ownerId: room.ownerId,
        ownerNickname: owner?.nickname ?? null,
        status: room.status,
        players,
        spectators: spectatorItems,
        connectedPlayerCount: players.filter(player => player.connected).length,
        botCount: players.filter(player => player.isBot).length,
        connectedSpectatorCount: spectatorItems.filter(spectator => spectator.connected).length,
        settings: room.settings,
        game: gameState
          ? {
              phase: gameState.phase,
              roundNumber: gameState.roundNumber,
              currentPlayerId: currentPlayer?.id ?? null,
              currentPlayerName: currentPlayer?.name ?? null,
              startedAt: gameState.gameStartedAt ?? null,
            }
          : null,
        createdAt: room.createdAt,
        lastActivityAt: room.lastActivityAt,
      };
    }),
  );

  return rooms
    .filter((room): room is NonNullable<typeof room> => room !== null)
    .sort((left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt));
}

function requireStoredUserRole(role: string): UserRole {
  if (!isUserRole(role)) throw new Error(`数据库中的用户角色无效：${role}`);
  return role;
}

export function registerAdminRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config, kv, db, io } = ctx;
  const preHandler = adminOnly(config.jwtSecret);

  fastify.get('/admin/dashboard', { preHandler }, async () => {
    const [userStats, roleRows, credentialStats, recentUserRows, rooms] = await Promise.all([
      db
        .selectFrom('users')
        .select([
          sql<number>`count(*)`.as('totalUsers'),
          sql<number>`sum(case when password_hash is not null then 1 else 0 end)`.as('passwordUsers'),
          sql<number>`sum(case when github_id is not null then 1 else 0 end)`.as('githubUsers'),
        ])
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('users')
        .select(['role', sql<number>`count(*)`.as('count')])
        .groupBy('role')
        .execute(),
      Promise.all([
        db
          .selectFrom('apiKeys')
          .select(sql<number>`count(*)`.as('count'))
          .executeTakeFirstOrThrow(),
        db
          .selectFrom('passkeys')
          .select(sql<number>`count(*)`.as('count'))
          .executeTakeFirstOrThrow(),
      ]),
      db
        .selectFrom('users')
        .select(['id', 'username', 'nickname', 'role', 'avatarUrl', 'avatarData', 'createdAt', 'updatedAt'])
        .orderBy('createdAt', 'desc')
        .limit(5)
        .execute(),
      loadAdminRooms(kv),
    ]);

    const roleCounts: Record<UserRole, number> = { normal: 0, member: 0, vip: 0, admin: 0 };
    for (const row of roleRows) roleCounts[requireStoredUserRole(row.role)] = Number(row.count);

    const aiSnapshot = await aiProviderRegistry.snapshot();
    const memory = process.memoryUsage();
    const roomCounts = { waiting: 0, playing: 0, finished: 0 };
    for (const room of rooms) roomCounts[room.status] += 1;

    return {
      generatedAt: new Date().toISOString(),
      server: {
        name: config.serverName,
        motd: config.serverMotd,
        version: pkg.version,
        protocolVersion: PROTOCOL_VERSION,
        environment: config.devMode ? 'development' : 'production',
        onlineConnections: io.engine.clientsCount,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
        },
      },
      totals: {
        users: Number(userStats.totalUsers),
        rooms: rooms.length,
        waitingRooms: roomCounts.waiting,
        playingRooms: roomCounts.playing,
        finishedRooms: roomCounts.finished,
        connectedPlayers: rooms.reduce((sum, room) => sum + room.connectedPlayerCount, 0),
        bots: rooms.reduce((sum, room) => sum + room.botCount, 0),
        spectators: rooms.reduce((sum, room) => sum + room.spectators.length, 0),
        connectedSpectators: rooms.reduce((sum, room) => sum + room.connectedSpectatorCount, 0),
        apiKeys: Number(credentialStats[0].count),
        passkeys: Number(credentialStats[1].count),
      },
      accounts: {
        passwordUsers: Number(userStats.passwordUsers ?? 0),
        githubUsers: Number(userStats.githubUsers ?? 0),
        roleCounts,
      },
      ai: {
        providers: aiSnapshot.providers.length,
        enabledProviders: aiSnapshot.providers.filter(provider => provider.enabled).length,
        loadFailures: aiSnapshot.loadFailures.length,
      },
      recentUsers: recentUserRows.map(user => ({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: requireStoredUserRole(user.role),
        avatarUrl: resolveAvatar({
          id: user.id,
          avatarUrl: user.avatarUrl,
          avatarData: user.avatarData,
          updatedAt: user.updatedAt,
        }),
        createdAt: user.createdAt,
      })),
      recentRooms: rooms.slice(0, 5).map(room => ({
        code: room.code,
        status: room.status,
        ownerNickname: room.ownerNickname,
        playerCount: room.players.length,
        connectedPlayerCount: room.connectedPlayerCount,
        spectatorCount: room.spectators.length,
        lastActivityAt: room.lastActivityAt,
      })),
    };
  });

  fastify.get<{
    Querystring: { search?: string; role?: string; page?: string; limit?: string };
  }>('/admin/users', { preHandler }, async (request, reply) => {
    const search = request.query.search?.trim() ?? '';
    const role = request.query.role?.trim() ?? '';
    if (role && !isUserRole(role)) return reply.code(400).send({ error: '用户角色筛选值无效' });

    const page = Math.max(1, Number.parseInt(request.query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;
    let query = db
      .selectFrom('users')
      .select([
        'id',
        'username',
        'nickname',
        'role',
        'avatarUrl',
        'avatarData',
        'githubId',
        'passwordHash',
        'createdAt',
        'updatedAt',
        'lastLoginAt',
      ]);
    let countQuery = db.selectFrom('users').select(sql<number>`count(*)`.as('count'));

    if (search) {
      const pattern = `%${search}%`;
      query = query.where(eb => eb.or([eb('username', 'like', pattern), eb('nickname', 'like', pattern)]));
      countQuery = countQuery.where(eb => eb.or([eb('username', 'like', pattern), eb('nickname', 'like', pattern)]));
    }
    if (role) {
      query = query.where('role', '=', role);
      countQuery = countQuery.where('role', '=', role);
    }

    const [userRows, countResult] = await Promise.all([
      query.orderBy('createdAt', 'desc').offset(offset).limit(limit).execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);
    const userIds = userRows.map(user => user.id);
    const [passkeyRows, apiKeyRows, sockets, currentRoomRows] = await Promise.all([
      userIds.length === 0
        ? Promise.resolve([])
        : db
            .selectFrom('passkeys')
            .select(['userId', sql<number>`count(*)`.as('count')])
            .where('userId', 'in', userIds)
            .groupBy('userId')
            .execute(),
      userIds.length === 0
        ? Promise.resolve([])
        : db
            .selectFrom('apiKeys')
            .select([
              'userId',
              sql<number>`count(*)`.as('count'),
              sql<string | null>`max(last_used_at)`.as('lastUsedAt'),
            ])
            .where('userId', 'in', userIds)
            .groupBy('userId')
            .execute(),
      io.fetchSockets(),
      Promise.all(userIds.map(async userId => [userId, await getUserRoom(kv, userId)] as const)),
    ]);
    const passkeyCounts = new Map(passkeyRows.map(row => [row.userId, Number(row.count)]));
    const apiKeyStats = new Map(
      apiKeyRows.map(row => [row.userId, { count: Number(row.count), lastUsedAt: row.lastUsedAt }]),
    );
    const currentRooms = new Map(currentRoomRows);
    const listedUserIds = new Set(userIds);
    const connectionCounts = new Map<string, number>();
    for (const socket of sockets) {
      const userId = socket.data.user.userId;
      if (!listedUserIds.has(userId)) continue;
      connectionCounts.set(userId, (connectionCounts.get(userId) ?? 0) + 1);
    }

    return {
      users: userRows.map(user => ({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: requireStoredUserRole(user.role),
        avatarUrl: resolveAvatar({
          id: user.id,
          avatarUrl: user.avatarUrl,
          avatarData: user.avatarData,
          updatedAt: user.updatedAt,
        }),
        hasPassword: user.passwordHash !== null,
        hasGithub: user.githubId !== null,
        passkeyCount: passkeyCounts.get(user.id) ?? 0,
        apiKeyCount: apiKeyStats.get(user.id)?.count ?? 0,
        lastApiKeyUsedAt: apiKeyStats.get(user.id)?.lastUsedAt ?? null,
        online: connectionCounts.has(user.id),
        connectionCount: connectionCounts.get(user.id) ?? 0,
        currentRoomCode: currentRooms.get(user.id) ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      })),
      total: Number(countResult.count),
      page,
      limit,
    };
  });

  fastify.patch<{
    Params: { id: string };
    Body: { role: UserRole };
  }>('/admin/users/:id/role', { preHandler }, async (request, reply) => {
    const { id } = request.params;
    const { role } = request.body;
    if (!isUserRole(role)) return reply.code(400).send({ error: '用户角色无效' });

    const target = await db.selectFrom('users').select(['id', 'role']).where('id', '=', id).executeTakeFirst();
    if (!target) return reply.code(404).send({ error: '用户不存在' });
    if (target.role === 'admin' && role !== 'admin') {
      const adminCount = await db
        .selectFrom('users')
        .select(sql<number>`count(*)`.as('count'))
        .where('role', '=', 'admin')
        .executeTakeFirstOrThrow();
      if (Number(adminCount.count) <= 1) {
        return reply.code(409).send({ error: '不能取消最后一名管理员的权限' });
      }
    }

    await db
      .updateTable('users')
      .set({ role, updatedAt: sql`datetime('now')` })
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return { success: true };
  });

  fastify.patch<{
    Params: { id: string };
    Body: { username?: string; nickname?: string };
  }>('/admin/users/:id/profile', { preHandler }, async (request, reply) => {
    const { id } = request.params;
    const { username, nickname } = request.body;
    if (!username && !nickname) return reply.code(400).send({ error: '没有需要更新的内容' });

    const updates: Record<string, unknown> = { updatedAt: sql`datetime('now')` };
    if (username) {
      const trimmed = username.trim();
      if (trimmed.length < 2 || trimmed.length > 20) {
        return reply.code(400).send({ error: '用户名长度必须为 2–20 个字符' });
      }
      const existing = await db
        .selectFrom('users')
        .select('id')
        .where('username', '=', trimmed)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (existing) return reply.code(409).send({ error: '用户名已被使用' });
      updates['username'] = trimmed;
    }
    if (nickname) {
      const trimmed = nickname.trim();
      if (trimmed.length < 1 || trimmed.length > 20) {
        return reply.code(400).send({ error: '昵称长度必须为 1–20 个字符' });
      }
      updates['nickname'] = trimmed;
    }

    const result = await db.updateTable('users').set(updates).where('id', '=', id).executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) return reply.code(404).send({ error: '用户不存在' });
    return { success: true };
  });

  fastify.get('/admin/rooms', { preHandler }, async () => ({ rooms: await loadAdminRooms(kv) }));

  fastify.delete<{ Params: { code: string } }>('/admin/rooms/:code', { preHandler }, async (request, reply) => {
    const { code } = request.params;
    const room = await getRoom(kv, code);
    if (!room) return reply.code(404).send({ error: '房间不存在' });
    if (!ctx.dissolveRoom) return reply.code(503).send({ error: '房间生命周期服务尚未就绪' });
    await ctx.dissolveRoom(code, 'host_closed');
    return { success: true };
  });

  fastify.post<{ Params: { code: string } }>('/admin/rooms/:code/cheat', { preHandler }, async (request, reply) => {
    const { code } = request.params;
    const room = await getRoom(kv, code);
    if (!room) return reply.code(404).send({ error: '房间不存在' });
    if (!ctx.dissolveRoom) return reply.code(503).send({ error: '房间生命周期服务尚未就绪' });
    await ctx.dissolveRoom(code, 'cheat_detected');
    return { success: true };
  });

  fastify.get('/admin/ai-plugins', { preHandler }, async () => aiProviderRegistry.snapshot());

  fastify.patch<{
    Params: { id: string };
    Body: { enabled?: boolean };
  }>('/admin/ai-plugins/:id', { preHandler }, async (request, reply) => {
    if (typeof request.body?.enabled !== 'boolean') {
      return reply.code(400).send({ error: '启用状态必须是布尔值' });
    }
    try {
      return await aiProviderRegistry.setCommunityPluginEnabled(request.params.id, request.body.enabled);
    } catch (error) {
      if (error instanceof AiPluginNotFoundError) return reply.code(404).send({ error: error.message });
      if (error instanceof BuiltInAiPluginMutationError) return reply.code(400).send({ error: error.message });
      throw new Error('保存 AI 插件设置失败', { cause: error });
    }
  });
}
