import type { KvStore } from '../../../kv/types.js';
import type { GameState } from '@uno-online/shared';

const GAME_STATE_KEY = (roomCode: string) => `game:${roomCode}:state`;
// Must not be shorter than the room's idle lifetime (ROOM_IDLE_TIMEOUT_MS,
// default 2h) — a snapshot that expires while its room still exists leaves
// late rejoins facing a status:'playing' room with no game to restore.
const DEFAULT_GAME_STATE_TTL_S = 7200;

export async function saveGameState(
  redis: KvStore, roomCode: string, state: GameState, ttlSeconds = DEFAULT_GAME_STATE_TTL_S,
): Promise<void> {
  await redis.set(GAME_STATE_KEY(roomCode), JSON.stringify(state), ttlSeconds);
}

export async function loadGameState(redis: KvStore, roomCode: string): Promise<GameState | null> {
  const raw = await redis.get(GAME_STATE_KEY(roomCode));
  if (!raw) return null;
  return JSON.parse(raw) as GameState;
}

export async function deleteGameState(redis: KvStore, roomCode: string): Promise<void> {
  await redis.del(GAME_STATE_KEY(roomCode));
}

export class GameStatePersister {
  private dirty = new Map<string, GameState>();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Tombstones: rooms whose state was cleaned up (dissolve/back_to_room).
  // Timer callbacks already past their entry checks can still call markDirty
  // afterwards — without this, their flush resurrects game:X:state in kv
  // after deleteRoom removed it. Entries expire so reused room codes are
  // unaffected; a new game:start also revives explicitly.
  private dead = new Map<string, number>();
  private static readonly TOMBSTONE_MS = 60_000;
  private kv: KvStore;
  private ttlSeconds: number;

  constructor(kv: KvStore, ttlSeconds = DEFAULT_GAME_STATE_TTL_S) {
    this.kv = kv;
    this.ttlSeconds = ttlSeconds;
  }

  private isDead(roomCode: string): boolean {
    const at = this.dead.get(roomCode);
    if (at === undefined) return false;
    if (Date.now() - at >= GameStatePersister.TOMBSTONE_MS) {
      this.dead.delete(roomCode);
      return false;
    }
    return true;
  }

  /** A new session is starting on this room code — lift any tombstone. */
  revive(roomCode: string): void {
    this.dead.delete(roomCode);
  }

  markDirty(roomCode: string, state: GameState): void {
    if (this.isDead(roomCode)) return;
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
      await saveGameState(this.kv, roomCode, state, this.ttlSeconds);
    }
  }

  private async flush(roomCode: string): Promise<void> {
    this.flushTimers.delete(roomCode);
    const state = this.dirty.get(roomCode);
    if (state) {
      this.dirty.delete(roomCode);
      await saveGameState(this.kv, roomCode, state, this.ttlSeconds);
    }
  }

  cleanup(roomCode: string): void {
    const timer = this.flushTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(roomCode);
    }
    this.dirty.delete(roomCode);
    this.dead.set(roomCode, Date.now());
  }
}
