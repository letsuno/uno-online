import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  leaveRoomBeforeDisconnect,
  prepareForAuthLogout,
  registerLogoutPreparation,
  type LogoutSocket,
} from '../src/shared/auth-logout';

function createSocket(connected = true) {
  const socket = {
    connected,
    disconnect: vi.fn(),
    emit: vi.fn(),
  } satisfies LogoutSocket;
  return socket;
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('leaveRoomBeforeDisconnect', () => {
  it('waits for the intentional leave acknowledgement before disconnecting', async () => {
    const socket = createSocket();
    let acknowledge: (() => void) | undefined;
    socket.emit.mockImplementation((_event, callback) => {
      acknowledge = callback;
      return socket;
    });

    const leaving = leaveRoomBeforeDisconnect(socket, true);
    expect(socket.emit).toHaveBeenCalledWith('room:leave', expect.any(Function));
    expect(socket.disconnect).not.toHaveBeenCalled();

    acknowledge?.();
    await leaving;
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('returns a suspended acknowledgement so logout can preserve the room marker', async () => {
    const socket = createSocket();
    let acknowledge: ((result: unknown) => void) | undefined;
    socket.emit.mockImplementation((_event, callback) => {
      acknowledge = callback;
      return socket;
    });

    const leaving = leaveRoomBeforeDisconnect(socket, true);
    acknowledge?.({ success: true, suspended: true });

    await expect(leaving).resolves.toEqual({ success: true, suspended: true });
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it.each([
    { connected: false, hasCurrentRoom: true },
    { connected: true, hasCurrentRoom: false },
  ])('disconnects immediately when a leave cannot or need not be sent (%o)', async ({ connected, hasCurrentRoom }) => {
    const socket = createSocket(connected);

    await leaveRoomBeforeDisconnect(socket, hasCurrentRoom);

    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('falls back to disconnect when the acknowledgement is lost', async () => {
    vi.useFakeTimers();
    const socket = createSocket();

    const leaving = leaveRoomBeforeDisconnect(socket, true, 25);
    await vi.advanceTimersByTimeAsync(25);
    await leaving;

    expect(socket.disconnect).toHaveBeenCalledOnce();
  });
});

describe('prepareForAuthLogout', () => {
  it('deduplicates concurrent logout preparations', async () => {
    let finish: (() => void) | undefined;
    const preparation = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    registerLogoutPreparation(preparation);

    const first = prepareForAuthLogout();
    const second = prepareForAuthLogout();
    expect(preparation).toHaveBeenCalledOnce();

    finish?.();
    await Promise.all([first, second]);
  });

  it('does not let a transport preparation error block logout', async () => {
    registerLogoutPreparation(async () => {
      throw new Error('transport failed');
    });

    await expect(prepareForAuthLogout()).resolves.toBeUndefined();
  });
});
