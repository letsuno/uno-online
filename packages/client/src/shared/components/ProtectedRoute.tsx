import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export default function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const loading = useAuthStore((s) => s.loading);
  const authError = useAuthStore((s) => s.authError);
  const logout = useAuthStore((s) => s.logout);
  const loadUser = useAuthStore((s) => s.loadUser);
  const location = useLocation();

  useEffect(() => {
    if (token && !user && !initialized) void loadUser().catch(() => {});
  }, [token, user, initialized, loadUser]);

  if (!initialized) return <LoadingScreen />;
  if (!token) return <Navigate to={`/?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  if (!user) {
    if (loading) return <LoadingScreen />;
    return <AuthRestoreFailed message={authError} onRetry={() => void loadUser().catch(() => {})} onLogout={logout} />;
  }
  return <Outlet />;
}

function LoadingScreen() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-muted-foreground">加载中...</p>
    </div>
  );
}

function AuthRestoreFailed({ message, onRetry, onLogout }: { message: string | null; onRetry: () => void; onLogout: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="glass-panel max-w-sm w-full p-5 text-center space-y-4">
        <div>
          <h2 className="text-base font-bold">无法恢复登录态</h2>
          <p className="mt-2 text-sm text-muted-foreground">{message ?? '请检查网络后重试。'}</p>
        </div>
        <div className="flex justify-center gap-2">
          <button type="button" className="btn-primary px-4 py-2 rounded-lg" onClick={onRetry}>重试</button>
          <button type="button" className="btn-secondary px-4 py-2 rounded-lg" onClick={onLogout}>退出登录</button>
        </div>
      </div>
    </div>
  );
}
