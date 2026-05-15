import { useEffect } from 'react';
import AppRouter from './router';
import ToastContainer from '@/shared/components/Toast';
import ChangelogModal from '@/shared/components/ChangelogModal';
import NotificationPermissionDialog from '@/shared/components/NotificationPermissionDialog';
import ServerUpdateDialog from '@/shared/components/ServerUpdateDialog';
import ProfileModal from '@/shared/components/ProfileModal';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import StartScreenOverlay from '@/shared/components/StartScreenOverlay';
import { connectSocket } from '@/shared/socket';

export default function App() {
  useEffect(() => {
    if (localStorage.getItem('token')) {
      connectSocket();
    }
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
