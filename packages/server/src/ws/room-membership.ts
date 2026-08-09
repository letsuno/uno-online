import type { UnoServer as SocketIOServer } from './types.js';
import type { KvStore } from '../kv/types.js';
import type { GameSession } from '../plugins/core/game/session.js';
import { getRoomSeats, getRoomSpectators, getSeatedPlayers } from '../plugins/core/room/store.js';
import { getDepartedMemberIds } from './room-departure.js';

/**
 * Human membership spans the game session and both persisted room rosters.
 * Terminal transitions can temporarily keep a person in more than one of
 * those representations, so consumers must use their union.
 */
export async function getHumanRoomMemberIds(
  kv: KvStore,
  roomCode: string,
  session?: GameSession,
): Promise<Set<string>> {
  const [seats, spectators] = await Promise.all([getRoomSeats(kv, roomCode), getRoomSpectators(kv, roomCode)]);
  return new Set([
    ...getSeatedPlayers(seats)
      .filter(player => !player.isBot)
      .map(player => player.userId),
    ...spectators.map(spectator => spectator.userId),
    ...(session
      ?.getFullState()
      .players.filter(player => !player.isBot)
      .map(player => player.id) ?? []),
  ]);
}

/** A socket only counts as a live human when it belongs to the room roster. */
export async function getLiveHumanRoomMemberIds(
  io: SocketIOServer,
  kv: KvStore,
  roomCode: string,
  session?: GameSession,
): Promise<Set<string>> {
  const [members, sockets, departedMemberIds] = await Promise.all([
    getHumanRoomMemberIds(kv, roomCode, session),
    io.in(roomCode).fetchSockets(),
    getDepartedMemberIds(kv, roomCode),
  ]);
  const live = new Set<string>();
  for (const socket of sockets) {
    const userId = socket.data.user.userId;
    if (socket.data.roomCode === roomCode && members.has(userId) && !departedMemberIds.has(userId)) live.add(userId);
  }
  return live;
}
