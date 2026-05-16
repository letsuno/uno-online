import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import { getRoom, setRoomOwner, getRoomSeats, getRoomSpectators } from '../plugins/core/room/store.js';
import type { GameSession } from '../plugins/core/game/session.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import { dissolveRoom } from './room-lifecycle.js';
import type { VoiceChannelManager } from '../voice/channel-manager.js';

const OWNER_TRANSFER_DELAY_S = 10;
const ownerTransferTimers = new Map<string, ReturnType<typeof setTimeout>>();

let _io: SocketIOServer;
let _redis: KvStore;
let _sessions: Map<string, GameSession>;
let _turnTimer: TurnTimer;
let _persister: GameStatePersister;
let _voiceChannels: VoiceChannelManager;
let _stopAutoPlayForRoom: (roomCode: string) => void;

export function configureOwnerTransfer(
  io: SocketIOServer,
  redis: KvStore,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  persister: GameStatePersister,
  voiceChannels: VoiceChannelManager,
  stopAutoPlayForRoom: (roomCode: string) => void,
): void {
  _io = io;
  _redis = redis;
  _sessions = sessions;
  _turnTimer = turnTimer;
  _persister = persister;
  _voiceChannels = voiceChannels;
  _stopAutoPlayForRoom = stopAutoPlayForRoom;
}

export function cancelOwnerTransfer(roomCode: string): void {
  const timer = ownerTransferTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    ownerTransferTimers.delete(roomCode);
  }
}

export function hasOwnerTransferPending(roomCode: string): boolean {
  return ownerTransferTimers.has(roomCode);
}

export function scheduleOwnerTransfer(roomCode: string, ownerId: string): void {
  cancelOwnerTransfer(roomCode);
  _io.to(roomCode).emit('room:owner_transfer_pending', { transferAt: Date.now() + OWNER_TRANSFER_DELAY_S * 1000 });
  const timer = setTimeout(async () => {
    ownerTransferTimers.delete(roomCode);

    const sockets = await _io.in(roomCode).fetchSockets();
    if (sockets.some(s => s.data.user?.userId === ownerId)) return;

    // Find next owner: prefer game-session connected players, fall back to
    // any connected non-bot socket (covers the waiting-room case).
    let nextOwnerId: string | undefined;
    const session = _sessions.get(roomCode);
    if (session) {
      nextOwnerId = session.getFullState().players
        .find(p => p.id !== ownerId && p.connected && !p.isBot)?.id;
    }
    if (!nextOwnerId) {
      nextOwnerId = sockets
        .find(s => s.data.user?.userId !== ownerId && !s.data.user?.isBot)
        ?.data.user?.userId;
    }

    if (!nextOwnerId) {
      _stopAutoPlayForRoom(roomCode);
      await dissolveRoom(_io, _redis, roomCode, _sessions, _turnTimer, _persister, 'empty', _voiceChannels);
      return;
    }
    await setRoomOwner(_redis, roomCode, nextOwnerId);
    const updatedRoom = await getRoom(_redis, roomCode);
    const seats = await getRoomSeats(_redis, roomCode);
    const spectators = await getRoomSpectators(_redis, roomCode);
    _io.to(roomCode).emit('seat:updated', { seats, spectators });
    _io.to(roomCode).emit('room:updated', { room: updatedRoom });
  }, OWNER_TRANSFER_DELAY_S * 1000);
  timer.unref?.();
  ownerTransferTimers.set(roomCode, timer);
}

export async function checkOwnerDisconnectedAtTerminal(roomCode: string, session: GameSession): Promise<void> {
  const room = await getRoom(_redis, roomCode);
  if (!room) return;
  const state = session.getFullState();
  const owner = state.players.find(p => p.id === room.ownerId);
  if (owner && !owner.connected) {
    scheduleOwnerTransfer(roomCode, room.ownerId);
  }
}
