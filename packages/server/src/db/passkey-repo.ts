import { getDb } from './database.js';

export interface PasskeyRecord {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: number;
  transports: string | null;
  name: string;
  createdAt: string;
}

export async function getPasskeysByUserId(userId: string): Promise<PasskeyRecord[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('passkeys')
    .select(['id', 'userId', 'publicKey', 'counter', 'deviceType', 'backedUp', 'transports', 'name', 'createdAt'])
    .where('userId', '=', userId)
    .execute();
  return rows as PasskeyRecord[];
}

export async function getPasskeyById(id: string): Promise<PasskeyRecord | null> {
  const db = getDb();
  const row = await db
    .selectFrom('passkeys')
    .select(['id', 'userId', 'publicKey', 'counter', 'deviceType', 'backedUp', 'transports', 'name', 'createdAt'])
    .where('id', '=', id)
    .executeTakeFirst();
  return (row as PasskeyRecord) ?? null;
}

export async function createPasskey(data: {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string[] | undefined;
  name: string;
}): Promise<PasskeyRecord> {
  const db = getDb();
  const row = await db
    .insertInto('passkeys')
    .values({
      id: data.id,
      userId: data.userId,
      publicKey: data.publicKey,
      counter: data.counter,
      deviceType: data.deviceType,
      backedUp: data.backedUp ? 1 : 0,
      transports: data.transports ? JSON.stringify(data.transports) : null,
      name: data.name,
    })
    .returning(['id', 'userId', 'publicKey', 'counter', 'deviceType', 'backedUp', 'transports', 'name', 'createdAt'])
    .executeTakeFirstOrThrow();
  return row as PasskeyRecord;
}

export async function updatePasskeyCounter(id: string, counter: number): Promise<void> {
  const db = getDb();
  await db
    .updateTable('passkeys')
    .set({ counter })
    .where('id', '=', id)
    .execute();
}

export async function deletePasskey(id: string, userId: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .deleteFrom('passkeys')
    .where('id', '=', id)
    .where('userId', '=', userId)
    .executeTakeFirst();
  return (result.numDeletedRows ?? 0n) > 0n;
}
