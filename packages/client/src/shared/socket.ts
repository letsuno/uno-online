import { io, type Socket as SocketType } from 'socket.io-client';
import { getApiUrl } from './env';
import { PROTOCOL_VERSION } from '@uno-online/shared';
import type { ServerToClientEvents, ClientToServerEvents, PlayerView } from '@uno-online/shared';
import { useGameStore } from '@/features/game/stores/game-store';
import { useCheatNoticeStore } from '@/features/game/stores/cheat-notice-store';
import { useRoomStore } from './stores/room-store';
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
import { globalNavigate } from './utils/global-navigate';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { clearStoredAuthToken } from './api';
import { markSessionTakenOver, isSessionTakenOver } from './session-takeover';
import {
  clearSuspendedRoom,
  getSuspendedRoom,
  markRoomSuspended,
  setCurrentSuspendedRoomToken,
} from './stores/suspended-room-store';
import { leaveRoomBeforeDisconnect, registerLogoutPreparation } from './auth-logout';

type TypedSocket = SocketType<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';
const connectionStatusListeners = new Set<(status: ConnectionStatus) => void>();
let lastConnectionStatus: ConnectionStatus = 'connected';

/** 订阅连接状态;返回退订函数。多页面(GamePage/RoomPage)可同时订阅。 */
export function onConnectionStatus(cb: (status: ConnectionStatus) => void): () => void {
  connectionStatusListeners.add(cb);
  return () => connectionStatusListeners.delete(cb);
}

export function getConnectionStatus(): ConnectionStatus {
  return lastConnectionStatus;
}

function emitConnectionStatus(status: ConnectionStatus): void {
  lastConnectionStatus = status;
  for (const cb of connectionStatusListeners) cb(status);
}

function currentToken(): string | null {
  return useAuthStore.getState().token;
}

function clearAuthSession(attemptedToken: string | null): void {
  if (attemptedToken && localStorage.getItem('token') === attemptedToken) {
    clearStoredAuthToken();
  }
  setCurrentSuspendedRoomToken(null);
  useAuthStore.setState({ user: null, token: null, loading: false, initialized: true });
}

async function checkCaddyVersion(): Promise<void> {
  try {
    const res = await fetch('/healthz', { method: 'HEAD', cache: 'no-store' });
    const instanceStart = res.headers.get('X-Instance-Start');
    if (instanceStart) {
      useServerVersionStore.getState().setClientVersion(instanceStart);
    }
  } catch {
    // Caddy header unavailable (e.g. dev mode) — skip
  }
}

