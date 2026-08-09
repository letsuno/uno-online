import type { KvStore } from '../../../kv/types.js';
import { isBotConfig, isCurrentRoomSettings, isUserRole } from '@uno-online/shared';
import type { LiveGameState } from './session.js';
import { clearNextRoundExclusions, getNextRoundExclusions, restoreNextRoundExclusions } from './lifecycle-state.js';
import {
  clearPendingSpectatorJoinState,
  getPendingSpectatorJoinSnapshot,
  restorePendingSpectatorJoins,
  type PendingSpectatorJoin,
} from './spectator-queue-state.js';

const GAME_STATE_KEY = (roomCode: string) => `game:${roomCode}:state`;
// Must not be shorter than the room's idle lifetime (ROOM_IDLE_TIMEOUT_MS,
// default 2h) — a snapshot that expires while its room still exists leaves
// late rejoins facing a status:'playing' room with no game to restore.
const DEFAULT_GAME_STATE_TTL_S = 7200;

interface PersistedGameSnapshot {
  gameState: LiveGameState;
  lifecycle: {
    excludedFromNextRound: string[];
    pendingSpectatorJoins: PendingSpectatorJoin[];
  };
}

function createSnapshot(roomCode: string, state: LiveGameState): PersistedGameSnapshot {
  return {
    gameState: state,
    lifecycle: {
      excludedFromNextRound: getNextRoundExclusions(roomCode),
      pendingSpectatorJoins: getPendingSpectatorJoinSnapshot(roomCode),
    },
  };
}

async function saveSnapshot(
  redis: KvStore,
  roomCode: string,
  snapshot: PersistedGameSnapshot,
  ttlSeconds: number,
): Promise<void> {
  await redis.set(GAME_STATE_KEY(roomCode), JSON.stringify(snapshot), ttlSeconds);
}

export async function saveGameState(
  redis: KvStore,
  roomCode: string,
  state: LiveGameState,
  ttlSeconds = DEFAULT_GAME_STATE_TTL_S,
): Promise<void> {
  await saveSnapshot(redis, roomCode, createSnapshot(roomCode, state), ttlSeconds);
}

interface LoadedGameSnapshot {
  gameState: LiveGameState;
  excludedFromNextRound: string[];
  pendingSpectatorJoins: PendingSpectatorJoin[];
}

/**
 * The persisted value exists, but cannot represent a resumable game. Keep
 * this separate from ordinary KV failures so lifecycle callers can safely
 * dissolve deterministic corruption while preserving rooms on transient IO.
 */
export class GameStateCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameStateCorruptionError';
  }
}

