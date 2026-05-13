import { CamelCasePlugin, type Generated, Kysely, sql, SqliteDialect } from 'kysely';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

// ── Types ──
// CamelCasePlugin: use camelCase here, plugin converts to snake_case in SQL

interface UserTable {
  id: Generated<string>;
  githubId: string | null;
  username: string;
  nickname: string;
  passwordHash: string | null;
  avatarUrl: string | null;
  avatarData: string | null;
  role: Generated<string>;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

interface ApiKeyTable {
  id: Generated<string>;
  userId: string;
  key: string;
  keyPreview: string;
  name: string;
  createdAt: Generated<string>;
  lastUsedAt: string | null;
}

export interface Database {
  users: UserTable;
  apiKeys: ApiKeyTable;
}

// ── Init ──

function createDb(dbPath: string): Kysely<Database> {
  const sqlite = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  sqlite.exec('PRAGMA busy_timeout = 5000');

  return new Kysely<Database>({
    dialect: new SqliteDialect({
      database: {
        prepare(sqlStr: string) {
          const raw = sqlite.prepare(sqlStr);
          const rawSql = raw.sourceSQL.toLowerCase().trimStart();
          const toParams = (params: readonly unknown[]) =>
            params.map(p => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
          return {
            all(parameters: readonly unknown[]) {
              return raw.all(...toParams(parameters) as SQLInputValue[]);
            },
            run(parameters: readonly unknown[]) {
              return raw.run(...toParams(parameters) as SQLInputValue[]);
            },
            iterate(parameters: readonly unknown[]) {
              return raw.iterate(...toParams(parameters) as SQLInputValue[]);
            },
            reader:
              rawSql.startsWith('select')
              || rawSql.startsWith('pragma')
              || rawSql.startsWith('with')
              || rawSql.startsWith('values')
              || rawSql.includes(' returning '),
          };
        },
        close() {
          sqlite.close();
        },
      },
    }),
    plugins: [new CamelCasePlugin()],
  });
}

let db: Kysely<Database> | null = null;

export function getDb(): Kysely<Database> {
  if (!db) {
    const dbPath = process.env['DATABASE_PATH'] ?? 'uno.db';
    db = createDb(dbPath);
  }
  return db;
}

export async function destroyDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}

/** Run migrations to create tables if they don't exist */
export async function migrateDb(): Promise<void> {
  const k = getDb();
  await k.schema
    .createTable('users')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`))
    .addColumn('github_id', 'text', (c) => c.unique())
    .addColumn('username', 'text', (c) => c.unique().notNull())
    .addColumn('nickname', 'text', (c) => c.notNull())
    .addColumn('password_hash', 'text')
    .addColumn('avatar_url', 'text')
    .addColumn('avatar_data', 'text')
    .addColumn('role', 'text', (c) => c.defaultTo('normal').notNull())
    .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .addColumn('updated_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  try {
    await k.schema
      .alterTable('users')
      .addColumn('role', 'text', (c) => c.defaultTo('normal').notNull())
      .execute();
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (!msg.includes('duplicate column name')) {
      throw err;
    }
  }

  await k.schema
    .createTable('api_keys')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`))
    .addColumn('user_id', 'text', (c) => c.references('users.id').onDelete('cascade').notNull())
    .addColumn('key', 'text', (c) => c.unique().notNull())
    .addColumn('key_preview', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .addColumn('last_used_at', 'text')
    .execute();

  await k.schema
    .createIndex('idx_api_keys_user_id')
    .ifNotExists()
    .on('api_keys')
    .column('user_id')
    .execute();
}
