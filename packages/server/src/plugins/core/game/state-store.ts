import type { KvStore } from '../../../kv/types.js';
import type { GameState } from '@uno-online/shared';

const GAME_STATE_KEY = (roomCode: string) => `game:${roomCode}:state`;
const GAME_STATE_TTL = 3600;

export async function saveGameState(redis: KvStore, roomCode: string, state: GameState): Promise<void> {
  await redis.set(GAME_STATE_KEY(roomCode), JSON.stringify(state), GAME_STATE_TTL);
}

export async function loadGameState(redis: KvStore, roomCode: string): Promise<GameState | null> {
  const raw = await redis.get(GAME_STATE_KEY(roomCode));
  if (!raw) return null;
  return JSON.parse(raw) as GameState;
}

export async function deleteGameState(redis: KvStore, roomCode: string): Promise<void> {
  await redis.del(GAME_STATE_KEY(roomCode));
}

