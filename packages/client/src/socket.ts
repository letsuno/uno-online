import { io, Socket } from 'socket.io-client';
import { API_URL } from './env.js';
import { useGameStore } from './stores/game-store.js';
import { useRoomStore } from './stores/room-store.js';
import { playSound } from './sound/sound-manager.js';

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
      console.warn('Action rejected:', data);
    });

    socket.on('player:timeout', (data) => {
      console.log('Player timed out:', data.playerId);
    });

    socket.on('player:disconnected', (data) => {
      console.log('Player disconnected:', data.playerId);
      playSound('player_leave');
    });

    socket.on('player:reconnected', (data) => {
      console.log('Player reconnected:', data.playerId);
      playSound('player_join');
    });

    socket.on('connect', () => {
      connectionStatusCallback?.('connected');
      const roomCode = useRoomStore.getState().roomCode;
      if (roomCode) {
        socket!.emit('room:rejoin', roomCode, (res: any) => {
          if (res.success && res.gameState) {
            useGameStore.getState().setGameState(res.gameState);
          }
        });
      }
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

    socket.on('auth:kicked', (data: { reason: string }) => {
      alert(data.reason);
      window.location.href = '/';
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
