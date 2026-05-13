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

const userPublicFields = [
  'id', 'username', 'nickname', 'avatarUrl', 'avatarData', 'role',
  'createdAt', 'updatedAt', 'githubId',
] as const;

export async function findOrCreateUser(data: GitHubUserData) {
  const db = getDb();
  const existing = await db
    .selectFrom('users')
    .select([...userPublicFields])
    .where('githubId', '=', data.githubId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('users')
      .set({ avatarUrl: data.avatarUrl, updatedAt: sql`datetime('now')` })
      .where('githubId', '=', data.githubId)
      .execute();
    return { ...existing, avatarUrl: data.avatarUrl, isNewUser: false };
  }

  const userCount = await db.selectFrom('users').select(sql<number>`count(*)`.as('count')).executeTakeFirstOrThrow();
  const role = userCount.count === 0 ? 'admin' : 'normal';

  const inserted = await db
    .insertInto('users')
    .values({
      githubId: data.githubId,
      username: data.username,
      nickname: data.username,
      avatarUrl: data.avatarUrl,
      role,
    })
    .returning([...userPublicFields])
    .executeTakeFirstOrThrow();

  return { ...inserted, isNewUser: true };
}

// passwordHash included: callers verify credentials against it
export async function findUserByUsername(username: string) {
  const db = getDb();
  return db
    .selectFrom('users')
    .select([...userPublicFields, 'passwordHash'])
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
    .returning([...userPublicFields])
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
    .select([...userPublicFields])
    .where('id', '=', id)
    .executeTakeFirst() ?? null;
}

export async function getUserProfile(userId: string) {
  const db = getDb();
  const user = await db
    .selectFrom('users')
    .select([...userPublicFields])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) return null;
  return { user };
}