const GAME_PHASES = new Set([
  'waiting',
  'dealing',
  'playing',
  'choosing_color',
  'challenging',
  'choosing_swap_target',
  'round_end',
  'game_over',
]);
const GAME_DIRECTIONS = new Set(['clockwise', 'counter_clockwise']);
const CARD_COLORS = new Set(['red', 'blue', 'green', 'yellow']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireCurrentRoomSettings(value: unknown): void {
  if (!isCurrentRoomSettings(value)) {
    throw new GameStateCorruptionError('Persisted game state has invalid settings');
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function requireCommittedGameAction(value: unknown): void {
  if (!isRecord(value) || typeof value['type'] !== 'string') {
    throw new GameStateCorruptionError('Persisted game state has an invalid lastAction');
  }

  const hasPlayerId = isNonEmptyString(value['playerId']);
  let valid = false;
  switch (value['type']) {
    case 'PLAY_CARD':
      valid =
        hasPlayerId &&
        isNonEmptyString(value['cardId']) &&
        (value['chosenColor'] === undefined ||
          (typeof value['chosenColor'] === 'string' && CARD_COLORS.has(value['chosenColor']))) &&
        (value['isJumpIn'] === undefined || typeof value['isJumpIn'] === 'boolean');
      break;
    case 'DRAW_CARD':
      valid = hasPlayerId && (value['side'] === 'left' || value['side'] === 'right');
      break;
    case 'PASS':
    case 'CALL_UNO':
      valid = hasPlayerId;
      break;
    case 'CATCH_UNO':
      valid =
        isNonEmptyString(value['catcherId']) &&
        isNonEmptyString(value['targetId']) &&
        isNonEmptyString(value['catcherName']);
      break;
    case 'CHALLENGE':
      valid =
        hasPlayerId &&
        typeof value['succeeded'] === 'boolean' &&
        isNonEmptyString(value['penaltyPlayerId']) &&
        isPositiveInteger(value['penaltyCount']);
      break;
    case 'ACCEPT':
      valid = hasPlayerId && isNonEmptyString(value['penaltyPlayerId']) && isPositiveInteger(value['penaltyCount']);
      break;
    case 'CHOOSE_COLOR':
      valid = hasPlayerId && typeof value['color'] === 'string' && CARD_COLORS.has(value['color']);
      break;
    case 'CHOOSE_SWAP_TARGET':
      valid = hasPlayerId && isNonEmptyString(value['targetId']);
      break;
  }

  if (!valid) {
    throw new GameStateCorruptionError('Persisted game state has an invalid lastAction');
  }
}

/**
 * Validate the current persisted GameState shape before constructing a live
 * session. Detailed card and rule invariants remain the game engine's job.
 */
function requirePersistedGameState(value: unknown): LiveGameState {
  if (!isRecord(value)) {
    throw new GameStateCorruptionError('Persisted game state must be an object');
  }
  if (typeof value['phase'] !== 'string' || !GAME_PHASES.has(value['phase'])) {
    throw new GameStateCorruptionError('Persisted game state has an invalid phase');
  }
  if (!Array.isArray(value['players'])) {
    throw new GameStateCorruptionError('Persisted game state is missing players');
  }
  const playerIds = new Set<string>();
  for (const player of value['players']) {
    if (
      !isRecord(player) ||
      typeof player['id'] !== 'string' ||
      player['id'].length === 0 ||
      typeof player['name'] !== 'string' ||
      player['name'].length === 0 ||
      !Array.isArray(player['hand']) ||
      typeof player['score'] !== 'number' ||
      !Number.isFinite(player['score']) ||
      typeof player['roundWins'] !== 'number' ||
      !Number.isInteger(player['roundWins']) ||
      typeof player['connected'] !== 'boolean' ||
      typeof player['autopilot'] !== 'boolean' ||
      typeof player['calledUno'] !== 'boolean' ||
      typeof player['unoCaught'] !== 'boolean' ||
      typeof player['eliminated'] !== 'boolean' ||
      (player['teamId'] !== undefined &&
        (typeof player['teamId'] !== 'number' || !Number.isInteger(player['teamId']))) ||
      (player['avatarUrl'] !== null && typeof player['avatarUrl'] !== 'string') ||
      !isUserRole(player['role']) ||
      typeof player['isBot'] !== 'boolean' ||
      (player['isBot'] ? !isBotConfig(player['botConfig']) : player['botConfig'] !== undefined) ||
      playerIds.has(player['id'])
    ) {
      throw new GameStateCorruptionError('Persisted game state contains an invalid player');
    }
    playerIds.add(player['id']);
  }

  for (const field of ['deckLeft', 'deckRight', 'discardPile'] as const) {
    if (!Array.isArray(value[field])) {
      throw new GameStateCorruptionError(`Persisted game state has invalid ${field}`);
    }
  }
  for (const field of [
    'currentPlayerIndex',
    'deckLeftInitialCount',
    'deckRightInitialCount',
    'drawStack',
    'pendingPenaltyDraws',
    'pendingRevengeDraws',
    'roundNumber',
    'gameStartedAt',
    'turnStartedAt',
  ] as const) {
    if (typeof value[field] !== 'number' || !Number.isInteger(value[field])) {
      throw new GameStateCorruptionError(`Persisted game state has invalid ${field}`);
    }
  }
  if (typeof value['direction'] !== 'string' || !GAME_DIRECTIONS.has(value['direction'])) {
    throw new GameStateCorruptionError('Persisted game state has an invalid direction');
  }
  if (
    value['currentColor'] !== null &&
    (typeof value['currentColor'] !== 'string' || !CARD_COLORS.has(value['currentColor']))
  ) {
    throw new GameStateCorruptionError('Persisted game state has an invalid currentColor');
  }
  if (value['pendingDrawPlayerId'] !== null && typeof value['pendingDrawPlayerId'] !== 'string') {
    throw new GameStateCorruptionError('Persisted game state has an invalid pendingDrawPlayerId');
  }
  if (
    value['pendingPenaltyNextPlayerIndex'] !== null &&
    (typeof value['pendingPenaltyNextPlayerIndex'] !== 'number' ||
      !Number.isInteger(value['pendingPenaltyNextPlayerIndex']))
  ) {
    throw new GameStateCorruptionError('Persisted game state has an invalid pendingPenaltyNextPlayerIndex');
  }
  if (value['pendingPenaltySourcePlayerId'] !== null && typeof value['pendingPenaltySourcePlayerId'] !== 'string') {
    throw new GameStateCorruptionError('Persisted game state has an invalid pendingPenaltySourcePlayerId');
  }
  if (
    !Array.isArray(value['pendingPenaltyQueue']) ||
    value['pendingPenaltyQueue'].some(
      entry =>
        !isRecord(entry) ||
        typeof entry['playerId'] !== 'string' ||
        entry['playerId'].length === 0 ||
        typeof entry['count'] !== 'number' ||
        !Number.isInteger(entry['count']) ||
        typeof entry['nextPlayerIndex'] !== 'number' ||
        !Number.isInteger(entry['nextPlayerIndex']) ||
        (entry['sourcePlayerId'] !== null && typeof entry['sourcePlayerId'] !== 'string'),
    )
  ) {
    throw new GameStateCorruptionError('Persisted game state has an invalid pendingPenaltyQueue');
  }
  if (value['winnerId'] !== null && typeof value['winnerId'] !== 'string') {
    throw new GameStateCorruptionError('Persisted game state has an invalid winnerId');
  }
  if (value['lastAction'] !== null) requireCommittedGameAction(value['lastAction']);
  if (typeof value['deckHash'] !== 'string') {
    throw new GameStateCorruptionError('Persisted game state has an invalid deckHash');
  }
  if (
    !Array.isArray(value['chatHistory']) ||
    value['chatHistory'].some(
      message =>
        !isRecord(message) ||
        !isNonEmptyString(message['id']) ||
        !isNonEmptyString(message['userId']) ||
        !isNonEmptyString(message['nickname']) ||
        !isNonEmptyString(message['text']) ||
        typeof message['timestamp'] !== 'number' ||
        !Number.isSafeInteger(message['timestamp']) ||
        !isUserRole(message['role']) ||
        typeof message['isSpectator'] !== 'boolean',
    )
  ) {
    throw new GameStateCorruptionError('Persisted game state has an invalid chatHistory');
  }
  requireCurrentRoomSettings(value['settings']);
  return value as unknown as LiveGameState;
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some(entry => typeof entry !== 'string' || entry.length === 0) ||
    new Set(value).size !== value.length
  ) {
    throw new GameStateCorruptionError(`Persisted game state has an invalid ${fieldName}`);
  }
  return value;
}

function requirePendingSpectatorJoins(value: unknown): PendingSpectatorJoin[] {
  if (!Array.isArray(value)) {
    throw new GameStateCorruptionError('Persisted game state has an invalid pendingSpectatorJoins lifecycle field');
  }
  const userIds = new Set<string>();
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry['userId'] !== 'string' ||
      entry['userId'].length === 0 ||
      typeof entry['nickname'] !== 'string' ||
      entry['nickname'].length === 0 ||
      (entry['avatarUrl'] !== null && typeof entry['avatarUrl'] !== 'string') ||
      !isUserRole(entry['role']) ||
      typeof entry['isBot'] !== 'boolean' ||
      userIds.has(entry['userId'])
    ) {
      throw new GameStateCorruptionError('Persisted game state contains an invalid pending spectator join');
    }
    userIds.add(entry['userId']);
  }
  return value as PendingSpectatorJoin[];
}

