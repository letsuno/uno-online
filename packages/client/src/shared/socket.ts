import { io, Socket } from 'socket.io-client';
import { getApiUrl } from './env';
import { useGameStore } from '@/features/game/stores/game-store';
import { useRoomStore } from './stores/room-store';
import { useToastStore } from './stores/toast-store';
import { playSound } from './sound/sound-manager';
import { useGatewayStore } from './voice/gateway-store';
import { leaveVoiceSession } from './voice/voice-runtime';

let socket: Socket | null = null;
let connectionStatusCallback: ((status: 'connected' | 'disconnected' | 'reconnecting') => void) | null = null;

export function onConnectionStatus(cb: (status: 'connected' | 'disconnected' | 'reconnecting') => void) {
  connectionStatusCallback = cb;
}

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('token');
    socket = io(getApiUrl(), {
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

    socket.on('voice:presence', (presence) => {
      useGatewayStore.getState().setPlayerVoicePresence(presence ?? {});
    });

    const handleGameView = (view: { phase?: string; settings?: { turnTimeLimit: number; houseRules?: { fastMode?: boolean } } }) => {
      useGameStore.getState().setGameState(view);
      const settings = view.settings;
      if (!settings || view.phase === 'round_end' || view.phase === 'game_over') {
        useGameStore.getState().setTurnEndTime(null);
      } else {
        const timeLimit = settings.houseRules?.fastMode
          ? Math.floor(settings.turnTimeLimit / 2)
          : settings.turnTimeLimit;
        useGameStore.getState().setTurnEndTime(Date.now() + timeLimit * 1000);
      }
    };

    socket.on('game:state', (view: Record<string, unknown>) => {
      handleGameView(view as { phase?: string; settings?: { turnTimeLimit: number; houseRules?: { fastMode?: boolean } } });
      const deckHash = (view as { deckHash?: string }).deckHash;
      if (deckHash) {
        useToastStore.getState().addToast(`牌序 Hash: ${deckHash.slice(0, 16)}...`, 'info');
      }
    });
    socket.on('game:update', handleGameView);

    socket.on('game:next_round_vote', (vote: { votes: number; required: number; voters: string[] }) => {
      useGameStore.getState().setNextRoundVote(vote.votes > 0 ? vote : null);
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

    socket.on('player:autopilot', (data: { playerId: string; enabled: boolean }) => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) {
        useToastStore.getState().addToast(
          data.enabled ? `${player.name} 进入托管模式` : `${player.name} 退出托管模式`,
          'info',
        );
      }
    });

    socket.on('room:spectator_joined', (data: { nickname: string }) => {
      useToastStore.getState().addToast(`${data.nickname} 开始观战`, 'info');
    });

    socket.on('room:spectator_left', (data: { nickname: string }) => {
      useToastStore.getState().addToast(`${data.nickname} 离开观战`, 'info');
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

    socket.on('connect_error', (err) => {
      if (err.message === 'Authentication failed') {
        useRoomStore.getState().clearRoom();
        useGameStore.getState().clearGame();
        leaveVoiceSession();
        localStorage.removeItem('token');
        socket?.disconnect();
        socket = null;
        window.location.href = '/?session_expired=1';
      }
    });

    socket.on('auth:kicked', (_data: { reason: string }) => {
      useRoomStore.getState().clearRoom();
      useGameStore.getState().clearGame();
      leaveVoiceSession();
      localStorage.removeItem('token');
      window.location.href = '/';
    });

    socket.on('game:kicked', (data: { reason: string }) => {
      useRoomStore.getState().clearRoom();
      useGameStore.getState().clearGame();
      leaveVoiceSession();
      useToastStore.getState().addToast(data.reason || '你已被移出游戏', 'error');
      if (window.location.pathname !== '/lobby') {
        window.location.assign('/lobby');
      }
    });

    socket.on('room:dissolved', (data?: { reason?: string }) => {
      useRoomStore.getState().clearRoom();
      useGameStore.getState().clearGame();
      leaveVoiceSession();
      const message = data?.reason === 'idle_timeout'
        ? '房间长时间没有活动，已自动解散'
        : '房间已被房主解散';
      useToastStore.getState().addToast(message, 'info');
      if (window.location.pathname !== '/lobby') {
        window.location.assign('/lobby');
      }
    });
  }
  return socket;
}

export function refreshVoicePresence(): void {
  const s = getSocket();
  s.emit('voice:presence:get', (presence: Record<string, unknown>) => {
    useGatewayStore.getState().setPlayerVoicePresence((presence as any) ?? {});
  });
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
