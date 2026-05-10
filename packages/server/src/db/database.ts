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
  totalGames: Generated<number>;
  totalWins: Generated<number>;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

interface GameRecordTable {
  id: Generated<string>;
  roomCode: string;
  playerCount: number;
  winnerId: string | null;
  rounds: number;
  duration: number;
  deckHash: string | null;
  initialDeck: string | null;
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

export interface GameEventTable {
  id: Generated<number>;
  gameId: string;
  seq: number;
  eventType: string;
  payload: string;
  playerId: string | null;
  createdAt: string;
}

export interface Database {
  users: UserTable;
  gameRecords: GameRecordTable;
  gamePlayers: GamePlayerTable;
  gameEvents: GameEventTable;
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
    .addColumn('winner_id', 'text')
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

  try {
    await k.schema
      .alterTable('users')
      .addColumn('role', 'text', (c) => c.defaultTo('normal').notNull())
      .execute();
  } catch {
    // Column already exists
  }

  // Migration: make winner_id nullable for interrupted games
  try {
    const tableInfo = await sql<{ notnull: number; name: string }>`PRAGMA table_info('game_records')`.execute(k);
    const winnerCol = tableInfo.rows.find(r => r.name === 'winner_id');
    if (winnerCol && winnerCol.notnull === 1) {
      await sql`ALTER TABLE game_records RENAME TO game_records_old`.execute(k);
      await k.schema
        .createTable('game_records')
        .addColumn('id', 'text', (c) => c.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`))
        .addColumn('room_code', 'text', (c) => c.notNull())
        .addColumn('player_count', 'integer', (c) => c.notNull())
        .addColumn('winner_id', 'text')
        .addColumn('rounds', 'integer', (c) => c.notNull())
        .addColumn('duration', 'integer', (c) => c.notNull())
        .addColumn('deck_hash', 'text')
        .addColumn('initial_deck', 'text')
        .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
        .execute();
      await sql`INSERT INTO game_records SELECT id, room_code, player_count, winner_id, rounds, duration, deck_hash, initial_deck, created_at FROM game_records_old`.execute(k);
      await sql`DROP TABLE game_records_old`.execute(k);
    }
  } catch {
    // Migration already applied or table doesn't exist yet
  }
}
