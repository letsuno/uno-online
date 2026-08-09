export type CurrentRoomResolution =
  | { kind: 'ignore' }
  | { kind: 'reset' }
  | { kind: 'suspended'; roomCode: string; returnToGame: boolean }
  | { kind: 'room'; roomCode: string; clearPreviousSuspension: boolean };

/**
 * Resolve a user:current_room response without side effects. The marker
 * comparison is the generation guard: a response issued before a new
 * suspension must never clear or navigate away from that newer membership.
 */
export function resolveCurrentRoom(
  suspendedAtRequest: string | null,
  currentSuspendedRoom: string | null,
  authoritativeRoomCode: string | null,
  returnToSuspendedRoom: boolean,
): CurrentRoomResolution {
  if (currentSuspendedRoom !== suspendedAtRequest) return { kind: 'ignore' };
  if (!authoritativeRoomCode) return { kind: 'reset' };

  if (suspendedAtRequest === authoritativeRoomCode) {
    return {
      kind: 'suspended',
      roomCode: authoritativeRoomCode,
      returnToGame: returnToSuspendedRoom,
    };
  }

  return {
    kind: 'room',
    roomCode: authoritativeRoomCode,
    clearPreviousSuspension: suspendedAtRequest !== null,
  };
}
