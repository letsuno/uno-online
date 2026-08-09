import type { GatewayConnectArgs, GatewayGetState, GatewaySetState } from './gateway-types';

export const MAX_VOICE_RECONNECT_ATTEMPTS = 5;
const CONNECT_TIMEOUT_MS = 10_000;
const BASE_RECONNECT_DELAY_MS = 500;

type ActiveSession = {
  /** The caller-owned object is retained only for this live voice session. */
  args: GatewayConnectArgs;
  hasConnected: boolean;
  reconnectAttempts: number;
};

type GatewaySessionReconnect = {
  begin: (args: GatewayConnectArgs) => void;
  cancel: () => void;
  gatewayOpened: () => void;
  gatewayClosed: () => void;
  sessionConnected: () => boolean;
  sessionDisconnected: (reason: string) => void;
  fail: (message: string) => void;
};

export function createGatewaySessionReconnect(set: GatewaySetState, get: GatewayGetState): GatewaySessionReconnect {
  let activeSession: ActiveSession | null = null;
  let timer: number | null = null;
  let timerKind: 'connect-timeout' | 'retry' | null = null;

  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    timerKind = null;
  };

  const fail = (message: string) => {
    clearTimer();
    activeSession = null;
    const ws = get()._ws;
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'disconnect' }));
      } catch (error) {
        console.warn('[voice] Failed to terminate an invalid voice session', error);
        ws.close();
      }
    }
    set({ _voiceSink: null, status: 'error', connectError: message });
  };

  const armConnectTimeout = (session: ActiveSession) => {
    clearTimer();
    timerKind = 'connect-timeout';
    timer = window.setTimeout(() => {
      timer = null;
      timerKind = null;
      if (activeSession !== session) return;
      scheduleRetry(session, '语音连接超时');
    }, CONNECT_TIMEOUT_MS);
  };

  const sendConnect = (session: ActiveSession) => {
    if (activeSession !== session) return;

    const ws = get()._ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      get().init();
      if (activeSession !== session) return;
      armConnectTimeout(session);
      return;
    }

    set({
      status: session.reconnectAttempts > 0 ? 'reconnecting' : 'connecting',
      connectError:
        session.reconnectAttempts > 0
          ? `语音正在重连（${session.reconnectAttempts}/${MAX_VOICE_RECONNECT_ATTEMPTS}）`
          : null,
    });

    try {
      ws.send(JSON.stringify({ type: 'connect', ...session.args }));
    } catch (error) {
      console.error('[voice] Failed to send the session connect request', error);
      ws.close();
      scheduleRetry(session, '发送语音连接请求失败');
      return;
    }

    armConnectTimeout(session);
  };

  function scheduleRetry(session: ActiveSession, reason: string): void {
    if (activeSession !== session || timer !== null) return;
    if (session.reconnectAttempts >= MAX_VOICE_RECONNECT_ATTEMPTS) {
      fail(`${reason}，已停止重连，请重新加入语音`);
      return;
    }

    session.reconnectAttempts += 1;
    const attempt = session.reconnectAttempts;
    const delayMs = Math.min(8_000, BASE_RECONNECT_DELAY_MS * 2 ** (attempt - 1));
    set({
      status: 'reconnecting',
      connectError: `${reason}，将在稍后重连（${attempt}/${MAX_VOICE_RECONNECT_ATTEMPTS}）`,
    });
    timerKind = 'retry';
    timer = window.setTimeout(() => {
      timer = null;
      timerKind = null;
      if (activeSession !== session) return;
      sendConnect(session);
    }, delayMs);
  }

  return {
    begin: args => {
      clearTimer();
      const session: ActiveSession = {
        args,
        hasConnected: false,
        reconnectAttempts: 0,
      };
      activeSession = session;
      set({ status: 'connecting', connectError: null });
      sendConnect(session);
    },

    cancel: () => {
      clearTimer();
      activeSession = null;
    },

    gatewayOpened: () => {
      clearTimer();
      if (activeSession) sendConnect(activeSession);
    },

    gatewayClosed: () => {
      if (!activeSession) {
        clearTimer();
        set({ status: 'idle', connectError: null });
        return;
      }
      if (timerKind === 'retry') return;
      clearTimer();
      scheduleRetry(activeSession, '语音网关连接已断开');
    },

    sessionConnected: () => {
      if (!activeSession) {
        fail('收到未知语音会话的连接确认');
        return false;
      }
      clearTimer();
      activeSession.hasConnected = true;
      activeSession.reconnectAttempts = 0;
      return true;
    },

    sessionDisconnected: reason => {
      if (reason !== 'client_disconnect' && activeSession && timerKind === 'retry') return;
      clearTimer();
      if (reason === 'client_disconnect') {
        activeSession = null;
        set({ status: 'idle', connectError: null });
        return;
      }
      if (!activeSession) {
        if (get().status !== 'error') set({ status: 'idle', connectError: null });
        return;
      }
      const prefix = activeSession.hasConnected ? '语音连接已断开' : '语音连接失败';
      scheduleRetry(activeSession, `${prefix}：${reason}`);
    },

    fail,
  };
}