function requireCurrentSnapshot(value: unknown): PersistedGameSnapshot {
  if (!isRecord(value)) {
    throw new GameStateCorruptionError('Persisted game state is not a snapshot object');
  }
  if (!isRecord(value['lifecycle'])) {
    throw new GameStateCorruptionError('Persisted game state is missing lifecycle metadata');
  }

  const lifecycle = value['lifecycle'];
  return {
    gameState: requirePersistedGameState(value['gameState']),
    lifecycle: {
      excludedFromNextRound: requireStringArray(
        lifecycle['excludedFromNextRound'],
        'excludedFromNextRound lifecycle field',
      ),
      pendingSpectatorJoins: requirePendingSpectatorJoins(lifecycle['pendingSpectatorJoins']),
    },
  };
}

async function readGameSnapshot(redis: KvStore, roomCode: string): Promise<LoadedGameSnapshot | null> {
  const raw = await redis.get(GAME_STATE_KEY(roomCode));
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new GameStateCorruptionError('Persisted game state is not valid JSON');
  }
  const snapshot = requireCurrentSnapshot(parsed);
  return {
    gameState: snapshot.gameState,
    excludedFromNextRound: snapshot.lifecycle.excludedFromNextRound,
    pendingSpectatorJoins: snapshot.lifecycle.pendingSpectatorJoins,
  };
}

