import { lazy, Suspense, useEffect } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';

const HomePage = lazy(() => import('@/features/auth/pages/HomePage'));
const LobbyPage = lazy(() => import('@/features/lobby/pages/LobbyPage'));

/**
 * `/` 路径的智能路由：根据 auth 状态决定渲染登录页或大厅。
 *
 * - 无 token：渲染 HomePage（登录表单）
 * - 有 token 但 user 还在 loading：渲染加载提示（沿用 ProtectedRoute 风格）
 * - 有 token + user：渲染 LobbyPage（原 /lobby 路径的大厅 UI）
 *
 * 已登录但 user 为 null 时主动调 loadUser()，与 ProtectedRoute 的语义对齐。
 */
export default function RootSwitch() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    if (token && !user) loadUser();
  }, [token, user, loadUser]);

  if (!token) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <HomePage />
      </Suspense>
    );
  }

  if (!user) return <LoadingScreen />;

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
