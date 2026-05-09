import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket, connectSocket, onConnectionStatus } from '@/shared/socket';

export function useGameSocket(roomCode: string | undefined) {
  const phase = useGameStore((s) => s.phase);
  const setGameState = useGameStore((s) => s.setGameState);
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
        } else {
          navigate(`/room/${roomCode}`);
        }
      });
    }
  }, []);

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