/** Read-only projection used by room listings and spectator HTTP routes. */
export async function loadGameState(redis: KvStore, roomCode: string): Promise<LiveGameState | null> {
  return (await readGameSnapshot(redis, roomCode))?.gameState ?? null;
}

/**
 * Restore a live session after process loss, including its lifecycle metadata.
 * Ordinary snapshot readers must use loadGameState so stale disk reads cannot
 * overwrite newer in-memory exclusions.
 */
export async function loadGameStateForRestore(redis: KvStore, roomCode: string): Promise<LiveGameState | null> {
  const snapshot = await readGameSnapshot(redis, roomCode);
  restoreNextRoundExclusions(roomCode, snapshot?.excludedFromNextRound ?? []);
  restorePendingSpectatorJoins(roomCode, snapshot?.pendingSpectatorJoins ?? []);
  return snapshot?.gameState ?? null;
}

export async function deleteGameState(redis: KvStore, roomCode: string): Promise<void> {
  await redis.del(GAME_STATE_KEY(roomCode));
  clearNextRoundExclusions(roomCode);
  clearPendingSpectatorJoinState(roomCode);
}

export class GameStatePersister {
  private static readonly FLUSH_DEBOUNCE_MS = 500;
  private static readonly FLUSH_RETRY_MAX_MS = 30_000;
  private dirty = new Map<string, PersistedGameSnapshot>();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private writes = new Map<string, Promise<void>>();
  private failedFlushCounts = new Map<string, number>();
  private flushAllPromise: Promise<void> | null = null;
  // Tombstones: rooms whose state was cleaned up (dissolve/back_to_room).
  // Timer callbacks already past their entry checks can still call markDirty
  // afterwards — without this, their flush resurrects game:X:state in kv
  // after deleteRoom removed it. Entries expire so reused room codes are
  // unaffected; a new game:start also revives explicitly.
  private dead = new Map<string, { expiresAt: number }>();
  private static readonly TOMBSTONE_MS = 60_000;
  private kv: KvStore;
  private ttlSeconds: number;

  constructor(kv: KvStore, ttlSeconds = DEFAULT_GAME_STATE_TTL_S) {
    this.kv = kv;
    this.ttlSeconds = ttlSeconds;
  }

  private isDead(roomCode: string): boolean {
    const tombstone = this.dead.get(roomCode);
    if (!tombstone) return false;
    if (Date.now() >= tombstone.expiresAt) {
      this.dead.delete(roomCode);
      return false;
    }
    return true;
  }

  /** A new session is starting on this room code — lift any tombstone. */
  revive(roomCode: string): void {
    this.dead.delete(roomCode);
  }

  private scheduleFlush(roomCode: string): void {
    if (this.flushAllPromise || this.isDead(roomCode) || this.flushTimers.has(roomCode) || !this.dirty.has(roomCode))
      return;
    const failedFlushCount = this.failedFlushCounts.get(roomCode) ?? 0;
    const delayMs =
      failedFlushCount === 0
        ? GameStatePersister.FLUSH_DEBOUNCE_MS
        : Math.min(GameStatePersister.FLUSH_DEBOUNCE_MS * 2 ** failedFlushCount, GameStatePersister.FLUSH_RETRY_MAX_MS);
    const timer = setTimeout(() => {
      if (this.flushTimers.get(roomCode) !== timer) return;
      void this.flush(roomCode).catch((error: unknown) => {
        // flush restores the failed snapshot and schedules another attempt.
        // Catch here so a transient KV failure never becomes an unhandled
        // rejection from the debounce callback.
        console.error(`[gameState] Deferred flush failed for ${roomCode}:`, error);
      });
    }, delayMs);
    timer.unref?.();
    this.flushTimers.set(roomCode, timer);
  }

