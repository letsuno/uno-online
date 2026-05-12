import { useEffect } from 'react';
import AppRouter from './router';
import ToastContainer from '@/shared/components/Toast';
import ChangelogModal from '@/shared/components/ChangelogModal';
import NotificationPermissionDialog from '@/shared/components/NotificationPermissionDialog';
import ServerUpdateDialog from '@/shared/components/ServerUpdateDialog';
import { useSettingsStore, FONT_OPTIONS } from '@/shared/stores/settings-store';

export default function App() {
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const uiTheme = useSettingsStore((s) => s.uiTheme);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-game', FONT_OPTIONS[fontFamily].value);
  }, [fontFamily]);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-tech', uiTheme === 'tech');
  }, [uiTheme]);

  return (
    <div className="flex min-h-svh flex-col font-game bg-background text-foreground">
      <AppRouter />
      <ToastContainer />
      <ChangelogModal />
      <NotificationPermissionDialog />
      <ServerUpdateDialog />
    </div>
  );
}
