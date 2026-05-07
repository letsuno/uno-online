import { useEffect } from 'react';
import AppRouter from './router';
import ToastContainer from '@/shared/components/Toast';
import { useSettingsStore, FONT_OPTIONS } from '@/shared/stores/settings-store';

export default function App() {
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-game', FONT_OPTIONS[fontFamily].value);
  }, [fontFamily]);

  return (
    <div className="flex min-h-svh flex-col font-game bg-background text-foreground">
      <AppRouter />
      <ToastContainer />
    </div>
  );
}
