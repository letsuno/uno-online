import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../../../db/database';

function generateApiKey(): string {
  return `uno_ak_${randomBytes(24).toString('base64url')}`;
}

export async function createApiKey(
  db: Kysely<Database>,
  userId: string,
  name: string,
): Promise<{ id: string; key: string; name: string; userId: string; createdAt: string }> {
  const key = generateApiKey();
  const row = await db
    .insertInto('apiKeys')
    .values({ userId, key, name })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { id: row.id, key: row.key, name: row.name, userId: row.userId, createdAt: row.createdAt };
}

export async function listApiKeys(
  db: Kysely<Database>,
  userId: string,
): Promise<{ id: string; name: string; keyPreview: string; createdAt: string; lastUsedAt: string | null }[]> {
  const rows = await db
    .selectFrom('apiKeys')
    .select(['id', 'name', 'key', 'createdAt', 'lastUsedAt'])
    .where('userId', '=', userId)
    .orderBy('createdAt', 'desc')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPreview: `${r.key.slice(0, 11)}...`,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
  }));
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
  const row = await db
    .selectFrom('apiKeys')
    .innerJoin('users', 'users.id', 'apiKeys.userId')
    .select(['users.id as userId', 'users.username', 'users.nickname', 'users.avatarUrl', 'users.role'])
    .where('apiKeys.key', '=', key)
    .executeTakeFirst();
  if (!row) return null;
  await db
    .updateTable('apiKeys')
    .set({ lastUsedAt: new Date().toISOString() })
    .where('key', '=', key)
    .execute();
  return row;
}
