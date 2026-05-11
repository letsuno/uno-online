import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CamelCasePlugin, Kysely, sql, SqliteDialect } from 'kysely';
import { DatabaseSync } from 'node:sqlite';
import type { Database } from '../../src/db/database';
import { createApiKey, listApiKeys, deleteApiKey, verifyApiKey } from '../../src/plugins/core/api-key/repo';

let db: Kysely<Database>;

beforeAll(async () => {
  const sqlite = new DatabaseSync(':memory:');
  db = new Kysely<Database>({
    dialect: new SqliteDialect({
      database: {
        prepare(sqlStr: string) {
          const raw = sqlite.prepare(sqlStr);
          const rawSql = raw.sourceSQL.toLowerCase().trimStart();
          return {
            all(parameters: readonly unknown[]) { return raw.all(...parameters as never[]); },
            run(parameters: readonly unknown[]) { return raw.run(...parameters as never[]); },
            iterate(parameters: readonly unknown[]) { return raw.iterate(...parameters as never[]); },
            reader: rawSql.startsWith('select') || rawSql.startsWith('pragma') || rawSql.startsWith('with') || rawSql.includes(' returning '),
          };
        },
        close() { sqlite.close(); },
      },
    }),
    plugins: [new CamelCasePlugin()],
  });

  // Create tables
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('username', 'text', (c) => c.unique().notNull())
    .addColumn('nickname', 'text', (c) => c.notNull())
    .addColumn('avatar_url', 'text')
    .addColumn('role', 'text', (c) => c.defaultTo('normal').notNull())
    .execute();

  await db.schema
    .createTable('api_keys')
    .addColumn('id', 'text', (c) => c.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`))
    .addColumn('user_id', 'text', (c) => c.notNull())
    .addColumn('key', 'text', (c) => c.unique().notNull())
    .addColumn('key_preview', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .addColumn('last_used_at', 'text')
    .execute();

  // Seed a test user
  await db.insertInto('users').values({ id: 'user-1', username: 'alice', nickname: 'Alice', role: 'normal' }).execute();
  await db.insertInto('users').values({ id: 'user-2', username: 'bob', nickname: 'Bob', role: 'normal' }).execute();
});

afterAll(async () => {
  await db.destroy();
});

describe('ApiKey repo', () => {
  it('creates an API key and returns the full key', async () => {
    const result = await createApiKey(db, 'user-1', 'My Claude');
    expect(result.key).toMatch(/^uno_ak_/);
    expect(result.key.length).toBeGreaterThan(20);
    expect(result.name).toBe('My Claude');
    expect(result.userId).toBe('user-1');
  });

  it('lists keys with masked values', async () => {
    const keys = await listApiKeys(db, 'user-1');
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys[0]!.keyPreview).toMatch(/^uno_ak_.{4}\.\.\.$/);
  });

  it('verifies a valid key and returns user info', async () => {
    const created = await createApiKey(db, 'user-2', 'Test');
    const user = await verifyApiKey(db, created.key);
    expect(user).not.toBeNull();
    expect(user!.userId).toBe('user-2');
    expect(user!.username).toBe('bob');
    expect(user!.nickname).toBe('Bob');
  });

  it('returns null for invalid key', async () => {
    const user = await verifyApiKey(db, 'uno_ak_invalid');
    expect(user).toBeNull();
  });

  it('deletes a key', async () => {
    const created = await createApiKey(db, 'user-1', 'ToDelete');
    const deleted = await deleteApiKey(db, created.id, 'user-1');
    expect(deleted).toBe(true);
    const user = await verifyApiKey(db, created.key);
    expect(user).toBeNull();
  });

  it('refuses to delete another user key', async () => {
    const created = await createApiKey(db, 'user-1', 'NotYours');
    const deleted = await deleteApiKey(db, created.id, 'user-999');
    expect(deleted).toBe(false);
  });

  it('stores hashed key, not plaintext', async () => {
    const created = await createApiKey(db, 'user-2', 'HashCheck');
    const rows = await db.selectFrom('apiKeys').select('key').where('id', '=', created.id).execute();
    expect(rows[0]!.key).not.toContain('uno_ak_');
    expect(rows[0]!.key).toHaveLength(64);
  });

  it('enforces max keys per user', async () => {
    await db.insertInto('users').values({ id: 'user-max', username: 'max', nickname: 'Max', role: 'normal' }).execute();
    for (let i = 0; i < 10; i++) {
      await createApiKey(db, 'user-max', `key-${i}`);
    }
    await expect(createApiKey(db, 'user-max', 'overflow')).rejects.toThrow('最多创建');
  });
});
