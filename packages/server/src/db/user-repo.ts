import { sql } from 'kysely';
import { getDb } from './database.js';

export interface GitHubUserData {
  githubId: string;
  username: string;
  avatarUrl: string | null;
}

export async function findOrCreateUser(data: GitHubUserData) {
  const db = getDb();
  // Try update first, then insert if no rows affected
  const existing = await db
    .selectFrom('users')
    .selectAll()
    .where('githubId', '=', data.githubId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('users')
      .set({ username: data.username, avatarUrl: data.avatarUrl, updatedAt: sql`datetime('now')` })
      .where('githubId', '=', data.githubId)
      .execute();
    return { ...existing, username: data.username, avatarUrl: data.avatarUrl };
  }

  const inserted = await db
    .insertInto('users')
    .values({
      githubId: data.githubId,
      username: data.username,
      avatarUrl: data.avatarUrl,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return inserted;
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

  // Shape to match previous Prisma format: { ...gamePlayer, game: { ...gameRecord } }
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
) {
  const db = getDb();

  await db.transaction().execute(async (tx) => {
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
}
