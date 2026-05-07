import { sql } from 'kysely';
import { getDb } from './database.js';

interface GitHubUserData {
  githubId: string;
  username: string;
  avatarUrl: string | null;
}

export function resolveAvatar(user: { id: string; avatarData?: string | null; avatarUrl?: string | null; updatedAt?: string }): string | null {
  if (user.avatarData) return `/api/avatar/${user.id}?v=${encodeURIComponent(user.updatedAt ?? '')}`;
  return user.avatarUrl ?? null;
}

export async function findOrCreateUser(data: GitHubUserData) {
  const db = getDb();
  const existing = await db
    .selectFrom('users')
    .selectAll()
    .where('githubId', '=', data.githubId)
    .executeTakeFirst();

  if (existing) {
    // Only update avatarUrl (from GitHub), not username/nickname (user-controlled)
    await db
      .updateTable('users')
      .set({ avatarUrl: data.avatarUrl, updatedAt: sql`datetime('now')` })
      .where('githubId', '=', data.githubId)
      .execute();
    return { ...existing, avatarUrl: data.avatarUrl, isNewUser: false };
  }

  const inserted = await db
    .insertInto('users')
    .values({
      githubId: data.githubId,
      username: data.username,
      nickname: data.username,
      avatarUrl: data.avatarUrl,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { ...inserted, isNewUser: true };
}

export async function findUserByUsername(username: string) {
  const db = getDb();
  return db
    .selectFrom('users')
    .selectAll()
    .where('username', '=', username)
    .executeTakeFirst() ?? null;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const db = getDb();
  const row = await db
    .selectFrom('users')
    .select('id')
    .where('username', '=', username)
    .executeTakeFirst();
  return !!row;
}

export async function createLocalUser(data: { username: string; nickname: string; passwordHash: string; avatarData?: string | null }) {
  const db = getDb();
  const userCount = await db.selectFrom('users').select(sql<number>`count(*)`.as('count')).executeTakeFirstOrThrow();
  const role = userCount.count === 0 ? 'admin' : 'normal';
  return db
    .insertInto('users')
    .values({
      username: data.username,
      nickname: data.nickname,
      passwordHash: data.passwordHash,
      avatarData: data.avatarData ?? null,
      role,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function setPassword(userId: string, passwordHash: string) {
  const db = getDb();
  await db
    .updateTable('users')
    .set({ passwordHash, updatedAt: sql`datetime('now')` })
    .where('id', '=', userId)
    .execute();
}

export async function updateNickname(userId: string, nickname: string) {
  const db = getDb();
  await db
    .updateTable('users')
    .set({ nickname, updatedAt: sql`datetime('now')` })
    .where('id', '=', userId)
    .execute();
}

export async function updateAvatar(userId: string, avatarData: string | null) {
  const db = getDb();
  await db
    .updateTable('users')
    .set({ avatarData, updatedAt: sql`datetime('now')` })
    .where('id', '=', userId)
    .execute();
}

export async function bindGithub(userId: string, githubId: string, avatarUrl: string | null) {
  const db = getDb();
  await db
    .updateTable('users')
    .set({ githubId, avatarUrl, updatedAt: sql`datetime('now')` })
    .where('id', '=', userId)
    .execute();
}

export async function updateUsername(userId: string, username: string) {
  const db = getDb();
  await db
    .updateTable('users')
    .set({ username, updatedAt: sql`datetime('now')` })
    .where('id', '=', userId)
    .execute();
}

export async function getUserById(id: string) {
  const db = getDb();
  return db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst() ?? null;
}

export async function getUserProfile(userId: string) {
  const db = getDb();
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) return null;

  const recentGames = await db
    .selectFrom('gamePlayers')
    .innerJoin('gameRecords', 'gameRecords.id', 'gamePlayers.gameId')
    .select([
      'gamePlayers.id',
      'gamePlayers.gameId',
      'gamePlayers.userId',
      'gamePlayers.finalScore',
      'gamePlayers.placement',
      'gamePlayers.createdAt',
      'gameRecords.id as gameRecordId',
      'gameRecords.roomCode',
      'gameRecords.playerCount',
      'gameRecords.winnerId',
      'gameRecords.rounds',
      'gameRecords.duration',
      'gameRecords.createdAt as gameCreatedAt',
    ])
    .where('gamePlayers.userId', '=', userId)
    .orderBy('gamePlayers.createdAt', 'desc')
    .limit(20)
    .execute();

  const shaped = recentGames.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    userId: r.userId,
    finalScore: r.finalScore,
    placement: r.placement,
    createdAt: r.createdAt,
    game: {
      id: r.gameRecordId,
      roomCode: r.roomCode,
      playerCount: r.playerCount,
      winnerId: r.winnerId,
      rounds: r.rounds,
      duration: r.duration,
      createdAt: r.gameCreatedAt,
    },
  }));

  return { user, recentGames: shaped };
}

export async function recordGameResult(
  roomCode: string,
  winnerId: string,
  rounds: number,
  duration: number,
  playerResults: { userId: string; finalScore: number; placement: number }[],
): Promise<string> {
  const db = getDb();

  const record = await db.transaction().execute(async (tx) => {
    const record = await tx
      .insertInto('gameRecords')
      .values({
        roomCode,
        playerCount: playerResults.length,
        winnerId,
        rounds,
        duration,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    for (const p of playerResults) {
      await tx
        .insertInto('gamePlayers')
        .values({
          gameId: record.id,
          userId: p.userId,
          finalScore: p.finalScore,
          placement: p.placement,
        })
        .execute();

      const updateBuilder = tx
        .updateTable('users')
        .set({ totalGames: sql`total_games + 1`, updatedAt: sql`datetime('now')` })
        .where('id', '=', p.userId);

      if (p.userId === winnerId) {
        await tx
          .updateTable('users')
          .set({
            totalGames: sql`total_games + 1`,
            totalWins: sql`total_wins + 1`,
            updatedAt: sql`datetime('now')`,
          })
          .where('id', '=', p.userId)
          .execute();
      } else {
        await updateBuilder.execute();
      }
    }

    return record;
  });
  return record.id;
}
