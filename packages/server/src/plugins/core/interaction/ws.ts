import type { Server as SocketIOServer, Socket } from 'socket.io';
import { ROLE_CONFIG, type UserRole } from '@uno-online/shared';

const VALID_ITEMS = ['🥚', '🍅', '🌹', '💩', '👍', '💖'];
const MIN_THROW_INTERVAL_MS = 300;

const throwTimestamps = new Map<string, number>();

export function registerInteractionEvents(socket: Socket, io: SocketIOServer) {
  socket.on('throw:item', (payload: { targetId: string; item: string }, callback?: (res: any) => void) => {
    const userId = socket.data.user?.userId;
    const roomCode = socket.data.roomCode;
    if (!userId || !roomCode) return callback?.({ success: false, error: 'Not in a room' });

    if (!VALID_ITEMS.includes(payload.item)) {
      return callback?.({ success: false, error: 'Invalid item' });
    }

    const role = (socket.data.user?.role ?? 'normal') as UserRole;
    const cooldownMs = Math.max(ROLE_CONFIG[role].cooldownMs, MIN_THROW_INTERVAL_MS);

    const lastThrow = throwTimestamps.get(userId);
    if (lastThrow && Date.now() - lastThrow < cooldownMs) {
      return callback?.({ success: false, error: '扔太快了' });
    }

    throwTimestamps.set(userId, Date.now());

    io.to(roomCode).emit('throw:item', {
      fromId: userId,
      targetId: payload.targetId,
      item: payload.item,
    });

    callback?.({ success: true });
  });
}

export function clearThrowTimestamp(userId: string) {
  throwTimestamps.delete(userId);
}