  private restoreFailedSnapshot(roomCode: string, snapshot: PersistedGameSnapshot): void {
    if (this.isDead(roomCode)) return;
    this.failedFlushCounts.set(roomCode, (this.failedFlushCounts.get(roomCode) ?? 0) + 1);
    // A mutation recorded or dequeued into the write chain while this write
    // was in flight is newer and must win. Checking only `dirty` is not
    // enough: the debounce may already have removed the newer snapshot from
    // that map and queued it behind this failed write.
    if (!this.dirty.has(roomCode) && !this.writes.has(roomCode)) {
      this.dirty.set(roomCode, snapshot);
    }
    this.scheduleFlush(roomCode);
  }

  markDirty(roomCode: string, state: LiveGameState): void {
    if (this.isDead(roomCode)) return;
    // Capture game and lifecycle metadata together. Reading exclusions later,
    // when a debounce timer fires, could pair an old round with a new round's
    // moderation state.
    this.dirty.set(roomCode, createSnapshot(roomCode, state));
    this.scheduleFlush(roomCode);
  }

  async flushNow(roomCode: string): Promise<void> {
    const timer = this.flushTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(roomCode);
    }
    const snapshot = this.dirty.get(roomCode);
    if (snapshot) {
      this.dirty.delete(roomCode);
      try {
        await this.enqueueWrite(roomCode, snapshot);
      } catch (error) {
        this.restoreFailedSnapshot(roomCode, snapshot);
        throw error;
      }
    } else {
      await (this.writes.get(roomCode) ?? Promise.resolve());
    }
  }

  /** Persist every latest snapshot and wait for writes already in flight. */
  flushAll(): Promise<void> {
    if (this.flushAllPromise) return this.flushAllPromise;

    for (const timer of this.flushTimers.values()) clearTimeout(timer);
    this.flushTimers.clear();

    const drain = (async () => {
      while (this.dirty.size > 0 || this.writes.size > 0) {
        const roomCodes = new Set([...this.dirty.keys(), ...this.writes.keys()]);
        const results = await Promise.allSettled([...roomCodes].map(roomCode => this.flushNow(roomCode)));
        const errors = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map(result => result.reason);
        if (errors.length > 0) {
          throw new AggregateError(errors, 'Failed to flush all game snapshots');
        }
      }
    })();

    this.flushAllPromise = drain.finally(() => {
      this.flushAllPromise = null;
      for (const roomCode of this.dirty.keys()) this.scheduleFlush(roomCode);
    });
    return this.flushAllPromise;
  }

  private async flush(roomCode: string): Promise<void> {
    this.flushTimers.delete(roomCode);
    const snapshot = this.dirty.get(roomCode);
    if (snapshot) {
      this.dirty.delete(roomCode);
      try {
        await this.enqueueWrite(roomCode, snapshot);
      } catch (error) {
        this.restoreFailedSnapshot(roomCode, snapshot);
        throw error;
      }
    }
  }

  private async enqueueWrite(roomCode: string, snapshot: PersistedGameSnapshot): Promise<void> {
    const previous = this.writes.get(roomCode) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(async () => {
        if (this.isDead(roomCode)) return;
        await saveSnapshot(this.kv, roomCode, snapshot, this.ttlSeconds);
        this.failedFlushCounts.delete(roomCode);
      });
    this.writes.set(roomCode, write);
    try {
      await write;
    } finally {
      if (this.writes.get(roomCode) === write) {
        this.writes.delete(roomCode);
      }
    }
  }

  /**
   * Tombstone the room and wait for any snapshot write already in flight.
   * Callers must await this barrier before deleting the persisted game key.
   */
  async cleanup(roomCode: string): Promise<void> {
    const timer = this.flushTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(roomCode);
    }
    this.dirty.delete(roomCode);
    this.failedFlushCounts.delete(roomCode);
    const tombstone = { expiresAt: Date.now() + GameStatePersister.TOMBSTONE_MS };
    this.dead.set(roomCode, tombstone);
    const expiryTimer = setTimeout(() => {
      if (this.dead.get(roomCode) === tombstone) this.dead.delete(roomCode);
    }, GameStatePersister.TOMBSTONE_MS);
    expiryTimer.unref?.();
    await (this.writes.get(roomCode) ?? Promise.resolve()).catch(() => undefined);
  }
}