export function getSocket(): TypedSocket {
  if (!socket) {
    const token = currentToken();
    socket = io(getApiUrl(), {
      auth: { token, protocolVersion: PROTOCOL_VERSION },
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    const hasSuspendedRoomWithoutActiveView = () =>
      useRoomStore.getState().roomCode === null && getSuspendedRoom() !== null;

    socket.on('room:updated', data => {
      if (hasSuspendedRoomWithoutActiveView()) return;
      useRoomStore.getState().updateRoom(data);
      if (useGameStore.getState().ownerTransferAt !== null) {
        useGameStore.getState().setOwnerTransferAt(null);
      }
    });

    socket.on('seat:updated', data => {
      if (hasSuspendedRoomWithoutActiveView()) return;
      useRoomStore.getState().updateSeats(data);
    });

    socket.on('room:ready_changed', data => {
      const selfId = useAuthStore.getState().user?.id ?? useGameStore.getState().viewerId;
      if (data.ready && data.playerId !== selfId) playSound('ready');
    });

    socket.on('voice:presence', presence => {
      const newPresence: Record<string, PlayerVoicePresence> = presence;
      const oldPresence = useGatewayStore.getState().playerVoicePresence;

      const selfId = useGameStore.getState().viewerId;
      let changed = false;
      for (const [uid, p] of Object.entries(newPresence)) {
        const old = oldPresence[uid];
        if (
          !old ||
          old.inVoice !== p.inVoice ||
          old.micEnabled !== p.micEnabled ||
          old.speakerMuted !== p.speakerMuted ||
          old.speaking !== p.speaking ||
          old.forceMuted !== p.forceMuted
        ) {
          changed = true;
        }
        if (uid === selfId) continue;
        const wasInVoice = old?.inVoice;
        if (p.inVoice && !wasInVoice) playSound('voice_join');
        else if (!p.inVoice && wasInVoice) playSound('voice_leave');
      }
      for (const [uid, p] of Object.entries(oldPresence)) {
        if (!newPresence[uid]) {
          changed = true;
        }
        if (uid === selfId) continue;
        if (p.inVoice && !newPresence[uid]) playSound('voice_leave');
      }
      if (changed) useGatewayStore.getState().setPlayerVoicePresence(newPresence);
    });

    const handleGameView = (view: PlayerView) => {
      if (hasSuspendedRoomWithoutActiveView()) return;
      const prevPhase = useGameStore.getState().phase;
      const prevCurrentIndex = useGameStore.getState().currentPlayerIndex;

      useGameStore.getState().setGameState(view);

      const viewerId = view.viewerId;
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

    socket.on('game:state', view => {
      handleGameView(view);
      const deckHash = view.deckHash;
      if (deckHash) {
        useToastStore.getState().addToast(`牌序 Hash: ${deckHash.slice(0, 16)}...`, 'info');
      }
    });
    socket.on('game:update', handleGameView);

    socket.on('game:next_round_vote', vote => {
      useGameStore.getState().setNextRoundVote(vote);
    });

    socket.on('game:round_end', data => {
      useGameStore.getState().setRoundEndAt(data.roundEndAt);
    });

    socket.on('game:over', data => {
      useGameStore.getState().setGameOverAt(data.gameOverAt);
    });

    socket.on('game:back_to_room', data => {
      const roomCode = useRoomStore.getState().roomCode;
      if (roomCode) useRoomStore.getState().setRoom(roomCode, data.seats, data.spectators, data.room);
      useGameStore.getState().clearGame();
      // 离开对局语境：游戏内观战席快照与"下局加入"队列都随对局失效，
      // 等待室 UI 只读 room-store，新对局开始时服务端会重发权威快照。
      useSpectatorStore.getState().clearSpectators();
    });

    socket.on('game:card_drawn', data => {
      useGameStore.getState().setDrawnCard(data.card);
    });

    socket.on('player:disconnected', data => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) useToastStore.getState().addToast(`${player.name}${player.isBot ? ' (AI)' : ''} 掉线了`, 'info');
      playSound('player_leave');
    });

    socket.on('player:reconnected', data => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) useToastStore.getState().addToast(`${player.name}${player.isBot ? ' (AI)' : ''} 重新连接`, 'success');
      playSound('player_join');
    });

    socket.on('player:autopilot', data => {
      const player = useGameStore.getState().players.find(p => p.id === data.playerId);
      if (player) {
        useToastStore
          .getState()
          .addToast(
            data.enabled
              ? `${player.name}${player.isBot ? ' (AI)' : ''} 进入托管模式`
              : `${player.name}${player.isBot ? ' (AI)' : ''} 退出托管模式`,
            'info',
          );
      }
    });

    // The three spectator events all carry the full authoritative
    // `spectators` array per socket-events.ts; trust the contract — local
    // fallbacks would just paper over future server-side regressions.
    socket.on('room:spectator_list', data => {
      useSpectatorStore.getState().setSpectators(data.spectators);
    });

    socket.on('room:spectator_joined', data => {
      useToastStore.getState().addToast(`${data.nickname} 开始观战`, 'info');
      useSpectatorStore.getState().setSpectators(data.spectators);
    });

    socket.on('room:spectator_left', data => {
      useToastStore.getState().addToast(`${data.nickname} 离开观战`, 'info');
      useSpectatorStore.getState().setSpectators(data.spectators);
    });

    socket.on('room:owner_transfer_pending', data => {
      useGameStore.getState().setOwnerTransferAt(data.transferAt);
    });
    socket.on('room:owner_transfer_cancelled', () => {
      useGameStore.getState().setOwnerTransferAt(null);
    });

    socket.on('server:version', data => {
      useServerVersionStore.getState().setServerProtocolVersion(data.protocolVersion);
      if (data.protocolVersion !== PROTOCOL_VERSION) {
        socket?.disconnect();
        return;
      }
      setServerTimeOffset(data.serverTime);
    });

    socket.on('lobby:rooms', rooms => {
      useLobbyStore.getState().setActiveRooms(rooms);
    });

    let latencyInterval: ReturnType<typeof setInterval> | null = null;
    const measureLatency = () => {
      const start = performance.now();
      socket!.volatile.emit('ping:latency', () => {
        useServerStore.getState().setSocketLatency(Math.round(performance.now() - start));
      });
    };

    socket.on('connect', () => {
      emitConnectionStatus('connected');
      measureLatency();
      latencyInterval = setInterval(measureLatency, 30_000);
      checkCaddyVersion();
    });

    socket.on('disconnect', () => {
      emitConnectionStatus('disconnected');
      useServerStore.getState().setSocketLatency(null);
      if (latencyInterval) {
        clearInterval(latencyInterval);
        latencyInterval = null;
      }
    });

    socket.io.on('reconnect_attempt', () => {
      emitConnectionStatus('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      emitConnectionStatus('disconnected');
    });

    socket.on('connect_error', err => {
      if (err.message === 'Protocol mismatch') {
        useServerVersionStore.getState().markNeedsRefresh();
        socket?.disconnect();
        return;
      }
      if (err.message === 'Authentication failed') {
        resetClientRoomState({ preserveSuspendedRoom: true });
        // 只在共享 token 正是刚刚鉴权失败的这一枚时才清除——另一标签页
        // 可能已写入新 token，误清会 401 掉对方的活跃会话。
        const attempted = (socket?.auth as { token?: string | null } | undefined)?.token ?? null;
        if (!attempted || localStorage.getItem('token') === attempted) {
          clearAuthSession(attempted);
          socket?.disconnect();
          socket = null;
          window.location.href = '/?session_expired=1';
        } else {
          // 本页 token 已过时且另一标签页持有新会话——按被接管处理：
          // 不整页刷新（刷新会用对方的共享 token 复活并反踢对方），
          // 只让本页退场，等用户显式登录。
          markSessionTakenOver();
          setCurrentSuspendedRoomToken(null);
          useAuthStore.setState({ user: null, token: null, loading: false, initialized: true });
          socket?.disconnect();
          socket = null;
          globalNavigate('/');
        }
      }
    });

    socket.on('auth:kicked', _data => {
      // This is a per-tab takeover. localStorage is shared, so the old tab
      // must not erase the new tab's suspended-room marker.
      resetClientRoomState({ preserveSuspendedRoom: true });
      // 只让本页退场：不清 localStorage 的共享 token——那是接管方标签页
      // 正在使用的凭证，清掉会让对方所有 REST 请求 401、刷新即掉登录。
      markSessionTakenOver();
      setCurrentSuspendedRoomToken(null);
      useAuthStore.setState({ user: null, token: null, loading: false, initialized: true });
      socket?.disconnect();
      globalNavigate('/');
    });

    socket.on('room:moved_to_spectator', data => {
      const currentRoomCode = useRoomStore.getState().roomCode;
      if (data.roomCode !== currentRoomCode && data.roomCode !== getSuspendedRoom()) return;
      useGameStore.getState().setSpectator(true);
      useToastStore.getState().addToast(data.reason, 'info');
    });

    socket.on('room:membership_ended', data => {
      // This directed event is the durable membership boundary. It is also
      // the fallback when adapter enumeration/broadcast failed, so consume it
      // for either the suspended membership or this tab's active room.
      const clearedSuspension = clearSuspendedRoom(data.roomCode);
      const isCurrentRoom = useRoomStore.getState().roomCode === data.roomCode;
      if (!clearedSuspension && !isCurrentRoom) return;

      const isCheatTermination = data.reason === 'cheat_detected';
      if (!isCheatTermination) {
        const message =
          data.reason === 'kicked'
            ? '你已被房主移出房间'
            : data.reason === 'idle_timeout'
              ? '房间因长时间无活动已关闭'
              : data.reason === 'host_closed'
                ? '房主已解散房间'
                : '房间已关闭';
        if (data.reason === 'kicked') sendNotification('kicked', message);
        useToastStore.getState().addToast(message, data.reason === 'kicked' ? 'error' : 'info');
      }
      // This event is the authoritative end of the suspended membership.
      // Clear stale player/spectator state even while the user is already in
      // the lobby; otherwise a prior "moved to spectator" notification can
      // leak that role into the next room they create or join.
      // clearSuspendedRoom already performed a compare-and-clear. Preserve a
      // newer scoped marker that may have appeared while this event travelled.
      resetClientRoomState({ preserveSuspendedRoom: true });
      if (isCheatTermination) useCheatNoticeStore.getState().show();
      const roomPath = new RegExp(`^/(?:room|game)/${data.roomCode}$`, 'iu');
      if (roomPath.test(window.location.pathname)) {
        globalNavigate('/');
      }
    });
  }
  return socket;
}

