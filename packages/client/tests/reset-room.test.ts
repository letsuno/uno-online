import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearRoom: vi.fn(),
  clearGame: vi.fn(),
  clearSpectators: vi.fn(),
  clearMessages: vi.fn(),
  clearLog: vi.fn(),
  clearJoinRecord: vi.fn(),
  clearSuspendedRoom: vi.fn(),
  leaveVoiceSession: vi.fn(),
}));

vi.mock('../src/shared/stores/room-store', () => ({
  useRoomStore: { getState: () => ({ clearRoom: mocks.clearRoom }) },
}));
vi.mock('../src/features/game/stores/game-store', () => ({
  useGameStore: { getState: () => ({ clearGame: mocks.clearGame }) },
}));
vi.mock('../src/features/game/stores/spectator-store', () => ({
  useSpectatorStore: { getState: () => ({ clearSpectators: mocks.clearSpectators }) },
}));
vi.mock('../src/features/game/stores/chat-store', () => ({
  useChatStore: { getState: () => ({ clearMessages: mocks.clearMessages }) },
}));
vi.mock('../src/features/game/stores/game-log-store', () => ({
  useGameLogStore: { getState: () => ({ clear: mocks.clearLog }) },
}));
vi.mock('../src/shared/room-join-tracker', () => ({
  clearRoomJoinRecord: mocks.clearJoinRecord,
}));
vi.mock('../src/shared/stores/suspended-room-store', () => ({
  clearSuspendedRoom: mocks.clearSuspendedRoom,
}));
vi.mock('../src/shared/voice/voice-runtime', () => ({
  leaveVoiceSession: mocks.leaveVoiceSession,
}));

import { resetClientRoomState } from '../src/shared/stores/reset-room';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resetClientRoomState', () => {
  it('clears the suspension marker at an authoritative membership end', () => {
    resetClientRoomState();
    expect(mocks.clearSuspendedRoom).toHaveBeenCalledOnce();
    expect(mocks.clearRoom).toHaveBeenCalledOnce();
    expect(mocks.clearGame).toHaveBeenCalledOnce();
  });

  it('preserves the shared marker for auth loss or tab takeover', () => {
    resetClientRoomState({ preserveSuspendedRoom: true });
    expect(mocks.clearSuspendedRoom).not.toHaveBeenCalled();
    expect(mocks.clearRoom).toHaveBeenCalledOnce();
    expect(mocks.clearGame).toHaveBeenCalledOnce();
  });
});
