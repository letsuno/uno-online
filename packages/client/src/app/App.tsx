import AppRouter from './router';
import ToastContainer from '@/shared/components/Toast';
import ChangelogModal from '@/shared/components/ChangelogModal';
import NotificationPermissionDialog from '@/shared/components/NotificationPermissionDialog';
import ServerUpdateDialog from '@/shared/components/ServerUpdateDialog';
import ProfileModal from '@/shared/components/ProfileModal';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import StartScreenOverlay from '@/shared/components/StartScreenOverlay';

export default function App() {

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
