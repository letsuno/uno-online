import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../../../db/database';

export async function migrate(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('game_events')
    .ifNotExists()
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('game_id', 'text', (c) => c.notNull())
    .addColumn('seq', 'integer', (c) => c.notNull())
    .addColumn('event_type', 'text', (c) => c.notNull())
    .addColumn('payload', 'text', (c) => c.notNull())
    .addColumn('player_id', 'text')
    .addColumn('created_at', 'text', (c) => c.defaultTo(sql`(datetime('now'))`).notNull())
    .execute();

  await db.schema
    .createIndex('idx_game_events_game_seq')
    .ifNotExists()
    .on('game_events')
    .columns(['game_id', 'seq'])
    .execute();

  try {
    await db.schema.alterTable('game_records').addColumn('deck_hash', 'text').execute();
  } catch { /* column already exists */ }

  try {
    await db.schema.alterTable('game_records').addColumn('initial_deck', 'text').execute();
  } catch { /* column already exists */ }
}
