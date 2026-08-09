import { PROTOCOL_VERSION } from '@uno-online/shared';
import { create } from 'zustand';

const STORAGE_KEY_PREFIX = `uno:suspended-room:p${PROTOCOL_VERSION}:`;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/u;

export interface SuspendedRoomScope {
  userId: string | null;
  serverId: string;
}

function getStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function decodeUserId(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded)) as { userId?: unknown };
    return typeof decoded.userId === 'string' ? decoded.userId : null;
  } catch {
    return null;
  }
}

function scopeFromStorage(): SuspendedRoomScope {
  const storage = getStorage();
  return {
    userId: decodeUserId(storage?.getItem('token') ?? null),
    serverId: storage?.getItem('uno-current-server') ?? 'default',
  };
}

function storageKey(scope: SuspendedRoomScope): string {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(scope.serverId)}:${encodeURIComponent(scope.userId ?? '')}`;
}

function readRoomCode(scope: SuspendedRoomScope): string | null {
  const storage = getStorage();
  if (!storage) return null;
  const key = storageKey(scope);
  const value = storage.getItem(key);
  if (value === null || ROOM_CODE_PATTERN.test(value)) return value;
  storage.removeItem(key);
  return null;
}

// Auth and server selection are tab-local even though localStorage is shared.
// Change this scope only after an explicit action in this tab.
let currentTabScope = scopeFromStorage();

export function getCurrentSuspendedRoomScope(): SuspendedRoomScope {
  return { ...currentTabScope };
}

interface SuspendedRoomState {
  roomCode: string | null;
}

export const useSuspendedRoomStore = create<SuspendedRoomState>(() => ({
  roomCode: readRoomCode(currentTabScope),
}));

function refreshCurrentRoom(): void {
  useSuspendedRoomStore.setState({ roomCode: readRoomCode(currentTabScope) });
}

function refreshTabScope(scope: SuspendedRoomScope): void {
  currentTabScope = { ...scope };
  refreshCurrentRoom();
}

export function setCurrentSuspendedRoomToken(token: string | null): void {
  refreshTabScope({ ...currentTabScope, userId: decodeUserId(token) });
}

export function setCurrentSuspendedRoomServerId(serverId: string): void {
  refreshTabScope({ ...currentTabScope, serverId });
}

/** Test/integration hook for an explicit tab-local identity. */
export function setCurrentSuspendedRoomScope(scope: SuspendedRoomScope): void {
  refreshTabScope(scope);
}

export function getSuspendedRoom(scope = currentTabScope): string | null {
  return readRoomCode(scope);
}

export function markRoomSuspended(roomCode: string, scope = currentTabScope): void {
  if (!ROOM_CODE_PATTERN.test(roomCode)) {
    throw new Error(`Invalid room code: ${roomCode}`);
  }
  getStorage()?.setItem(storageKey(scope), roomCode);
  if (scope.userId === currentTabScope.userId && scope.serverId === currentTabScope.serverId) {
    useSuspendedRoomStore.setState({ roomCode });
  }
}

export function clearSuspendedRoom(roomCode?: string, scope = currentTabScope): boolean {
  const existing = readRoomCode(scope);
  if (!existing || (roomCode !== undefined && existing !== roomCode)) return false;
  getStorage()?.removeItem(storageKey(scope));
  if (scope.userId === currentTabScope.userId && scope.serverId === currentTabScope.serverId) {
    useSuspendedRoomStore.setState({ roomCode: null });
  }
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === storageKey(currentTabScope)) refreshCurrentRoom();
  });
}
