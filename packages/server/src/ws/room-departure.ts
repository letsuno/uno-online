import type { KvStore } from '../kv/types.js';
import { departureKey, getDepartedMemberIds } from '../plugins/core/room/departure-store.js';

export { getDepartedMemberIds } from '../plugins/core/room/departure-store.js';

export async function markMemberDeparted(kv: KvStore, roomCode: string, userId: string): Promise<void> {
  const ids = await getDepartedMemberIds(kv, roomCode);
  ids.add(userId);
  await kv.set(departureKey(roomCode), JSON.stringify([...ids]));
}

export async function clearMemberDeparted(kv: KvStore, roomCode: string, userId: string): Promise<void> {
  const ids = await getDepartedMemberIds(kv, roomCode);
  if (!ids.delete(userId)) return;
  if (ids.size === 0) {
    await kv.del(departureKey(roomCode));
  } else {
    await kv.set(departureKey(roomCode), JSON.stringify([...ids]));
  }
}
