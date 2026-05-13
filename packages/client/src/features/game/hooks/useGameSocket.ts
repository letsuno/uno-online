import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { useChatStore } from '../stores/chat-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket, connectSocket, onConnectionStatus, refreshVoicePresence } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';

export function useGameSocket(roomCode: string | undefined) {
  const phase = useGameStore((s) => s.phase);
  const setGameState = useGameStore((s) => s.setGameState);
  const setChatHistory = useChatStore((s) => s.setHistory);
  const addChatMessage = useChatStore((s) => s.addMessage);
  const clearChatMessages = useChatStore((s) => s.clearMessages);
  const setRoom = useRoomStore((s) => s.setRoom);
  const navigate = useNavigate();
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'disconnected' | 'reconnecting'
  >('connected');

  // Initial connect + rejoin if no phase
  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    if (!phase && roomCode) {
      socket.emit('room:rejoin', roomCode, (res: any) => {
        if (res.success && res.gameState) {
          if (roomCode && res.players && res.room) {
            setRoom(roomCode, res.players, res.room);
          }
          if (res.isSpectator) {
            useGameStore.getState().setSpectator(true);
          }
          setGameState(res.gameState);
          refreshVoicePresence();
        } else {
          navigate(`/room/${roomCode}`);
        }
      });
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.on('chat:history', setChatHistory);
    socket.on('chat:message', addChatMessage);
    socket.on('chat:cleared', clearChatMessages);

    const onSpectatorQueue = (data: { queue: string[]; nickname: string; joined: boolean }) => {
      useSpectatorStore.getState().setPendingJoinQueue(data.queue);
      if (data.nickname) {
        useToastStore.getState().addToast(
          data.joined ? `${data.nickname} 将在下一轮加入游戏` : `${data.nickname} 取消了加入`,
          'info',
        );
      }
    };
    socket.on('game:spectator_queue', onSpectatorQueue);

    return () => {
      socket.off('chat:history', setChatHistory);
      socket.off('chat:message', addChatMessage);
      socket.off('chat:cleared', clearChatMessages);
      socket.off('game:spectator_queue', onSpectatorQueue);
    };
  }, [setChatHistory, addChatMessage, clearChatMessages]);

  // Reconnection status tracking + auto-rejoin on reconnect
  useEffect(() => {
    onConnectionStatus((status) => {
      setConnectionStatus(status);
      if (status === 'connected' && roomCode) {
        const socket = getSocket();
        socket.emit('room:rejoin', roomCode, (res: any) => {
          if (res.success && res.gameState) {
            if (res.players && res.room) {
              setRoom(roomCode, res.players, res.room);
            }
            if (res.isSpectator) {
              useGameStore.getState().setSpectator(true);
            }
            setGameState(res.gameState);
            refreshVoicePresence();
          }
        });
      }
    });
    return () => onConnectionStatus(() => {});
  }, [roomCode, setGameState, setRoom]);

  // Warn before page unload during active game
  useEffect(() => {
    if (!phase || phase === 'game_over') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  return connectionStatus;
}
