import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { useChatStore } from '../stores/chat-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket, connectSocket, onConnectionStatus, refreshVoicePresence } from '@/shared/socket';

export function useGameSocket(roomCode: string | undefined) {
  const phase = useGameStore((s) => s.phase);
  const setGameState = useGameStore((s) => s.setGameState);
  const setChatHistory = useChatStore((s) => s.setHistory);
  const addChatMessage = useChatStore((s) => s.addMessage);
  const clearChatMessages = useChatStore((s) => s.clearMessages);
  const setSpectators = useSpectatorStore((s) => s.setSpectators);
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

    const onSpectatorList = (data: { spectators?: string[] }) => { if (data.spectators) setSpectators(data.spectators); };
    const onSpectatorJoined = (data: { spectators?: string[] }) => { if (data.spectators) setSpectators(data.spectators); };
    const onSpectatorLeft = (data: { spectators?: string[]; nickname?: string }) => {
      if (data.spectators) setSpectators(data.spectators);
      else if (data.nickname) useSpectatorStore.getState().removeSpectator(data.nickname);
    };
    socket.on('room:spectator_list', onSpectatorList);
    socket.on('room:spectator_joined', onSpectatorJoined);
    socket.on('room:spectator_left', onSpectatorLeft);

    return () => {
      socket.off('chat:history', setChatHistory);
      socket.off('chat:message', addChatMessage);
      socket.off('chat:cleared', clearChatMessages);
      socket.off('room:spectator_list', onSpectatorList);
      socket.off('room:spectator_joined', onSpectatorJoined);
      socket.off('room:spectator_left', onSpectatorLeft);
    };
  }, [setChatHistory, addChatMessage, clearChatMessages, setSpectators]);

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
