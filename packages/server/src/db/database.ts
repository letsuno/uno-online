import { CamelCasePlugin, type Generated, Kysely, sql, SqliteDialect } from 'kysely';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

// ── Types ──
// CamelCasePlugin: use camelCase here, plugin converts to snake_case in SQL

interface UserTable {
  id: Generated<string>;
  githubId: string;
  username: string;
  avatarUrl: string | null;
  totalGames: Generated<number>;
  totalWins: Generated<number>;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

interface GameRecordTable {
  id: Generated<string>;
  roomCode: string;
  playerCount: number;
  winnerId: string;
  rounds: number;
  duration: number;
  createdAt: Generated<string>;
}

interface GamePlayerTable {
  id: Generated<string>;
  gameId: string;
  userId: string;
  finalScore: number;
  placement: number;
  createdAt: Generated<string>;
}

export interface Database {
  users: UserTable;
  gameRecords: GameRecordTable;
  gamePlayers: GamePlayerTable;
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
    .addColumn('github_id', 'text', (c) => c.unique().notNull())
    .addColumn('username', 'text', (c) => c.notNull())
    .addColumn('avatar_url', 'text')
    .addColumn('total_games', 'integer', (c) => c.defaultTo(0).notNull())
    .addColumn('total_wins', 'integer', (c) => c.defaultTo(0).notNull())
    .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .addColumn('updated_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  await k.schema
    .createTable('game_records')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`))
    .addColumn('room_code', 'text', (c) => c.notNull())
    .addColumn('player_count', 'integer', (c) => c.notNull())
    .addColumn('winner_id', 'text', (c) => c.notNull())
    .addColumn('rounds', 'integer', (c) => c.notNull())
    .addColumn('duration', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  await k.schema
    .createTable('game_players')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`))
    .addColumn('game_id', 'text', (c) => c.references('game_records.id').notNull())
    .addColumn('user_id', 'text', (c) => c.references('users.id').notNull())
    .addColumn('final_score', 'integer', (c) => c.notNull())
    .addColumn('placement', 'integer', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  await k.schema
    .createIndex('idx_game_players_game_id')
    .ifNotExists()
    .on('game_players')
    .column('game_id')
    .execute();

  await k.schema
    .createIndex('idx_game_players_user_id')
    .ifNotExists()
    .on('game_players')
    .column('user_id')
    .execute();
}
