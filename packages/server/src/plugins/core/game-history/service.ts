import type { Kysely } from 'kysely';
import type { Database } from '../../../db/database.js';
import type { GameEvent, GameEventType } from '@uno-online/shared';

export async function saveGameEvents(
  db: Kysely<Database>,
  gameId: string,
  events: GameEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await db.insertInto('gameEvents').values(
    events.map((e) => ({
      gameId,
      seq: e.seq,
      eventType: e.eventType,
      payload: JSON.stringify(e.payload),
      playerId: e.playerId,
      createdAt: e.createdAt,
    })),
  ).execute();
}

export async function saveDeckInfo(
  db: Kysely<Database>,
  gameId: string,
  deckHash: string,
  initialDeck: string,
): Promise<void> {
  await db.updateTable('gameRecords')
    .set({ deckHash, initialDeck })
    .where('id', '=', gameId)
    .execute();
}

export async function getGamesList(
  db: Kysely<Database>,
  page: number,
  limit: number,
): Promise<{ games: GameListItem[]; total: number }> {
  const offset = (page - 1) * limit;

  const totalResult = await db.selectFrom('gameRecords')
    .select(db.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();

  const records = await db.selectFrom('gameRecords')
    .selectAll()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  if (records.length === 0) {
    return { games: [], total: totalResult.count };
  }

  const gameIds = records.map(r => r.id);
  const allPlayers = await db.selectFrom('gamePlayers')
    .innerJoin('users', 'users.id', 'gamePlayers.userId')
    .select([
      'gamePlayers.gameId',
      'gamePlayers.userId',
      'users.nickname',
      'gamePlayers.placement',
      'gamePlayers.finalScore',
    ])
    .where('gamePlayers.gameId', 'in', gameIds)
    .orderBy('gamePlayers.placement', 'asc')
    .execute();

  const playersByGame = new Map<string, typeof allPlayers>();
  for (const p of allPlayers) {
    const list = playersByGame.get(p.gameId) ?? [];
    list.push(p);
    playersByGame.set(p.gameId, list);
  }

  const games: GameListItem[] = records.map(rec => {
    const players = playersByGame.get(rec.id) ?? [];
    const winner = players.find(p => p.userId === rec.winnerId);
    return {
      id: rec.id,
      roomCode: rec.roomCode,
      players: players.map(p => ({
        userId: p.userId,
        nickname: p.nickname,
        placement: p.placement,
        finalScore: p.finalScore,
      })),
      winnerId: rec.winnerId,
      winnerName: winner?.nickname ?? '',
      playerCount: rec.playerCount,
      rounds: rec.rounds,
      duration: rec.duration,
      deckHash: rec.deckHash ?? '',
      createdAt: rec.createdAt,
    };
  });

  return { games, total: totalResult.count };
}

export async function getGameDetail(
  db: Kysely<Database>,
  gameId: string,
): Promise<GameDetailResult | null> {
  const record = await db.selectFrom('gameRecords')
    .selectAll()
    .where('id', '=', gameId)
    .executeTakeFirst();

  if (!record) return null;

  const players = await db.selectFrom('gamePlayers')
    .innerJoin('users', 'users.id', 'gamePlayers.userId')
    .select([
      'gamePlayers.userId',
      'users.nickname',
      'gamePlayers.placement',
      'gamePlayers.finalScore',
    ])
    .where('gamePlayers.gameId', '=', gameId)
    .orderBy('gamePlayers.placement', 'asc')
    .execute();

  const events = await db.selectFrom('gameEvents')
    .selectAll()
    .where('gameId', '=', gameId)
    .orderBy('seq', 'asc')
    .execute();

  const winner = players.find(p => p.userId === record.winnerId);

  return {
    id: record.id,
    roomCode: record.roomCode,
    players: players.map(p => ({
      userId: p.userId,
      nickname: p.nickname,
      placement: p.placement,
      finalScore: p.finalScore,
    })),
    winnerId: record.winnerId,
    winnerName: winner?.nickname ?? '',
    playerCount: record.playerCount,
    rounds: record.rounds,
    duration: record.duration,
    deckHash: record.deckHash ?? '',
    createdAt: record.createdAt,
    events: events.map(e => ({
      seq: e.seq,
      eventType: e.eventType as GameEventType,
      payload: JSON.parse(e.payload),
      playerId: e.playerId,
      createdAt: e.createdAt,
    })),
    initialDeck: record.initialDeck ?? null,
  };
}

export interface GameListItem {
  id: string;
  roomCode: string;
  players: { userId: string; nickname: string; placement: number; finalScore: number }[];
  winnerId: string | null;
  winnerName: string;
  playerCount: number;
  rounds: number;
  duration: number;
  deckHash: string;
  createdAt: string;
}

export interface GameDetailResult extends GameListItem {
  events: GameEvent[];
  initialDeck: string | null;
}
