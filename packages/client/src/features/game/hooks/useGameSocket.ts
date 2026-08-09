import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { useChatStore } from '../stores/chat-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { getSocket, connectSocket, onConnectionStatus, refreshVoicePresence } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { resetClientRoomState } from '@/shared/stores/reset-room';
import { isRoomJoinCurrent, recordRoomJoin } from '@/shared/room-join-tracker';
import { clearSuspendedRoom } from '@/shared/stores/suspended-room-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useServerStore } from '@/shared/stores/server-store';
import type { RoomRejoinResult } from '@uno-online/shared';
import { requestAckWithRetry, ROOM_REJOIN_ACK_POLICY } from '@/shared/socket-ack';

type SuccessfulRejoin = Extract<RoomRejoinResult, { success: true }>;

export function useGameSocket(roomCode: string | undefined) {
  const phase = useGameStore(state => state.phase);
  const setGameState = useGameStore(state => state.setGameState);
  const setChatHistory = useChatStore(state => state.setHistory);
  const addChatMessage = useChatStore(state => state.addMessage);
  const clearChatMessages = useChatStore(state => state.clearMessages);
  const setRoom = useRoomStore(state => state.setRoom);
  const authToken = useAuthStore(state => state.token);
  const serverId = useServerStore(state => state.currentServerId);
  const navigate = useNavigate();
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const [rejoinError, setRejoinError] = useState<string | null>(null);
  const [rejoinAttempt, setRejoinAttempt] = useState(0);

  const retryRejoin = useCallback(() => {
    setRejoinError(null);
    setRejoinAttempt(attempt => attempt + 1);
  }, []);

  const applySuccessfulRejoin = useCallback(
    (code: string, response: SuccessfulRejoin): void => {
      clearSuspendedRoom(code);
      const currentSocket = getSocket();
      recordRoomJoin(code, currentSocket.id);
      setRoom(code, response.seats, response.spectators, response.room);

      if (response.mode !== 'waiting') {
        useGameStore.getState().setSpectator(response.mode === 'spectator');
        setGameState(response.gameState);
      } else {
        useGameStore.getState().clearGame();
      }
      refreshVoicePresence();
    },
    [setGameState, setRoom],
  );

  useEffect(() => {
    const currentSocket = getSocket();
    currentSocket.on('chat:history', setChatHistory);
    currentSocket.on('chat:message', addChatMessage);
    currentSocket.on('chat:cleared', clearChatMessages);

    const onSpectatorQueue = (data: { queue: { userId: string; nickname: string }[] }) => {
      useSpectatorStore.getState().setPendingJoinQueue(data.queue);
    };
    currentSocket.on('game:spectator_queue', onSpectatorQueue);

    return () => {
      currentSocket.off('chat:history', setChatHistory);
      currentSocket.off('chat:message', addChatMessage);
      currentSocket.off('chat:cleared', clearChatMessages);
      currentSocket.off('game:spectator_queue', onSpectatorQueue);
    };
  }, [setChatHistory, addChatMessage, clearChatMessages]);

  // One coordinator handles both cold starts and reconnects. It never queues
  // rejoin on a disconnected transport, deduplicates the immediate connected
  // check against the connect event, and invalidates late acknowledgements on
  // route/account/server/socket generation changes.
  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    let inFlightKey: string | null = null;
    const requestController = new AbortController();
    const hadLocalMembership = !!roomCode && useRoomStore.getState().roomCode === roomCode;

    const rejoinCurrentSocket = () => {
      if (cancelled || !roomCode) return;
      const currentSocket = getSocket();
      const socketId = currentSocket.id;
      if (!currentSocket.connected || !socketId) return;
      if (isRoomJoinCurrent(roomCode, socketId)) return;

      const requestKey = `${socketId}:${roomCode}`;
      if (inFlightKey === requestKey) return;
      inFlightKey = requestKey;
      const requestGeneration = ++generation;
      setRejoinError(null);

      void requestAckWithRetry<RoomRejoinResult>(
        acknowledge => {
          if (getSocket() !== currentSocket || !currentSocket.connected || currentSocket.id !== socketId) {
            throw new Error('Socket generation changed during room rejoin');
          }
          currentSocket.emit('room:rejoin', roomCode, acknowledge);
        },
        {
          ...ROOM_REJOIN_ACK_POLICY,
          signal: requestController.signal,
        },
      )
        .then(rawResponse => {
          if (
            cancelled ||
            requestGeneration !== generation ||
            getSocket() !== currentSocket ||
            currentSocket.id !== socketId
          )
            return;
          inFlightKey = null;

          if (rawResponse.success) {
            setRejoinError(null);
            applySuccessfulRejoin(roomCode, rawResponse);
            if (rawResponse.mode === 'waiting') navigate(`/room/${roomCode}`, { replace: true });
            return;
          }

          if (!hadLocalMembership) {
            // A pasted game URL may still be an ordinary waiting-room URL.
            useGameStore.getState().clearGame();
            navigate(`/room/${roomCode}`, { replace: true });
            return;
          }

          useToastStore.getState().addToast(rawResponse.error, 'info');
          resetClientRoomState();
          navigate('/', { replace: true });
        })
        .catch((error: unknown) => {
          if (
            cancelled ||
            requestGeneration !== generation ||
            requestController.signal.aborted ||
            getSocket() !== currentSocket ||
            !currentSocket.connected ||
            currentSocket.id !== socketId
          )
            return;
          inFlightKey = null;
          console.warn('[room] Rejoin acknowledgement timed out', error);
          setRejoinError('同步房间状态超时，请重试');
        });
    };

    const unsubscribe = onConnectionStatus(status => {
      if (cancelled) return;
      setConnectionStatus(status);
      if (status === 'connected') rejoinCurrentSocket();
    });

    connectSocket();
    rejoinCurrentSocket();

    return () => {
      cancelled = true;
      generation += 1;
      inFlightKey = null;
      requestController.abort();
      unsubscribe();
    };
  }, [applySuccessfulRejoin, authToken, navigate, rejoinAttempt, roomCode, serverId]);

  useEffect(() => {
    if (!phase || phase === 'game_over') return;
    const handler = (event: BeforeUnloadEvent) => {
      const { phase: currentPhase, isSpectator } = useGameStore.getState();
      if (!currentPhase || currentPhase === 'game_over' || isSpectator) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  return { connectionStatus, rejoinError, retryRejoin };
}
