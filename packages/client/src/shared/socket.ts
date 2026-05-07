import { io, Socket } from 'socket.io-client';
import { API_URL } from './env';
import { useGameStore } from '@/features/game/stores/game-store';
import { useRoomStore } from './stores/room-store';
import { useToastStore } from './stores/toast-store';
import { playSound } from './sound/sound-manager';

let socket: Socket | null = null;
let connectionStatusCallback: ((status: 'connected' | 'disconnected' | 'reconnecting') => void) | null = null;

export function onConnectionStatus(cb: (status: 'connected' | 'disconnected' | 'reconnecting') => void) {
  connectionStatusCallback = cb;
}

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('token');
    socket = io(API_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('room:updated', (data) => {
      useRoomStore.getState().updateRoom(data);
    });

    socket.on('game:state', (view) => {
      useGameStore.getState().setGameState(view);
      const settings = view.settings;
      if (settings) {
        useGameStore.getState().setTurnEndTime(Date.now() + settings.turnTimeLimit * 1000);
      }
    });

    socket.on('game:update', (view) => {
      useGameStore.getState().setGameState(view);
      const settings = view.settings;
      if (settings) {
        useGameStore.getState().setTurnEndTime(Date.now() + settings.turnTimeLimit * 1000);
      }
    });

    socket.on('game:card_drawn', (data: { card: unknown }) => {
      useGameStore.getState().setDrawnCard(data.card as any);
    });

    socket.on('game:action_rejected', (data) => {
      useToastStore.getState().addToast(data.reason || '操作无效', 'error');
      playSound('error');
    });

    socket.on('player:timeout', (data) => {
      console.log('Player timed out:', data.playerId);
    });

    socket.on('player:disconnected', (data) => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) useToastStore.getState().addToast(`${player.name} 掉线了`, 'info');
      playSound('player_leave');
    });

    socket.on('player:reconnected', (data) => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) useToastStore.getState().addToast(`${player.name} 重新连接`, 'success');
      playSound('player_join');
    });

    socket.on('connect', () => {
      connectionStatusCallback?.('connected');
    });

    socket.on('disconnect', () => {
      connectionStatusCallback?.('disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      connectionStatusCallback?.('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      connectionStatusCallback?.('disconnected');
    });

    socket.on('auth:kicked', (_data: { reason: string }) => {
      useRoomStore.getState().clearRoom();
      useGameStore.getState().clearGame();
      localStorage.removeItem('token');
      window.location.href = '/';
    });

    socket.on('room:dissolved', () => {
      useRoomStore.getState().clearRoom();
      useGameStore.getState().clearGame();
      useToastStore.getState().addToast('房间已被房主解散', 'info');
      window.location.href = '/lobby';
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
