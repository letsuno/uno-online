import type { UnoSocket as Socket, UnoServer as SocketIOServer } from './types.js';
import { hasExactKeys } from './payload-validation.js';

export interface VoicePresence {
  inVoice: boolean;
  micEnabled: boolean;
  speakerMuted: boolean;
  speaking: boolean;
  forceMuted: boolean;
}

interface OwnedVoicePresence {
  presence: VoicePresence;
  socketId: string;
}

const presenceByRoom = new Map<string, Map<string, OwnedVoicePresence>>();

function getRoomPresence(roomCode: string): Map<string, OwnedVoicePresence> {
  let roomPresence = presenceByRoom.get(roomCode);
  if (!roomPresence) {
    roomPresence = new Map();
    presenceByRoom.set(roomCode, roomPresence);
  }
  return roomPresence;
}

function serialize(roomCode: string): Record<string, VoicePresence> {
  return Object.fromEntries(
    [...(presenceByRoom.get(roomCode) ?? [])].map(([userId, owned]) => [userId, owned.presence]),
  );
}

function emitVoicePresence(io: SocketIOServer, roomCode: string): void {
  io.to(roomCode).emit('voice:presence', serialize(roomCode));
}

export function removeVoicePresence(io: SocketIOServer, roomCode: string, userId: string): void {
  const roomPresence = presenceByRoom.get(roomCode);
  if (!roomPresence) return;
  roomPresence.delete(userId);
  if (roomPresence.size === 0) {
    presenceByRoom.delete(roomCode);
  }
  emitVoicePresence(io, roomCode);
}

/**
 * Disconnect cleanup must only remove presence published by that exact
 * socket. During a multi-tab takeover the replacement may already have
 * published a fresh state for the same user before the old socket's delayed
 * disconnect handler runs.
 */
export function removeVoicePresenceForSocket(
  io: SocketIOServer,
  roomCode: string,
  userId: string,
  socketId: string,
): void {
  const roomPresence = presenceByRoom.get(roomCode);
  const owned = roomPresence?.get(userId);
  if (!roomPresence || owned?.socketId !== socketId) return;
  roomPresence.delete(userId);
  if (roomPresence.size === 0) presenceByRoom.delete(roomCode);
  emitVoicePresence(io, roomCode);
}

export function clearVoicePresence(io: SocketIOServer, roomCode: string): void {
  presenceByRoom.delete(roomCode);
  io.to(roomCode).emit('voice:presence', {});
}

export function setForceMuted(io: SocketIOServer, roomCode: string, targetUserId: string, muted: boolean): void {
  const roomPresence = presenceByRoom.get(roomCode);
  if (!roomPresence) return;
  const owned = roomPresence.get(targetUserId);
  if (!owned) return;
  const existing = owned.presence;
  existing.forceMuted = muted;
  if (muted) {
    existing.micEnabled = false;
    existing.speaking = false;
  }
  emitVoicePresence(io, roomCode);
}

export function registerVoicePresenceEvents(
  socket: Socket,
  io: SocketIOServer,
  getVoiceChannelId: (roomCode: string) => Promise<number | null>,
): void {
  socket.on('voice:channel:get', async callback => {
    const data = socket.data;
    if (!data.roomCode) return callback?.({ success: true, voiceChannelId: null });
    try {
      const voiceChannelId = await getVoiceChannelId(data.roomCode);
      callback?.({ success: true, voiceChannelId });
    } catch (error) {
      console.error(`[voice] Failed to resolve channel for ${data.roomCode}:`, error);
      callback?.({ success: false, error: '语音频道获取失败，请重试' });
    }
  });

  socket.on('voice:presence:get', callback => {
    const data = socket.data;
    if (!data.roomCode) return callback?.({});
    callback?.(serialize(data.roomCode));
  });

  socket.on('voice:presence', (payload, callback) => {
    const data = socket.data;
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '不在房间中' });

    if (
      !hasExactKeys(payload, ['inVoice', 'micEnabled', 'speakerMuted', 'speaking']) ||
      typeof payload['inVoice'] !== 'boolean' ||
      typeof payload['micEnabled'] !== 'boolean' ||
      typeof payload['speakerMuted'] !== 'boolean' ||
      typeof payload['speaking'] !== 'boolean'
    ) {
      return callback?.({ success: false, error: '语音状态无效' });
    }

    if (payload.inVoice) {
      const existing = presenceByRoom.get(roomCode)?.get(data.user.userId)?.presence;
      const forceMuted = existing?.forceMuted ?? false;
      const presence: VoicePresence = {
        ...payload,
        forceMuted,
        micEnabled: forceMuted ? false : payload.micEnabled,
        speaking: forceMuted ? false : payload.speaking,
      };
      getRoomPresence(roomCode).set(data.user.userId, { presence, socketId: socket.id });
    } else {
      const roomPresence = presenceByRoom.get(roomCode);
      const existing = roomPresence?.get(data.user.userId);
      if (existing?.socketId === socket.id) {
        roomPresence?.delete(data.user.userId);
        if (roomPresence?.size === 0) presenceByRoom.delete(roomCode);
      }
    }

    emitVoicePresence(io, roomCode);
    callback?.({ success: true });
  });
}
