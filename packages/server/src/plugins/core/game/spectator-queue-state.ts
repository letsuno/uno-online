import type { UserRole } from '@uno-online/shared';

export interface PendingSpectatorJoin {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  isBot: boolean;
}

const pendingByRoom = new Map<string, Map<string, PendingSpectatorJoin>>();

export function getPendingSpectatorJoins(roomCode: string): Map<string, PendingSpectatorJoin> | undefined {
  return pendingByRoom.get(roomCode);
}

export function ensurePendingSpectatorJoins(roomCode: string): Map<string, PendingSpectatorJoin> {
  let pending = pendingByRoom.get(roomCode);
  if (!pending) {
    pending = new Map();
    pendingByRoom.set(roomCode, pending);
  }
  return pending;
}

export function getPendingSpectatorJoinSnapshot(roomCode: string): PendingSpectatorJoin[] {
  return [...(pendingByRoom.get(roomCode)?.values() ?? [])].map(entry => ({ ...entry }));
}

export function restorePendingSpectatorJoins(roomCode: string, entries: PendingSpectatorJoin[]): void {
  pendingByRoom.delete(roomCode);
  if (entries.length === 0) return;

  const restored = new Map<string, PendingSpectatorJoin>();
  for (const entry of entries) {
    restored.set(entry.userId, { ...entry });
  }
  pendingByRoom.set(roomCode, restored);
}

export function removePendingSpectatorJoinState(roomCode: string, userId: string): boolean {
  const pending = pendingByRoom.get(roomCode);
  if (!pending) return false;
  const removed = pending.delete(userId);
  if (pending.size === 0) pendingByRoom.delete(roomCode);
  return removed;
}

export function clearPendingSpectatorJoinState(roomCode: string): void {
  pendingByRoom.delete(roomCode);
}
