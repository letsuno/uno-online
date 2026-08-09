import { lazy, Suspense } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Button } from '@/shared/components/ui/Button';

const HomePage = lazy(() => import('@/features/auth/pages/HomePage'));
const LobbyPage = lazy(() => import('@/features/lobby/pages/LobbyPage'));

export default function RootSwitch() {
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const initialized = useAuthStore(s => s.initialized);
  const loading = useAuthStore(s => s.loading);
  const authError = useAuthStore(s => s.authError);
  const logout = useAuthStore(s => s.logout);
  const loadUser = useAuthStore(s => s.loadUser);

  if (!initialized) return <LoadingScreen />;

  if (!token) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <HomePage />
      </Suspense>
    );
  }

  if (!user) {
    if (loading) return <LoadingScreen />;
    return <AuthRestoreFailed message={authError} onRetry={() => void loadUser().catch(() => {})} onLogout={logout} />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <LobbyPage />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-muted-foreground">加载中...</p>
    </div>
  );
}

function AuthRestoreFailed({
  message,
  onRetry,
  onLogout,
}: {
  message: string | null;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="glass-panel max-w-sm w-full p-5 text-center space-y-4">
        <div>
          <h2 className="text-base font-bold">无法恢复登录态</h2>
          <p className="mt-2 text-sm text-muted-foreground">{message ?? '请检查网络后重试。'}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Button type="button" variant="primary" onClick={onRetry}>
            重试
          </Button>
          <Button type="button" variant="secondary" onClick={onLogout}>
            退出登录
          </Button>
        </div>
      </div>
    </div>
  );
}
