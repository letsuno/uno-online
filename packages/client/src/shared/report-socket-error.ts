import type { SocketCallbackResult } from '@uno-online/shared';
import { useToastStore } from './stores/toast-store';
import { playSound } from './sound/sound-manager';

/** Report a business rejection only when the server actually acknowledges it. */
export function reportSocketError(result: SocketCallbackResult): void {
  if (!result.success) {
    useToastStore.getState().addToast(result.error, 'error');
    playSound('error');
  }
}
