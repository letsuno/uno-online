import type { RoomLeaveResult } from '@uno-online/shared';

/**
 * Coordinates the authenticated Socket.IO shutdown without importing the
 * socket singleton into the auth store (which would create a module cycle).
 */
type LogoutPreparation = () => Promise<void>;

let logoutPreparation: LogoutPreparation | null = null;
let inFlightPreparation: Promise<void> | null = null;

export interface LogoutSocket {
  connected: boolean;
  disconnect: () => unknown;
  emit: (event: 'room:leave', callback: (result: RoomLeaveResult) => void) => unknown;
}

export function registerLogoutPreparation(preparation: LogoutPreparation): void {
  logoutPreparation = preparation;
}

export async function prepareForAuthLogout(): Promise<void> {
  if (inFlightPreparation) return inFlightPreparation;
  if (!logoutPreparation) return;

  const preparation = logoutPreparation;
  // Logout is still required if the best-effort transport boundary itself
  // fails unexpectedly. Normal delivery failures are already handled by the
  // timeout in leaveRoomBeforeDisconnect.
  inFlightPreparation = preparation()
    .catch((error: unknown) => {
      console.warn('Failed to complete room leave before logout:', error);
    })
    .finally(() => {
      inFlightPreparation = null;
    });
  return inFlightPreparation;
}

/**
 * Give an intentional room departure a short acknowledgement window before
 * closing the transport. If delivery is impossible, disconnecting still
 * falls back to the server's normal reconnect grace instead of deleting the
 * member immediately.
 */
export async function leaveRoomBeforeDisconnect(
  currentSocket: LogoutSocket,
  hasCurrentRoom: boolean,
  timeoutMs = 1_500,
): Promise<RoomLeaveResult | null> {
  let acknowledgement: RoomLeaveResult | null = null;
  if (currentSocket.connected && hasCurrentRoom) {
    await new Promise<void>(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, timeoutMs);
      currentSocket.emit('room:leave', result => {
        acknowledgement = result;
        finish();
      });
    });
  }

  currentSocket.disconnect();
  return acknowledgement;
}
