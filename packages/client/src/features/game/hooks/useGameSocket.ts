import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { useChatStore } from '../stores/chat-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket, connectSocket, onConnectionStatus, refreshVoicePresence } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { resetClientRoomState } from '@/shared/stores/reset-room';
import { recordRoomJoin } from '@/shared/room-join-tracker';

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

  // Initial connect + rejoin. Guard compares the STORE's room code against
  // the URL, not just "phase is empty" — a stale phase left by a previous
  // session (logout/401 don't unmount stores) would otherwise suppress the
  // rejoin and render the old game's snapshot, hand included, to whoever
  // navigates here next.
  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    const stale = useRoomStore.getState().roomCode !== roomCode;
    if ((!phase || stale) && roomCode) {
      socket.emit('room:rejoin', roomCode, (res: any) => {
        if (res.success && res.gameState) {
          recordRoomJoin(roomCode, socket.id);
          if (roomCode && res.seats && res.room) {
            setRoom(roomCode, res.seats, res.spectators ?? [], res.room);
          }
          if (res.isSpectator) {
            useGameStore.getState().setSpectator(true);
          }
          setGameState(res.gameState);
          refreshVoicePresence();
        } else {
          if (stale) useGameStore.getState().clearGame();
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
    const unsubscribe = onConnectionStatus((status) => {
      setConnectionStatus(status);
      if (status === 'connected' && roomCode) {
        const socket = getSocket();
        socket.emit('room:rejoin', roomCode, (res: any) => {
          if (res.success && res.gameState) {
            recordRoomJoin(roomCode, socket.id);
            if (res.seats && res.room) {
              setRoom(roomCode, res.seats, res.spectators ?? [], res.room);
            }
            if (res.isSpectator) {
              useGameStore.getState().setSpectator(true);
            }
            setGameState(res.gameState);
            refreshVoicePresence();
          } else if (res.success) {
            // The game ended while we were away (back_to_room) — the room
            // is a waiting room again. Drop the stale game view and follow;
            // silently ignoring this froze players on a dead scoreboard.
            useGameStore.getState().clearGame();
            navigate(`/room/${roomCode}`);
          } else {
            // Room is gone (dissolved / no longer rejoinable) — the missed
            // room:dissolved broadcast can never be replayed, so surface it
            // instead of leaving a frozen dead-game screen.
            useToastStore.getState().addToast(res.error || '房间已解散', 'info');
            resetClientRoomState();
            navigate('/');
          }
        });
      }
    });
    return unsubscribe;
  }, [roomCode, setGameState, setRoom]);

  // Warn before page unload during active game (not for spectators)
  useEffect(() => {
    if (!phase || phase === 'game_over') return;
    const handler = (e: BeforeUnloadEvent) => {
      const { phase: p, isSpectator: s } = useGameStore.getState();
      if (!p || p === 'game_over' || s) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  return connectionStatus;
}
