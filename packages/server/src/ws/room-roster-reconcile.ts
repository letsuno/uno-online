import { SEAT_COUNT, type GameState, type RoomSeatPlayer, type RoomSpectator } from '@uno-online/shared';
import type { KvStore } from '../kv/types.js';
import { getRoomSeats, getRoomSpectators, setRoomRoster, setUserRoomIfAbsent } from '../plugins/core/room/store.js';

export interface ReconciledRoomRoster {
  seats: (RoomSeatPlayer | null)[];
  spectators: RoomSpectator[];
  humanMemberIds: Set<string>;
}

export class RoomRosterCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomRosterCorruptionError';
  }
}

/**
 * Rebuild the durable active/finished roster from the game snapshot, which is
 * the commit marker for who owns cards. This is intentionally idempotent and
 * runs before any restored timer/governance can observe torn seat/spectator
 * writes left by a crash.
 */
export async function reconcileRoomRosterFromGameState(
  kv: KvStore,
  roomCode: string,
  state: GameState,
  options?: {
    forceHumansDisconnected?: boolean;
    isHumanLive?: (userId: string) => boolean;
  },
): Promise<ReconciledRoomRoster> {
  const [storedSeats, storedSpectators] = await Promise.all([
    getRoomSeats(kv, roomCode),
    getRoomSpectators(kv, roomCode),
  ]);

  const uniquePlayers = new Map(state.players.map(player => [player.id, player]));
  if (uniquePlayers.size > SEAT_COUNT) {
    throw new RoomRosterCorruptionError(`游戏快照玩家数超过座位上限: ${uniquePlayers.size}`);
  }

  const firstSeatByUser = new Map<string, { index: number; seat: RoomSeatPlayer }>();
  for (let index = 0; index < storedSeats.length; index++) {
    const seat = storedSeats[index];
    if (seat && !firstSeatByUser.has(seat.userId)) {
      firstSeatByUser.set(seat.userId, { index, seat });
    }
  }
  const firstSpectatorByUser = new Map<string, RoomSpectator>();
  for (const spectator of storedSpectators) {
    if (!firstSpectatorByUser.has(spectator.userId)) {
      firstSpectatorByUser.set(spectator.userId, spectator);
    }
  }

  const seats: (RoomSeatPlayer | null)[] = Array.from({ length: SEAT_COUNT }, () => null);
  const reservedIndexes = new Set<number>();
  for (const player of uniquePlayers.values()) {
    const existing = firstSeatByUser.get(player.id);
    if (existing && existing.index < SEAT_COUNT && !reservedIndexes.has(existing.index)) {
      reservedIndexes.add(existing.index);
    }
  }

  for (const player of uniquePlayers.values()) {
    const existing = firstSeatByUser.get(player.id);
    let seatIndex =
      existing && reservedIndexes.has(existing.index) && seats[existing.index] === null
        ? existing.index
        : seats.findIndex((seat, index) => seat === null && !reservedIndexes.has(index));
    if (seatIndex === -1) seatIndex = seats.findIndex(seat => seat === null);
    if (seatIndex === -1) throw new RoomRosterCorruptionError('游戏快照无法恢复到房间座位');

    const connected = player.isBot
      ? true
      : options?.forceHumansDisconnected
        ? false
        : options?.isHumanLive
          ? options.isHumanLive(player.id)
          : player.connected;
    seats[seatIndex] = {
      ...existing?.seat,
      userId: player.id,
      nickname: player.name,
      avatarUrl: player.avatarUrl,
      role: player.role,
      ready: false,
      connected,
      isBot: player.isBot,
      botConfig: player.botConfig,
    };
  }

  const spectatorsByUser = new Map<string, RoomSpectator>();
  for (const spectator of firstSpectatorByUser.values()) {
    if (uniquePlayers.has(spectator.userId)) continue;
    const connected = options?.forceHumansDisconnected
      ? false
      : options?.isHumanLive
        ? options.isHumanLive(spectator.userId)
        : spectator.connected;
    spectatorsByUser.set(spectator.userId, {
      ...spectator,
      connected,
    });
  }
  for (const { seat } of firstSeatByUser.values()) {
    if (seat.isBot || uniquePlayers.has(seat.userId) || spectatorsByUser.has(seat.userId)) continue;
    const connected = options?.forceHumansDisconnected
      ? false
      : options?.isHumanLive
        ? options.isHumanLive(seat.userId)
        : seat.connected;
    spectatorsByUser.set(seat.userId, {
      userId: seat.userId,
      nickname: seat.nickname,
      avatarUrl: seat.avatarUrl,
      role: seat.role,
      connected,
    });
  }

  const spectators = [...spectatorsByUser.values()];
  await setRoomRoster(kv, roomCode, seats, spectators);

  const humanMemberIds = new Set<string>([
    ...[...uniquePlayers.values()].filter(player => !player.isBot).map(player => player.id),
    ...spectators.map(spectator => spectator.userId),
  ]);
  // Restoration often runs while holding the room lifecycle lock, so taking
  // user locks here would invert the normal user -> room lock order. Commit
  // only missing reverse mappings atomically instead: a concurrent join that
  // has already claimed the user must never be overwritten by stale repair.
  await Promise.all([...humanMemberIds].map(userId => setUserRoomIfAbsent(kv, userId, roomCode)));

  return { seats, spectators, humanMemberIds };
}
