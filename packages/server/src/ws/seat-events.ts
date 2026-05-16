import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import { SEAT_COUNT, SWAP_COOLDOWN_MS, SWAP_REQUEST_TIMEOUT_MS } from '@uno-online/shared';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  takeSeat,
  leaveSeat,
  swapSeats,
  removeSpectatorFromRoom,
  addSpectatorToRoom,
  touchRoomActivity,
} from '../plugins/core/room/store.js';
import type { RoomSeatPlayer, RoomSpectator } from '../plugins/core/room/store.js';
import type { SocketData } from './types.js';

// ─── In-memory state ──────────────────────────────────────────────────────────

/** Maps `roomCode:userId` → expiry timestamp */
const swapCooldowns = new Map<string, number>();

interface PendingSwapRequest {
  requesterId: string;
  requesterName: string;
  requesterSeatIndex: number;
  timer: ReturnType<typeof setTimeout>;
}

/** Maps `roomCode:targetUserId` → request data */
const pendingSwapRequests = new Map<string, PendingSwapRequest>();

// ─── Helper functions ─────────────────────────────────────────────────────────

function isOnCooldown(roomCode: string, userId: string): boolean {
  const key = `${roomCode}:${userId}`;
  const expiry = swapCooldowns.get(key);
  if (expiry === undefined) return false;
  if (Date.now() >= expiry) {
    swapCooldowns.delete(key);
    return false;
  }
  return true;
}

function setCooldown(roomCode: string, userId: string): void {
  swapCooldowns.set(`${roomCode}:${userId}`, Date.now() + SWAP_COOLDOWN_MS);
}

/** Clear all pending swap requests for a room (cancel timers). Exported. */
export function clearPendingSwapRequests(roomCode: string): void {
  const prefix = `${roomCode}:`;
  for (const [key, req] of pendingSwapRequests) {
    if (key.startsWith(prefix)) {
      clearTimeout(req.timer);
      pendingSwapRequests.delete(key);
    }
  }
}

/** Clear pending swap requests where userId is the requester. Exported. */
export function clearUserSwapRequests(roomCode: string, userId: string): void {
  const prefix = `${roomCode}:`;
  for (const [key, req] of pendingSwapRequests) {
    if (key.startsWith(prefix) && req.requesterId === userId) {
      clearTimeout(req.timer);
      pendingSwapRequests.delete(key);
    }
  }
}

async function emitSeatUpdate(io: SocketIOServer, kv: KvStore, roomCode: string): Promise<void> {
  const [seats, spectators] = await Promise.all([
    getRoomSeats(kv, roomCode),
    getRoomSpectators(kv, roomCode),
  ]);
  io.to(roomCode).emit('seat:updated', { seats, spectators });
}

// ─── Register seat event handlers ────────────────────────────────────────────

