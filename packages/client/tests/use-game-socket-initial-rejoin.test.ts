import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectSocket: vi.fn(),
  effectIndex: 0,
  effectCleanups: [] as Array<(() => void) | undefined>,
  emit: vi.fn(),
  navigate: vi.fn(),
  roomCode: 'ABC123' as string | null,
  socketId: 'socket-current',
  connected: true,
  phase: 'playing' as string | null,
  statusListener: null as ((status: 'connected' | 'disconnected' | 'reconnecting') => void) | null,
}));

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const index = mocks.effectIndex++;
    // Execute chat listeners and the rejoin coordinator. beforeunload is not
    // relevant to these transport-generation tests.
    if (index < 2) mocks.effectCleanups[index] = effect() || undefined;
  },
  useState: <T>(initial: T) => [initial, vi.fn()],
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

const socket = {
  get id() {
    return mocks.socketId;
  },
  get connected() {
    return mocks.connected;
  },
  emit: mocks.emit,
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/shared/socket', () => ({
  connectSocket: mocks.connectSocket,
  getSocket: () => socket,
  onConnectionStatus: vi.fn(listener => {
    mocks.statusListener = listener;
    return vi.fn();
  }),
  refreshVoicePresence: vi.fn(),
}));

vi.mock('@/features/auth/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { token: string }) => unknown) => selector({ token: 'token-a' }),
}));
vi.mock('@/shared/stores/server-store', () => ({
  useServerStore: (selector: (state: { currentServerId: string }) => unknown) =>
    selector({ currentServerId: 'default' }),
}));

vi.mock('@/features/game/stores/game-store', () => {
  const state = {
    get phase() {
      return mocks.phase;
    },
    isSpectator: false,
    clearGame: vi.fn(),
    setGameState: vi.fn(),
    setSpectator: vi.fn(),
  };
  const useGameStore = (selector: (value: typeof state) => unknown) => selector(state);
  useGameStore.getState = () => state;
  return { useGameStore };
});

vi.mock('@/features/game/stores/chat-store', () => {
  const state = { addMessage: vi.fn(), clearMessages: vi.fn(), setHistory: vi.fn() };
  return { useChatStore: (selector: (value: typeof state) => unknown) => selector(state) };
});
vi.mock('@/features/game/stores/spectator-store', () => ({
  useSpectatorStore: { getState: () => ({ setPendingJoinQueue: vi.fn() }) },
}));
vi.mock('@/shared/stores/room-store', () => {
  const state = {
    get roomCode() {
      return mocks.roomCode;
    },
    setRoom: vi.fn(),
  };
  const useRoomStore = (selector: (value: typeof state) => unknown) => selector(state);
  useRoomStore.getState = () => state;
  return { useRoomStore };
});
vi.mock('@/shared/stores/toast-store', () => ({
  useToastStore: { getState: () => ({ addToast: vi.fn() }) },
}));
vi.mock('@/shared/stores/reset-room', () => ({ resetClientRoomState: vi.fn() }));
vi.mock('@/shared/stores/suspended-room-store', () => ({ clearSuspendedRoom: vi.fn() }));

import { useGameSocket } from '../src/features/game/hooks/useGameSocket';
import { clearRoomJoinRecord, recordRoomJoin } from '../src/shared/room-join-tracker';

beforeEach(() => {
  vi.clearAllMocks();
  clearRoomJoinRecord();
  mocks.effectIndex = 0;
  mocks.effectCleanups = [];
  mocks.statusListener = null;
  mocks.phase = 'playing';
  mocks.roomCode = 'ABC123';
  mocks.socketId = 'socket-current';
  mocks.connected = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGameSocket rejoin coordinator', () => {
  it.each([
    ['the current socket has never joined', undefined],
    ['only the previous socket joined', 'socket-old'],
  ])('requests rejoin when %s despite a matching non-empty store', (_label, joinedSocketId) => {
    if (joinedSocketId) recordRoomJoin('ABC123', joinedSocketId);
    useGameSocket('ABC123');

    expect(mocks.emit).toHaveBeenCalledWith('room:rejoin', 'ABC123', expect.any(Function));
  });

  it('deduplicates the cold connected check and the connect notification', () => {
    useGameSocket('ABC123');
    expect(mocks.emit).toHaveBeenCalledTimes(1);

    mocks.statusListener?.('connected');
    expect(mocks.emit).toHaveBeenCalledTimes(1);
  });

  it('skips rejoin when this socket already joined this room', () => {
    recordRoomJoin('ABC123', 'socket-current');
    useGameSocket('ABC123');

    expect(mocks.connectSocket).toHaveBeenCalledOnce();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('ignores a late acknowledgement after the route effect unmounts', () => {
    let acknowledge: ((response: unknown) => void) | undefined;
    mocks.emit.mockImplementation((_event, _roomCode, callback) => {
      acknowledge = callback;
      return socket;
    });
    useGameSocket('ABC123');
    mocks.effectCleanups[1]?.();
    acknowledge?.({ success: true, gameState: { phase: 'playing' } });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('waits for a connected transport instead of buffering duplicate rejoin', () => {
    mocks.connected = false;
    useGameSocket('ABC123');
    expect(mocks.emit).not.toHaveBeenCalled();

    mocks.connected = true;
    mocks.statusListener?.('connected');
    expect(mocks.emit).toHaveBeenCalledOnce();
  });

  it('retries a lost acknowledgement once and then stops', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useGameSocket('ABC123');

    expect(mocks.emit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.emit).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.emit).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
