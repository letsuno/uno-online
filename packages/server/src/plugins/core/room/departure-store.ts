import type { KvStore } from '../../../kv/types.js';

export function departureKey(roomCode: string): string {
  return `room:${roomCode}:departed`;
}

export class RoomDepartureCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomDepartureCorruptionError';
  }
}

export async function getDepartedMemberIds(kv: KvStore, roomCode: string): Promise<Set<string>> {
  const raw = await kv.get(departureKey(roomCode));
  if (raw === null) return new Set();

  let ids: unknown;
  try {
    ids = JSON.parse(raw) as unknown;
  } catch {
    throw new RoomDepartureCorruptionError(`Room ${roomCode} departed-member state is not valid JSON`);
  }
  if (
    !Array.isArray(ids) ||
    ids.some(id => typeof id !== 'string' || id.length === 0) ||
    new Set(ids).size !== ids.length
  ) {
    throw new RoomDepartureCorruptionError(`Room ${roomCode} departed-member state is not a current string array`);
  }
  return new Set(ids);
}
