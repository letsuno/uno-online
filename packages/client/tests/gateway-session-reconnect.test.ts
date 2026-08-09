import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGatewaySessionReconnect,
  MAX_VOICE_RECONNECT_ATTEMPTS,
} from '../src/shared/voice/gateway-session-reconnect';
import type { GatewayGetState, GatewaySetState, GatewayStore } from '../src/shared/voice/gateway-types';

class TestWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;

  readyState = TestWebSocket.OPEN;
  readonly send = vi.fn();
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

function createController(ws: TestWebSocket | null = new TestWebSocket()) {
  const state = {
    status: 'idle',
    connectError: null,
    _ws: ws,
    init: vi.fn(),
  } as unknown as GatewayStore;

  const set: GatewaySetState = partial => {
    Object.assign(state, typeof partial === 'function' ? partial(state) : partial);
  };
  const get: GatewayGetState = () => state;

  return {
    controller: createGatewaySessionReconnect(set, get),
    state,
    ws,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', TestWebSocket);
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    location: { protocol: 'http:', host: 'localhost' },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('voice session reconnect controller', () => {
  it('keeps credentials outside the public store state', () => {
    const { controller, state, ws } = createController();

    controller.begin({
      serverId: 'uno',
      username: 'player',
      password: 'top-secret',
      tokens: ['session-token'],
    });

    expect(ws?.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'connect',
        serverId: 'uno',
        username: 'player',
        password: 'top-secret',
        tokens: ['session-token'],
      }),
    );
    expect(JSON.stringify(state)).not.toContain('top-secret');
    expect(JSON.stringify(state)).not.toContain('session-token');
  });

  it('never writes current-session credentials to persistent storage', async () => {
    vi.resetModules();
    const storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);

    class ConnectingWebSocket extends TestWebSocket {
      readyState = TestWebSocket.CONNECTING;
      binaryType = '';
      bufferedAmount = 0;
    }
    vi.stubGlobal('WebSocket', ConnectingWebSocket);

    const { useGatewayStore } = await import('../src/shared/voice/gateway-store');
    useGatewayStore.getState().connect({
      serverId: 'uno',
      username: 'player',
      password: 'persist-me-not',
      tokens: ['persist-me-not-either'],
    });

    const persisted = storage.getItem('mumble-gateway-storage');
    expect(persisted).not.toBeNull();
    expect(persisted).not.toContain('persist-me-not');
    expect(persisted).not.toContain('password');
    expect(persisted).not.toContain('tokens');
  });

  it('uses one retry when the session and gateway report the same outage', () => {
    const { controller, state, ws } = createController();

    controller.begin({ serverId: 'uno', username: 'player' });
    expect(controller.sessionConnected()).toBe(true);

    controller.sessionDisconnected('network');
    controller.sessionDisconnected('network');
    controller.gatewayClosed();

    expect(state.status).toBe('reconnecting');
    expect(state.connectError).toContain(`1/${MAX_VOICE_RECONNECT_ATTEMPTS}`);
    vi.advanceTimersByTime(500);
    expect(ws?.send).toHaveBeenCalledTimes(2);
  });

  it('stops after a finite number of consecutive reconnect attempts', () => {
    const { controller, state, ws } = createController();

    controller.begin({ serverId: 'uno', username: 'player' });
    expect(controller.sessionConnected()).toBe(true);

    const delays = [500, 1_000, 2_000, 4_000, 8_000];
    for (const delay of delays) {
      controller.sessionDisconnected('network');
      vi.advanceTimersByTime(delay);
    }
    controller.sessionDisconnected('network');

    expect(ws?.send).toHaveBeenCalledTimes(MAX_VOICE_RECONNECT_ATTEMPTS + 2);
    expect(state.status).toBe('error');
    expect(state.connectError).toContain('已停止重连');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending reconnect without sending again', () => {
    const { controller, ws } = createController();

    controller.begin({ serverId: 'uno', username: 'player' });
    expect(controller.sessionConnected()).toBe(true);
    controller.sessionDisconnected('network');
    controller.cancel();
    vi.runAllTimers();

    expect(ws?.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not arm a stale timeout when gateway initialization fails synchronously', () => {
    const { controller, state } = createController(null);
    state.init = () => controller.fail('无法连接语音网关');

    controller.begin({ serverId: 'uno', username: 'player' });

    expect(state.status).toBe('error');
    expect(vi.getTimerCount()).toBe(0);
  });
});
