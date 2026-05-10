import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../../../kv/types';
import type { SocketData } from '../../../ws/types';
import { deleteRoom, getRoom } from '../room/store';
import type { GameSession } from '../game/session';
import { loadGameState } from '../game/state-store';

export function setupSpectateHandlers(
  io: SocketIOServer,
  kv: KvStore,
  sessions: Map<string, GameSession>,
): void {
  io.on('connection', (socket) => {
    socket.on('room:spectate', async (roomCode: string, callback?: (res: Record<string, unknown>) => void) => {
      const data = socket.data as SocketData;
      if (!data.user) {
        callback?.({ success: false, error: '未登录' });
        return;
      }

      const room = await getRoom(kv, roomCode);
      if (!room) {
        callback?.({ success: false, error: '房间不存在' });
        return;
      }
      if (room.status !== 'playing') {
        callback?.({ success: false, error: '游戏未开始' });
        return;
      }
      if (!room.settings.allowSpectators) {
        callback?.({ success: false, error: '该房间不允许观战' });
        return;
      }

      let session = sessions.get(roomCode);
      if (!session) {
        const savedState = await loadGameState(kv, roomCode);
        if (!savedState) {
          await deleteRoom(kv, roomCode);
          callback?.({ success: false, error: '游戏会话不存在' });
          return;
        }
        session = GameSession.fromState(savedState);
        sessions.set(roomCode, session);
      }

      data.roomCode = roomCode;
      data.isSpectator = true;
      await socket.join(roomCode);

      const view = session.getSpectatorView(room.settings.spectatorMode);
      socket.emit('game:state', view);
      socket.emit('chat:history', session.getChatHistory());

      socket.to(roomCode).emit('room:spectator_joined', {
        nickname: data.user.nickname,
      });

      callback?.({ success: true });
    });

    socket.on('disconnect', () => {
      const data = socket.data as SocketData;
      if (data.isSpectator && data.roomCode) {
        socket.to(data.roomCode).emit('room:spectator_left', {
          nickname: data.user?.nickname,
        });
      }
    });
  });
}
