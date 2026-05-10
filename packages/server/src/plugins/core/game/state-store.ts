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

export class GameStatePersister {
  private dirty = new Map<string, GameState>();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private kv: KvStore;

  constructor(kv: KvStore) {
    this.kv = kv;
  }

  markDirty(roomCode: string, state: GameState): void {
    this.dirty.set(roomCode, state);
    if (!this.flushTimers.has(roomCode)) {
      const timer = setTimeout(() => { void this.flush(roomCode); }, 500);
      this.flushTimers.set(roomCode, timer);
    }
  }

  async flushNow(roomCode: string): Promise<void> {
    const timer = this.flushTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(roomCode);
    }
    const state = this.dirty.get(roomCode);
    if (state) {
      this.dirty.delete(roomCode);
      await saveGameState(this.kv, roomCode, state);
    }
  }

  private async flush(roomCode: string): Promise<void> {
    this.flushTimers.delete(roomCode);
    const state = this.dirty.get(roomCode);
    if (state) {
      this.dirty.delete(roomCode);
      await saveGameState(this.kv, roomCode, state);
    }
  }

  cleanup(roomCode: string): void {
    const timer = this.flushTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(roomCode);
    }
    this.dirty.delete(roomCode);
  }
}
