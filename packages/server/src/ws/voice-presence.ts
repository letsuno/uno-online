import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { SocketData } from './types';

export interface VoicePresence {
  inVoice: boolean;
  micEnabled: boolean;
  speakerMuted: boolean;
  speaking: boolean;
}

const presenceByRoom = new Map<string, Map<string, VoicePresence>>();

function getRoomPresence(roomCode: string): Map<string, VoicePresence> {
  let roomPresence = presenceByRoom.get(roomCode);
  if (!roomPresence) {
    roomPresence = new Map();
    presenceByRoom.set(roomCode, roomPresence);
  }
  return roomPresence;
}

function serialize(roomCode: string): Record<string, VoicePresence> {
  return Object.fromEntries(presenceByRoom.get(roomCode) ?? []);
}

export function emitVoicePresence(io: SocketIOServer, roomCode: string): void {
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

export function clearVoicePresence(io: SocketIOServer, roomCode: string): void {
  presenceByRoom.delete(roomCode);
  io.to(roomCode).emit('voice:presence', {});
}

function sanitizePresence(payload: Partial<VoicePresence>): VoicePresence {
  return {
    inVoice: payload.inVoice === true,
    micEnabled: payload.micEnabled === true,
    speakerMuted: payload.speakerMuted === true,
    speaking: payload.speaking === true,
  };
}

export function registerVoicePresenceEvents(socket: Socket, io: SocketIOServer): void {
  socket.on('voice:presence:get', (callback) => {
    const data = socket.data as SocketData;
    if (!data.roomCode) return callback?.({});
    callback?.(serialize(data.roomCode));
  });

  socket.on('voice:presence', (payload: Partial<VoicePresence>, callback) => {
    const data = socket.data as SocketData;
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    const presence = sanitizePresence(payload ?? {});
    if (presence.inVoice) {
      getRoomPresence(roomCode).set(data.user.userId, presence);
    } else {
      presenceByRoom.get(roomCode)?.delete(data.user.userId);
    }

    emitVoicePresence(io, roomCode);
    callback?.({ success: true });
  });
}

