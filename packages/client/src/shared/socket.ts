import { io, type Socket as SocketType } from 'socket.io-client';
import { getApiUrl } from './env';
import type { ServerToClientEvents, ClientToServerEvents, PlayerView } from '@uno-online/shared';
import { useGameStore } from '@/features/game/stores/game-store';
import { useRoomStore, type RoomPlayer, type RoomData } from './stores/room-store';
import { useToastStore } from './stores/toast-store';
import { playSound } from './sound/sound-manager';
import { useGatewayStore, type PlayerVoicePresence } from './voice/gateway-store';
import { sendNotification } from './utils/notification';
import { useServerVersionStore } from './stores/server-version-store';
import { useServerStore } from './stores/server-store';
import { setServerTimeOffset } from './server-time';
import { useSpectatorStore } from '@/features/game/stores/spectator-store';
import { useLobbyStore } from '@/features/lobby/stores/lobby-store';
import { resetClientRoomState } from './stores/reset-room';

type TypedSocket = SocketType<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;
let connectionStatusCallback: ((status: 'connected' | 'disconnected' | 'reconnecting') => void) | null = null;

export function onConnectionStatus(cb: (status: 'connected' | 'disconnected' | 'reconnecting') => void) {
  connectionStatusCallback = cb;
}

export function getSocket(): TypedSocket {
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
      useRoomStore.getState().updateRoom(data as unknown as { players?: RoomPlayer[]; room?: RoomData });
    });

    socket.on('voice:presence', (presence) => {
      const newPresence = (presence ?? {}) as Record<string, PlayerVoicePresence>;
      const oldPresence = useGatewayStore.getState().playerVoicePresence;

      const selfId = useGameStore.getState().viewerId;
      let changed = false;
      for (const [uid, p] of Object.entries(newPresence)) {
        const old = oldPresence[uid];
        if (!old || old.inVoice !== p.inVoice || old.micEnabled !== p.micEnabled || old.forceMuted !== p.forceMuted) { changed = true; }
        if (uid === selfId) continue;
        const wasInVoice = old?.inVoice;
        if (p.inVoice && !wasInVoice) playSound('voice_join');
        else if (!p.inVoice && wasInVoice) playSound('voice_leave');
      }
      for (const [uid, p] of Object.entries(oldPresence)) {
        if (!newPresence[uid]) { changed = true; }
        if (uid === selfId) continue;
        if (p.inVoice && !newPresence[uid]) playSound('voice_leave');
      }
      if (changed) useGatewayStore.getState().setPlayerVoicePresence(newPresence);
    });

    const handleGameView = (view: PlayerView) => {
      const prevPhase = useGameStore.getState().phase;
      const prevCurrentIndex = useGameStore.getState().currentPlayerIndex;

      const settings = view.settings;
      let turnEndTime: number | null = null;
      if (settings && view.phase !== 'round_end' && view.phase !== 'game_over') {
        const timeLimit = settings.houseRules?.fastMode
          ? Math.floor(settings.turnTimeLimit / 2)
          : settings.turnTimeLimit;
        turnEndTime = Date.now() + timeLimit * 1000;
      }
      useGameStore.getState().setGameState(view, turnEndTime);

      const viewerId = view.viewerId ?? useGameStore.getState().viewerId;
      const currentPlayerId = view.players[view.currentPlayerIndex]?.id;

      if (prevPhase !== 'playing' && view.phase === 'playing' && view.roundNumber === 1) {
        sendNotification('gameStart');
      }

      if (
        view.phase === 'playing' &&
        currentPlayerId === viewerId &&
        (prevPhase !== 'playing' || prevCurrentIndex !== view.currentPlayerIndex)
      ) {
        sendNotification('myTurn');
      }

      if (view.phase === 'game_over' && prevPhase !== 'game_over') {
        sendNotification('gameEnd');
      }
    };

    socket.on('game:state', (view) => {
      handleGameView(view);
      const deckHash = view.deckHash;
      if (deckHash) {
        useToastStore.getState().addToast(`牌序 Hash: ${deckHash.slice(0, 16)}...`, 'info');
      }
    });
    socket.on('game:update', handleGameView);

    socket.on('game:next_round_vote', (vote) => {
      useGameStore.getState().setNextRoundVote(vote.votes > 0 ? vote : null);
    });

    socket.on('game:round_end', (data) => {
      if (data?.roundEndAt) {
        useGameStore.getState().setRoundEndAt(data.roundEndAt);
      }
    });

    socket.on('game:over', (data) => {
      if (data?.gameOverAt) {
        useGameStore.getState().setGameOverAt(data.gameOverAt);
      }
    });

    socket.on('game:back_to_room', (data: { players?: unknown[]; room?: unknown }) => {
      const roomCode = useRoomStore.getState().roomCode;
      if (data.players && data.room && roomCode) {
        useRoomStore.getState().setRoom(roomCode, data.players as any, data.room as any);
      }
      useGameStore.getState().clearGame();
    });

    socket.on('game:card_drawn', (data) => {
      useGameStore.getState().setDrawnCard(data.card);
    });

    socket.on('game:action_rejected', (data) => {
      useToastStore.getState().addToast(data.reason || '操作无效', 'error');
      playSound('error');
    });

    socket.on('player:timeout', (_data) => {
      // noop
    });

    socket.on('player:disconnected', (data) => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) useToastStore.getState().addToast(`${player.name}${player.isBot ? ' (AI)' : ''} 掉线了`, 'info');
      playSound('player_leave');
    });

    socket.on('player:reconnected', (data) => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) useToastStore.getState().addToast(`${player.name}${player.isBot ? ' (AI)' : ''} 重新连接`, 'success');
      playSound('player_join');
    });

    socket.on('player:autopilot', (data) => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) {
        useToastStore.getState().addToast(
          data.enabled ? `${player.name}${player.isBot ? ' (AI)' : ''} 进入托管模式` : `${player.name}${player.isBot ? ' (AI)' : ''} 退出托管模式`,
          'info',
        );
      }
    });

    // The three spectator events all carry the full authoritative
    // `spectators` array per socket-events.ts; trust the contract — local
    // fallbacks would just paper over future server-side regressions.
    socket.on('room:spectator_list', (data) => {
      const store = useSpectatorStore.getState();
      store.setSpectators(data.spectators);
      const nicknameSet = new Set(data.spectators.map((s) => s.nickname));
      if (store.pendingJoinQueue.some((n) => !nicknameSet.has(n))) {
        store.setPendingJoinQueue(store.pendingJoinQueue.filter((n) => nicknameSet.has(n)));
      }
    });

    socket.on('room:spectator_joined', (data) => {
      useToastStore.getState().addToast(`${data.nickname} 开始观战`, 'info');
      useSpectatorStore.getState().setSpectators(data.spectators);
    });

    socket.on('room:spectator_left', (data) => {
      useToastStore.getState().addToast(`${data.nickname} 离开观战`, 'info');
      useSpectatorStore.getState().setSpectators(data.spectators);
    });

    socket.on('server:version', (data) => {
      useServerVersionStore.getState().setVersion(data.version);
      if (data.serverTime) setServerTimeOffset(data.serverTime);
    });

    socket.on('lobby:rooms', (rooms) => {
      useLobbyStore.getState().setActiveRooms(rooms);
    });

    socket.on('connect', () => {
      connectionStatusCallback?.('connected');
      (socket!.io.engine as any)?.on('pong', (latency: number) => {
        useServerStore.getState().setSocketLatency(latency);
      });
    });

    socket.on('disconnect', () => {
      connectionStatusCallback?.('disconnected');
      useServerStore.getState().setSocketLatency(null);
    });

    socket.io.on('reconnect_attempt', () => {
      connectionStatusCallback?.('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      connectionStatusCallback?.('disconnected');
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'Authentication failed') {
        resetClientRoomState();
        localStorage.removeItem('token');
        socket?.disconnect();
        socket = null;
        window.location.href = '/?session_expired=1';
      }
    });

    socket.on('auth:kicked', (_data) => {
      resetClientRoomState();
      localStorage.removeItem('token');
      window.location.href = '/';
    });

    socket.on('game:kicked', (data) => {
      if (data.toSpectator) {
        useGameStore.getState().setSpectator(true);
        useToastStore.getState().addToast(data.reason || '你已被移至观战席', 'info');
        return;
      }
      resetClientRoomState();
      sendNotification('kicked', data.reason || '你已被移出房间');
      useToastStore.getState().addToast(data.reason || '你已被移出游戏', 'error');
      if (window.location.pathname !== '/') {
        window.location.assign('/');
      }
    });

    socket.on('game:cheat_detected', () => {
      useGameStore.getState().setCheatDetected(true);
    });

    socket.on('room:dissolved', (data) => {
      if (useGameStore.getState().cheatDetected) return;
      resetClientRoomState();
      const message = data?.reason === 'idle_timeout'
        ? '房间长时间没有活动，已自动解散'
        : '房间已被房主解散';
      sendNotification('roomDissolved', message);
      useToastStore.getState().addToast(message, 'info');
      if (window.location.pathname !== '/') {
        window.location.assign('/');
      }
    });
  }
  return socket;
}

export function refreshVoicePresence(): void {
  const s = getSocket();
  s.emit('voice:presence:get', (presence) => {
    useGatewayStore.getState().setPlayerVoicePresence(presence as Record<string, PlayerVoicePresence>);
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
