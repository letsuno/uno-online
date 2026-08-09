import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  disconnect: vi.fn(),
  leaveVoiceSession: vi.fn(),
  navigate: vi.fn(),
  resetClientRoomState: vi.fn(),
  toast: vi.fn(),
  cleanups: [] as Array<() => void>,
  currentSocket: true,
  roomCode: 'ROOM-A' as string | null,
  scope: { userId: 'user-a' as string | null, serverId: 'default' },
}));

vi.mock('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') mocks.cleanups.push(cleanup);
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/shared/socket', () => ({
  getSocket: () => ({ emit: mocks.emit, disconnect: mocks.disconnect }),
  isCurrentSocket: () => mocks.currentSocket,
}));

vi.mock('@/shared/voice/voice-runtime', () => ({
  leaveVoiceSession: mocks.leaveVoiceSession,
}));

vi.mock('@/shared/stores/reset-room', () => ({
  resetClientRoomState: mocks.resetClientRoomState,
}));

vi.mock('@/shared/stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ addToast: mocks.toast }),
  },
}));

vi.mock('@/shared/stores/suspended-room-store', () => ({
  getCurrentSuspendedRoomScope: () => ({ ...mocks.scope }),
}));

vi.mock('@/shared/stores/room-store', () => ({
  useRoomStore: {
    getState: () => ({ roomCode: mocks.roomCode }),
  },
}));

import { useLeaveRoom } from '../src/features/game/hooks/useLeaveRoom';

type LeaveResponse = { success: boolean; error?: string };

function leaveCallback(): (response: LeaveResponse) => void {
  const call = mocks.emit.mock.calls.find(([event]) => event === 'room:leave');
  expect(call).toBeDefined();
  return call?.[1] as (response: LeaveResponse) => void;
}

beforeEach(() => {
  for (const cleanup of mocks.cleanups.splice(0)) cleanup();
  vi.clearAllMocks();
  mocks.currentSocket = true;
  mocks.roomCode = 'ROOM-A';
  mocks.scope = { userId: 'user-a', serverId: 'default' };
});

describe('useLeaveRoom', () => {
  it('retires the old transport after a committed leave', () => {
    useLeaveRoom()();
    leaveCallback()({ success: true });

    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.resetClientRoomState).toHaveBeenCalledOnce();
    expect(mocks.leaveVoiceSession).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('keeps local state when the server rejects the leave', () => {
    useLeaveRoom()();
    leaveCallback()({ success: false, error: 'leave failed' });

    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.resetClientRoomState).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith('leave failed', 'error');
  });

  it('retires the transport and returns to the lobby when the ACK is lost', async () => {
    vi.useFakeTimers();
    try {
      useLeaveRoom()();
      await vi.advanceTimersByTimeAsync(2_000);

      expect(mocks.disconnect).toHaveBeenCalledOnce();
      expect(mocks.resetClientRoomState).toHaveBeenCalledOnce();
      expect(mocks.navigate).toHaveBeenCalledWith('/');
    } finally {
      vi.useRealTimers();
    }
  });

  it('deduplicates repeated leave clicks until the first operation settles', () => {
    const leave = useLeaveRoom();
    leave();
    leave();

    expect(mocks.emit.mock.calls.filter(([event]) => event === 'room:leave')).toHaveLength(1);
    leaveCallback()({ success: false });
  });

  it('does not let room A timeout clear room B', async () => {
    vi.useFakeTimers();
    try {
      useLeaveRoom()();
      mocks.roomCode = 'ROOM-B';
      await vi.advanceTimersByTimeAsync(2_000);

      expect(mocks.disconnect).not.toHaveBeenCalled();
      expect(mocks.resetClientRoomState).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a late ACK after the owning component unmounts', () => {
    useLeaveRoom()();
    const callback = leaveCallback();
    mocks.cleanups.at(-1)?.();
    callback({ success: true });

    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.resetClientRoomState).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
