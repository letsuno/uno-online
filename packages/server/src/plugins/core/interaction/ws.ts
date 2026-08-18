import type { UnoServer as SocketIOServer, UnoSocket as Socket } from '../../../ws/types.js';
import { ROLE_CONFIG } from '@uno-online/shared';
import { hasExactKeys, isNonEmptyString } from '../../../ws/payload-validation.js';

const VALID_ITEMS = ['🥚', '🍅', '🌹', '💩', '🐷', '👍', '💖'];
const MIN_THROW_INTERVAL_MS = 300;

const throwTimestamps = new Map<string, number>();

export function registerInteractionEvents(socket: Socket, io: SocketIOServer) {
  socket.on('throw:item', (payload, callback) => {
    if (
      !hasExactKeys(payload, ['targetId', 'item']) ||
      !isNonEmptyString(payload['targetId']) ||
      typeof payload['item'] !== 'string' ||
      !VALID_ITEMS.includes(payload['item'])
    ) {
      return callback?.({ success: false, error: '互动请求无效' });
    }
    const userId = socket.data.user.userId;
    const roomCode = socket.data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });

    const role = socket.data.user.role;
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
