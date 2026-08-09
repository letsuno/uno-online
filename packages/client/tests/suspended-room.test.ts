import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '@uno-online/shared';
import {
  clearSuspendedRoom,
  getSuspendedRoom,
  markRoomSuspended,
  setCurrentSuspendedRoomScope,
  useSuspendedRoomStore,
} from '../src/shared/stores/suspended-room-store';

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

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: createMemoryStorage() });
  setCurrentSuspendedRoomScope({ userId: null, serverId: 'default' });
  useSuspendedRoomStore.setState({ roomCode: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('suspended room state', () => {
  it('notifies same-tab subscribers when the marker changes', () => {
    const snapshots: Array<string | null> = [];
    const unsubscribe = useSuspendedRoomStore.subscribe((state, previousState) => {
      if (state.roomCode !== previousState.roomCode) snapshots.push(state.roomCode);
    });

    markRoomSuspended('ABC123');
    markRoomSuspended('ABC123');
    clearSuspendedRoom('ABC123');
    unsubscribe();

    expect(snapshots).toEqual(['ABC123', null]);
  });

  it('does not let a delayed event from an old room clear a newer marker', () => {
    markRoomSuspended('OLD123');
    markRoomSuspended('NEW456');

    expect(clearSuspendedRoom('OLD123')).toBe(false);
    expect(getSuspendedRoom()).toBe('NEW456');
    expect(clearSuspendedRoom('NEW456')).toBe(true);
    expect(getSuspendedRoom()).toBeNull();
  });

  it('supports unconditional reset at a confirmed no-room boundary', () => {
    markRoomSuspended('ABC123');
    expect(clearSuspendedRoom()).toBe(true);
    expect(clearSuspendedRoom()).toBe(false);
  });

  it('does not expose or clear a marker from another account or server', () => {
    const firstScope = { userId: 'user-a', serverId: 'server-a' };
    const otherUser = { userId: 'user-b', serverId: 'server-a' };
    const otherServer = { userId: 'user-a', serverId: 'server-b' };
    markRoomSuspended('ABC123', firstScope);

    expect(getSuspendedRoom(firstScope)).toBe('ABC123');
    expect(getSuspendedRoom(otherUser)).toBeNull();
    expect(getSuspendedRoom(otherServer)).toBeNull();
    expect(clearSuspendedRoom('ABC123', otherUser)).toBe(false);
    expect(clearSuspendedRoom('ABC123', firstScope)).toBe(true);
  });

  it('retains independent suspended rooms for multiple account/server scopes', () => {
    const firstScope = { userId: 'user-a', serverId: 'server-a' };
    const secondScope = { userId: 'user-b', serverId: 'server-b' };
    markRoomSuspended('AAA111', firstScope);
    markRoomSuspended('BBB222', secondScope);

    expect(getSuspendedRoom(firstScope)).toBe('AAA111');
    expect(getSuspendedRoom(secondScope)).toBe('BBB222');
    expect(clearSuspendedRoom('AAA111', firstScope)).toBe(true);
    expect(getSuspendedRoom(secondScope)).toBe('BBB222');
  });

  it('uses the captured tab scope when another tab overwrites shared storage', () => {
    const ownScope = { userId: 'user-a', serverId: 'server-a' };
    setCurrentSuspendedRoomScope(ownScope);
    // Simulate another tab replacing the shared login/server values before
    // this tab receives its room:leave acknowledgement.
    window.localStorage.setItem('token', 'other-tab-token');
    window.localStorage.setItem('uno-current-server', 'server-b');

    markRoomSuspended('AAA111');

    expect(getSuspendedRoom(ownScope)).toBe('AAA111');
    expect(getSuspendedRoom({ userId: null, serverId: 'server-b' })).toBeNull();
  });

  it('deletes an invalid room code from the current protocol namespace', () => {
    const key = `uno:suspended-room:p${PROTOCOL_VERSION}:server-a:user-a`;
    window.localStorage.setItem(key, 'not-a-room-code');

    setCurrentSuspendedRoomScope({ userId: 'user-a', serverId: 'server-a' });

    expect(getSuspendedRoom()).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