export function refreshVoicePresence(): void {
  const s = getSocket();
  const socketId = s.id;
  const roomCode = useRoomStore.getState().roomCode;
  s.emit('voice:presence:get', presence => {
    if (!isCurrentSocket(s) || s.id !== socketId || useRoomStore.getState().roomCode !== roomCode) return;
    useGatewayStore.getState().setPlayerVoicePresence(presence);
  });
}

/** Read-only identity check for async operations that must not act on a
 * replacement transport created after an auth/server/room transition. */
export function isCurrentSocket(candidate: unknown): boolean {
  return socket === candidate;
}

export function connectSocket(): void {
  // 被接管的标签页禁止自动重连；标志只由显式登录（auth-store 各 login
  // 成功路径）或整页刷新解除——loadUser 的静默恢复不算数。
  if (isSessionTakenOver()) return;
  if (useServerVersionStore.getState().needsRefresh) return;
  const s = getSocket();
  const token = currentToken();
  const oldToken = (s.auth as { token?: string | null } | undefined)?.token ?? null;
  s.auth = { token, protocolVersion: PROTOCOL_VERSION };
  if (s.connected && oldToken !== token) {
    s.disconnect();
    s.connect();
    return;
  }
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

registerLogoutPreparation(async () => {
  const currentSocket = socket;
  if (!currentSocket) return;

  const roomCode = useRoomStore.getState().roomCode;
  const result = await leaveRoomBeforeDisconnect(currentSocket, roomCode !== null);
  if (roomCode && result) {
    if (result.success && result.outcome === 'suspended') markRoomSuspended(roomCode);
    else if (result.success) clearSuspendedRoom(roomCode);
  }
  if (socket === currentSocket) socket = null;
});

// 网络恢复自动重连：reconnectionAttempts 耗尽（约 30s 断网）后 socket.io
// 永不再自行重试，且对局页不会重新挂载来触发 connectSocket——没有这个
// 监听，断网稍久的玩家会永久卡在断线遮罩后面。
// 只认本页内存中的 token：localStorage 是共享的，已登出的标签页若用它
// 兜底建连，会以另一标签页的身份上线并反踢对方的活跃 socket。
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (isSessionTakenOver()) return;
    if (!useAuthStore.getState().token) return;
    if (socket?.connected) return;
    connectSocket();
  });
}