export function registerSeatEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
): void {
  const data = socket.data as SocketData;

  // ── seat:take ──────────────────────────────────────────────────────────────
  socket.on(
    'seat:take',
    async (
      payload: { seatIndex: number },
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      const roomCode = data.roomCode;
      if (!roomCode) return callback({ success: false, error: '不在房间中' });

      const room = await getRoom(redis, roomCode);
      if (!room) return callback({ success: false, error: '房间不存在' });
      if (room.status !== 'waiting') return callback({ success: false, error: '游戏进行中无法换座' });

      const { seatIndex } = payload;
      if (typeof seatIndex !== 'number' || seatIndex < 0 || seatIndex >= SEAT_COUNT) {
        return callback({ success: false, error: '无效座位编号' });
      }

      if (isOnCooldown(roomCode, data.user.userId)) {
        return callback({ success: false, error: '操作太频繁，请稍后再试' });
      }

      const [seats, spectators] = await Promise.all([
        getRoomSeats(redis, roomCode),
        getRoomSpectators(redis, roomCode),
      ]);

      if (seats[seatIndex] !== null) {
        return callback({ success: false, error: '该座位已被占用' });
      }

      const userId = data.user.userId;
      const existingSeatIndex = seats.findIndex(s => s?.userId === userId);
      const isSpectator = spectators.some(s => s.userId === userId);

      // Caller must be either a spectator or already seated
      if (existingSeatIndex === -1 && !isSpectator) {
        return callback({ success: false, error: '你不在该房间中' });
      }

      // If already seated, must be unready to move
      if (existingSeatIndex !== -1) {
        const currentSeat = seats[existingSeatIndex]!;
        if (currentSeat.ready) {
          return callback({ success: false, error: '请先取消准备再换座' });
        }
      }

      let player: RoomSeatPlayer;

      if (isSpectator) {
        // Build player from spectator data
        const spectatorData = spectators.find(s => s.userId === userId)!;
        player = {
          userId: data.user.userId,
          nickname: data.user.nickname,
          avatarUrl: spectatorData.avatarUrl ?? null,
          ready: false,
          connected: true,
          role: data.user.role,
          isBot: data.user.isBot ?? false,
        };
        await removeSpectatorFromRoom(redis, roomCode, userId);
      } else {
        // Reuse existing player data, reset ready
        const existing = seats[existingSeatIndex]!;
        player = { ...existing, ready: false };
      }

      try {
        await takeSeat(redis, roomCode, seatIndex, player);
      } catch (err) {
        return callback({ success: false, error: (err as Error).message });
      }

      setCooldown(roomCode, userId);
      await touchRoomActivity(redis, roomCode);
      await emitSeatUpdate(io, redis, roomCode);
      callback({ success: true });
    },
  );

  // ── seat:leave ─────────────────────────────────────────────────────────────
  socket.on(
    'seat:leave',
    async (
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      const roomCode = data.roomCode;
      if (!roomCode) return callback({ success: false, error: '不在房间中' });

      const room = await getRoom(redis, roomCode);
      if (!room) return callback({ success: false, error: '房间不存在' });
      if (room.status !== 'waiting') return callback({ success: false, error: '游戏进行中无法离座' });

      const userId = data.user.userId;
      const seats = await getRoomSeats(redis, roomCode);
      const seatIndex = seats.findIndex(s => s?.userId === userId);

      if (seatIndex === -1) return callback({ success: false, error: '你没有在座位上' });

      const currentSeat = seats[seatIndex]!;
      if (currentSeat.ready) return callback({ success: false, error: '请先取消准备再离座' });

      await leaveSeat(redis, roomCode, userId);

      const spectator: RoomSpectator = {
        userId: data.user.userId,
        nickname: data.user.nickname,
        avatarUrl: data.user.avatarUrl ?? null,
        role: data.user.role,
      };
      await addSpectatorToRoom(redis, roomCode, spectator);

      // Clear any pending swap requests where this user is the requester
      clearUserSwapRequests(roomCode, userId);

      await touchRoomActivity(redis, roomCode);
      await emitSeatUpdate(io, redis, roomCode);
      callback({ success: true });
    },
  );

  // ── seat:swap_request ──────────────────────────────────────────────────────
  socket.on(
    'seat:swap_request',
    async (
      payload: { targetUserId: string },
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      const roomCode = data.roomCode;
      if (!roomCode) return callback({ success: false, error: '不在房间中' });

      const room = await getRoom(redis, roomCode);
      if (!room) return callback({ success: false, error: '房间不存在' });
      if (room.status !== 'waiting') return callback({ success: false, error: '游戏进行中无法申请换座' });

      const requesterId = data.user.userId;

      if (isOnCooldown(roomCode, requesterId)) {
        return callback({ success: false, error: '操作太频繁，请稍后再试' });
      }

      const seats = await getRoomSeats(redis, roomCode);
      const requesterSeatIndex = seats.findIndex(s => s?.userId === requesterId);
      const targetSeatIndex = seats.findIndex(s => s?.userId === payload.targetUserId);

      if (requesterSeatIndex === -1) return callback({ success: false, error: '你没有在座位上' });
      if (targetSeatIndex === -1) return callback({ success: false, error: '目标玩家没有在座位上' });

      const requesterSeat = seats[requesterSeatIndex]!;
      if (requesterSeat.ready) return callback({ success: false, error: '请先取消准备再申请换座' });

      const targetSeat = seats[targetSeatIndex]!;

      // If target is a bot: immediately swap
      if (targetSeat.isBot) {
        try {
          await swapSeats(redis, roomCode, requesterId, payload.targetUserId);
        } catch (err) {
          return callback({ success: false, error: (err as Error).message });
        }
        setCooldown(roomCode, requesterId);
        await emitSeatUpdate(io, redis, roomCode);
        io.to(roomCode).emit('seat:swap_resolved', {
          accepted: true,
          requesterId,
          targetUserId: payload.targetUserId,
        });
        callback({ success: true });
        return;
      }

      // Target is a human player
      const pendingKey = `${roomCode}:${payload.targetUserId}`;
      if (pendingSwapRequests.has(pendingKey)) {
        return callback({ success: false, error: '该玩家已有待处理的换座请求' });
      }

      const timer = setTimeout(() => {
        pendingSwapRequests.delete(pendingKey);
        // Notify requester that the request timed out (auto-reject)
        io.to(roomCode).emit('seat:swap_resolved', {
          accepted: false,
          requesterId,
          targetUserId: payload.targetUserId,
          reason: 'timeout',
        });
      }, SWAP_REQUEST_TIMEOUT_MS);
      timer.unref?.();

      pendingSwapRequests.set(pendingKey, {
        requesterId,
        requesterName: data.user.nickname,
        requesterSeatIndex,
        timer,
      });

      // Notify the target player's sockets
      const targetSockets = await io.in(roomCode).fetchSockets();
      for (const s of targetSockets) {
        if ((s.data as SocketData).user.userId === payload.targetUserId) {
          s.emit('seat:swap_requested', {
            requesterId,
            requesterName: data.user.nickname,
            requesterSeatIndex,
            targetSeatIndex,
          });
        }
      }

      callback({ success: true });
    },
  );

  // ── seat:swap_respond ──────────────────────────────────────────────────────
  socket.on(
    'seat:swap_respond',
    async (
      payload: { accept: boolean },
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      const roomCode = data.roomCode;
      if (!roomCode) return callback({ success: false, error: '不在房间中' });

      const responderId = data.user.userId;
      const pendingKey = `${roomCode}:${responderId}`;
      const pending = pendingSwapRequests.get(pendingKey);

      if (!pending) return callback({ success: false, error: '没有待处理的换座请求' });

      clearTimeout(pending.timer);
      pendingSwapRequests.delete(pendingKey);

      if (!payload.accept) {
        io.to(roomCode).emit('seat:swap_resolved', {
          accepted: false,
          requesterId: pending.requesterId,
          targetUserId: responderId,
        });
        callback({ success: true });
        return;
      }

      // Accept: validate responder is unready
      const seats = await getRoomSeats(redis, roomCode);
      const responderSeatIndex = seats.findIndex(s => s?.userId === responderId);
      if (responderSeatIndex === -1) {
        io.to(roomCode).emit('seat:swap_resolved', {
          accepted: false,
          requesterId: pending.requesterId,
          targetUserId: responderId,
          reason: 'responder_left_seat',
        });
        return callback({ success: false, error: '你已不在座位上' });
      }

      const responderSeat = seats[responderSeatIndex]!;
      if (responderSeat.ready) {
        io.to(roomCode).emit('seat:swap_resolved', {
          accepted: false,
          requesterId: pending.requesterId,
          targetUserId: responderId,
          reason: 'responder_ready',
        });
        return callback({ success: false, error: '请先取消准备再同意换座' });
      }

      try {
        await swapSeats(redis, roomCode, pending.requesterId, responderId);
      } catch (err) {
        return callback({ success: false, error: (err as Error).message });
      }

      setCooldown(roomCode, pending.requesterId);
      await emitSeatUpdate(io, redis, roomCode);
      io.to(roomCode).emit('seat:swap_resolved', {
        accepted: true,
        requesterId: pending.requesterId,
        targetUserId: responderId,
      });
      callback({ success: true });
    },
  );
}
