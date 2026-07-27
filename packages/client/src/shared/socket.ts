import { io, type Socket as SocketType } from 'socket.io-client';
import { getApiUrl } from './env';
import type { ServerToClientEvents, ClientToServerEvents, PlayerView } from '@uno-online/shared';
import { useGameStore } from '@/features/game/stores/game-store';
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
  return useAuthStore.getState().token ?? localStorage.getItem('token');
}

function clearAuthSession(): void {
  clearStoredAuthToken();
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
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('room:updated', (data: Record<string, unknown>) => {
      if (data.room) {
        useRoomStore.getState().updateRoom({ room: data.room as any });
      }
      if (useGameStore.getState().ownerTransferAt !== null) {
        useGameStore.getState().setOwnerTransferAt(null);
      }
    });

    socket.on('seat:updated', (data: { seats: unknown[]; spectators: unknown[] }) => {
      useRoomStore.getState().updateSeats(data as any);
    });

    socket.on('room:ready_changed', (data) => {
      const selfId = useAuthStore.getState().user?.id ?? useGameStore.getState().viewerId;
      if (data.ready && data.playerId !== selfId) playSound('ready');
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

    socket.on('game:back_to_room', (data: { seats?: unknown[]; spectators?: unknown[]; room?: unknown }) => {
      const roomCode = useRoomStore.getState().roomCode;
      if (data.seats && data.spectators && data.room && roomCode) {
        useRoomStore.getState().setRoom(roomCode, data.seats as any, data.spectators as any, data.room as any);
      }
      useGameStore.getState().clearGame();
      // 离开对局语境：游戏内观战席快照与"下局加入"队列都随对局失效，
      // 等待室 UI 只读 room-store，新对局开始时服务端会重发权威快照。
      useSpectatorStore.getState().clearSpectators();
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

    socket.on('room:owner_transfer_pending', (data) => {
      useGameStore.getState().setOwnerTransferAt(data.transferAt);
    });
    socket.on('room:owner_transfer_cancelled', () => {
      useGameStore.getState().setOwnerTransferAt(null);
    });

    socket.on('server:version', (data) => {
      useServerVersionStore.getState().setServerVersion(data.version);
      if (data.serverTime) setServerTimeOffset(data.serverTime);
    });

    socket.on('lobby:rooms', (rooms) => {
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
      if (latencyInterval) { clearInterval(latencyInterval); latencyInterval = null; }
    });

    socket.io.on('reconnect_attempt', () => {
      emitConnectionStatus('reconnecting');
    });

    socket.io.on('reconnect_failed', () => {
      emitConnectionStatus('disconnected');
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'Authentication failed') {
        resetClientRoomState();
        // 只在共享 token 正是刚刚鉴权失败的这一枚时才清除——另一标签页
        // 可能已写入新 token，误清会 401 掉对方的活跃会话。
        const attempted = (socket?.auth as { token?: string | null } | undefined)?.token ?? null;
        if (!attempted || localStorage.getItem('token') === attempted) {
          clearAuthSession();
          socket?.disconnect();
          socket = null;
          window.location.href = '/?session_expired=1';
        } else {
          // 本页 token 已过时且另一标签页持有新会话——按被接管处理：
          // 不整页刷新（刷新会用对方的共享 token 复活并反踢对方），
          // 只让本页退场，等用户显式登录。
          markSessionTakenOver();
          useAuthStore.setState({ user: null, token: null, loading: false, initialized: true });
          socket?.disconnect();
          socket = null;
          globalNavigate('/');
        }
      }
    });

    socket.on('auth:kicked', (_data) => {
      resetClientRoomState();
      // 只让本页退场：不清 localStorage 的共享 token——那是接管方标签页
      // 正在使用的凭证，清掉会让对方所有 REST 请求 401、刷新即掉登录。
      markSessionTakenOver();
      useAuthStore.setState({ user: null, token: null, loading: false, initialized: true });
      socket?.disconnect();
      globalNavigate('/');
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
        globalNavigate('/');
      }
    });

    socket.on('game:cheat_detected', () => {
      useGameStore.getState().setCheatDetected(true);
    });

    socket.on('room:dissolved', (data) => {
      if (useGameStore.getState().cheatDetected) return;
      useGameStore.getState().setDissolvedReason(data?.reason ?? 'host_closed');
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
  // 被接管的标签页禁止自动重连；标志只由显式登录（auth-store 各 login
  // 成功路径）或整页刷新解除——loadUser 的静默恢复不算数。
  if (isSessionTakenOver()) return;
  const s = getSocket();
  const token = currentToken();
  const oldToken = (s.auth as { token?: string | null } | undefined)?.token ?? null;
  s.auth = { token };
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
