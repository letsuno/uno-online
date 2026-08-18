import { useEffect, useRef } from 'react';
import AppRouter from './router';
import ToastContainer from '@/shared/components/Toast';
import ChangelogModal from '@/shared/components/ChangelogModal';
import NotificationPermissionDialog from '@/shared/components/NotificationPermissionDialog';
import ServerUpdateDialog from '@/shared/components/ServerUpdateDialog';
import ProfileModal from '@/shared/components/ProfileModal';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import StartScreenOverlay from '@/shared/components/StartScreenOverlay';
import { connectSocket, disconnectSocket } from '@/shared/socket';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { resetClientRoomState } from '@/shared/stores/reset-room';

export default function App() {
  const token = useAuthStore(s => s.token);
  const initialized = useAuthStore(s => s.initialized);
  const loadUser = useAuthStore(s => s.loadUser);
  const authInitializationStarted = useRef(false);

  useEffect(() => {
    if (!initialized && !authInitializationStarted.current) {
      authInitializationStarted.current = true;
      void loadUser().catch(() => {});
    }
  }, [initialized, loadUser]);

  useEffect(() => {
    if (token) {
      connectSocket();
    } else if (initialized) {
      disconnectSocket();
    }
  }, [token, initialized]);

  useEffect(() => {
    const handleUnauthorized = () => {
      useAuthStore.setState({ user: null, token: null, loading: false, initialized: true, authError: null });
      // Room/game stores outlive the login session (module-level zustand) —
      // without this, the next account to log in through this SPA instance
      // inherits the previous account's full game snapshot, hand included.
      // Authentication failure disconnects this tab but does not prove that
      // the room membership ended; another tab may also own the shared marker.
      resetClientRoomState({ preserveSuspendedRoom: true });
      disconnectSocket();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    const isEditable = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      !!el.closest('input, textarea, select, [contenteditable="true"], [data-allow-selection]');

    const onContextMenu = (e: Event) => {
      if (!isEditable(e.target)) e.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  return (
    <div className="flex min-h-svh flex-col font-game bg-background text-foreground">
      <AppRouter />
      <ToastContainer />
      <ChangelogModal />
      <NotificationPermissionDialog />
      <ServerUpdateDialog />
      <ProfileModal />
      <ConfirmDialog />
      <StartScreenOverlay />
    </div>
  );
}
