import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  disconnect: vi.fn(),
  leaveVoiceSession: vi.fn(),
  markRoomSuspended: vi.fn(),
  navigate: vi.fn(),
  resetClientRoomState: vi.fn(),
  roomCode: 'ABC123' as string | null,
  toast: vi.fn(),
  cleanups: [] as Array<() => void>,
  currentSocket: true,
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

vi.mock('@/shared/stores/suspended-room-store', () => ({
  markRoomSuspended: mocks.markRoomSuspended,
  getCurrentSuspendedRoomScope: () => ({ ...mocks.scope }),
}));

vi.mock('@/shared/stores/room-store', () => ({
  useRoomStore: {
    getState: () => ({ roomCode: mocks.roomCode }),
  },
}));

vi.mock('@/shared/stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ addToast: mocks.toast }),
  },
}));

import { useSuspendGame } from '../src/features/game/hooks/useSuspendGame';

type LeaveResponse = Parameters<Parameters<typeof mocks.emit>[1]>[0];

function submitLeave(response: LeaveResponse): void {
  useSuspendGame()();
  const leaveCall = mocks.emit.mock.calls.find(([event]) => event === 'room:leave');
  expect(leaveCall).toBeDefined();
  (leaveCall?.[1] as (result: LeaveResponse) => void)(response);
}

beforeEach(() => {
  for (const cleanup of mocks.cleanups.splice(0)) cleanup();
  vi.clearAllMocks();
  mocks.roomCode = 'ABC123';
  mocks.currentSocket = true;
  mocks.scope = { userId: 'user-a', serverId: 'default' };
});

describe('useSuspendGame', () => {
  it('writes the marker only when the server confirms suspended membership', () => {
    submitLeave({ success: true, outcome: 'suspended' });

    expect(mocks.resetClientRoomState).toHaveBeenCalledOnce();
    expect(mocks.markRoomSuspended).toHaveBeenCalledWith('ABC123');
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.leaveVoiceSession).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it.each([
    { success: true, outcome: 'left' },
    { success: true, outcome: 'dissolved' },
  ])('does not write the marker for a non-suspended successful leave (%o)', response => {
    submitLeave(response);

    expect(mocks.resetClientRoomState).toHaveBeenCalledOnce();
    expect(mocks.markRoomSuspended).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('keeps client room state intact when leave fails', () => {
    submitLeave({ success: false, error: 'leave failed' });

    expect(mocks.resetClientRoomState).not.toHaveBeenCalled();
    expect(mocks.markRoomSuspended).not.toHaveBeenCalled();
    expect(mocks.leaveVoiceSession).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith('leave failed', 'error');
  });

  it('honors the leave intent by disconnecting and marking suspension when the ACK is lost', async () => {
    vi.useFakeTimers();
    try {
      useSuspendGame()();
      await vi.advanceTimersByTimeAsync(2_000);

      expect(mocks.disconnect).toHaveBeenCalledOnce();
      expect(mocks.resetClientRoomState).toHaveBeenCalledOnce();
      expect(mocks.markRoomSuspended).toHaveBeenCalledWith('ABC123');
      expect(mocks.navigate).toHaveBeenCalledWith('/');
    } finally {
      vi.useRealTimers();
    }
  });

  it('deduplicates repeated clicks on the mounted leave control', () => {
    const control = useSuspendGame();

    control();
    control();

    expect(mocks.emit.mock.calls.filter(([event]) => event === 'room:leave')).toHaveLength(1);
    const leaveCall = mocks.emit.mock.calls.find(([event]) => event === 'room:leave');
    (leaveCall?.[1] as (result: LeaveResponse) => void)({ success: false, error: 'retry' });
  });

  it('does not let an old timeout clear a newer room generation', async () => {
    vi.useFakeTimers();
    try {
      useSuspendGame()();
      mocks.roomCode = 'ROOM-B';
      await vi.advanceTimersByTimeAsync(2_000);

      expect(mocks.disconnect).not.toHaveBeenCalled();
      expect(mocks.resetClientRoomState).not.toHaveBeenCalled();
      expect(mocks.markRoomSuspended).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the pending operation when its component unmounts', async () => {
    vi.useFakeTimers();
    try {
      useSuspendGame()();
      mocks.cleanups.at(-1)?.();
      await vi.advanceTimersByTimeAsync(2_000);

      expect(mocks.disconnect).not.toHaveBeenCalled();
      expect(mocks.resetClientRoomState).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
