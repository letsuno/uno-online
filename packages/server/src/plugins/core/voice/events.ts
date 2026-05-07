import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { DtlsParameters, MediaKind, RtpCapabilities, RtpParameters } from 'mediasoup/types';
import { RoomVoice } from './room-voice';
import type { TokenPayload } from '../../../auth/jwt';

interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
}

const roomVoices = new Map<string, RoomVoice>();

function getOrCreateRoomVoice(roomCode: string): RoomVoice {
  let rv = roomVoices.get(roomCode);
  if (!rv) {
    rv = new RoomVoice();
    roomVoices.set(roomCode, rv);
  }
  return rv;
}

export function cleanupRoomVoice(roomCode: string): void {
  const rv = roomVoices.get(roomCode);
  if (rv) {
    rv.close();
    roomVoices.delete(roomCode);
  }
}

export async function removeVoicePeer(roomCode: string, peerId: string, io: SocketIOServer): Promise<void> {
  const rv = roomVoices.get(roomCode);
  if (!rv) return;
  if (!rv.hasPeer(peerId)) return;
  await rv.removePeer(peerId);
  io.to(roomCode).emit('voice:peer_left', { peerId });
  if (rv.getPeerCount() === 0) {
    roomVoices.delete(roomCode);
  }
}

export function registerVoiceEvents(socket: Socket, io: SocketIOServer) {
  const data = socket.data as SocketData;

  socket.on('voice:join', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });

    const rv = getOrCreateRoomVoice(roomCode);

    try {
      await rv.ensureRouter();
      const rtpCapabilities = rv.getRouterRtpCapabilities();
      const { sendTransportOptions, recvTransportOptions } = await rv.createTransports(data.user.userId);

      io.to(roomCode).emit('voice:peer_joined', { peerId: data.user.userId });

      callback?.({
        success: true,
        rtpCapabilities,
        sendTransportOptions,
        recvTransportOptions,
      });
    } catch (err) {
      console.error('voice:join error:', err);
      callback?.({ success: false, error: 'Failed to join voice' });
    }
  });

  socket.on('voice:connect-transport', async (
    payload: { transportType: 'send' | 'recv'; dtlsParameters: DtlsParameters },
    callback,
  ) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    const rv = roomVoices.get(roomCode);
    if (!rv) return callback?.({ success: false });

    try {
      await rv.connectTransport(data.user.userId, payload.transportType, payload.dtlsParameters);
      callback?.({ success: true });
    } catch (err) {
      console.error('voice:connect-transport error:', err);
      callback?.({ success: false });
    }
  });

  socket.on('voice:produce', async (
    payload: { kind: MediaKind; rtpParameters: RtpParameters },
    callback,
  ) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    const rv = roomVoices.get(roomCode);
    if (!rv) return callback?.({ success: false });

    try {
      const producerId = await rv.produce(data.user.userId, payload.kind, payload.rtpParameters);
      const existingProducers = rv.getProducerPeerIds().filter((id) => id !== data.user.userId);
      callback?.({ success: true, producerId, existingProducers });
    } catch (err) {
      console.error('voice:produce error:', err);
      callback?.({ success: false });
    }
  });

  socket.on('voice:consume', async (
    payload: { producerPeerId: string; rtpCapabilities: RtpCapabilities },
    callback,
  ) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });

    const rv = roomVoices.get(roomCode);
    if (!rv) return callback?.({ success: false });

    try {
      const consumerData = await rv.consume(
        data.user.userId,
        payload.producerPeerId,
        payload.rtpCapabilities,
      );
      if (!consumerData) return callback?.({ success: false });
      callback?.({ success: true, ...consumerData });
    } catch (err) {
      console.error('voice:consume error:', err);
      callback?.({ success: false });
    }
  });

  socket.on('voice:leave', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });
    await removeVoicePeer(roomCode, data.user.userId, io);
    callback?.({ success: true });
  });
}
