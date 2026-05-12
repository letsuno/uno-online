import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '../../../db/database.js';

const MAX_KEYS_PER_USER = 10;

function generateApiKey(): string {
  return `uno_ak_${randomBytes(24).toString('base64url')}`;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export async function createApiKey(
  db: Kysely<Database>,
  userId: string,
  name: string,
): Promise<{ id: string; key: string; name: string; userId: string; createdAt: string }> {
  const count = await db
    .selectFrom('apiKeys')
    .select(db.fn.countAll().as('count'))
    .where('userId', '=', userId)
    .executeTakeFirstOrThrow();
  if (Number(count.count) >= MAX_KEYS_PER_USER) {
    throw new Error(`最多创建 ${MAX_KEYS_PER_USER} 个 API Key`);
  }
  const raw = generateApiKey();
  const keyHash = hashKey(raw);
  const keyPreview = `${raw.slice(0, 11)}...`;
  const row = await db
    .insertInto('apiKeys')
    .values({ userId, key: keyHash, keyPreview, name })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { id: row.id, key: raw, name: row.name, userId: row.userId, createdAt: row.createdAt };
}

export async function listApiKeys(
  db: Kysely<Database>,
  userId: string,
): Promise<{ id: string; name: string; keyPreview: string; createdAt: string; lastUsedAt: string | null }[]> {
  return db
    .selectFrom('apiKeys')
    .select(['id', 'name', 'keyPreview', 'createdAt', 'lastUsedAt'])
    .where('userId', '=', userId)
    .orderBy('createdAt', 'desc')
    .execute();
}

export async function deleteApiKey(
  db: Kysely<Database>,
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom('apiKeys')
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirst();
  return (result.numDeletedRows ?? 0n) > 0n;
}

export async function verifyApiKey(
  db: Kysely<Database>,
  key: string,
): Promise<{ userId: string; username: string; nickname: string; avatarUrl: string | null; role: string } | null> {
  const keyHash = hashKey(key);
  const row = await db
    .selectFrom('apiKeys')
    .innerJoin('users', 'users.id', 'apiKeys.userId')
    .select(['users.id as userId', 'users.username', 'users.nickname', 'users.avatarUrl', 'users.role'])
    .where('apiKeys.key', '=', keyHash)
    .executeTakeFirst();
  if (!row) return null;
  await db
    .updateTable('apiKeys')
    .set({ lastUsedAt: sql`datetime('now')` })
    .where('key', '=', keyHash)
    .execute();
  return row;
}
