import { useEffect } from 'react';
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

export default function App() {
  const token = useAuthStore((s) => s.token);
  const initialized = useAuthStore((s) => s.initialized);
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    if (!initialized) {
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
      disconnectSocket();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
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
