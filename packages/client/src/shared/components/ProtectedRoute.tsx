import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export default function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const loadUser = useAuthStore((s) => s.loadUser);
  const location = useLocation();

  useEffect(() => {
    if (token && !user) loadUser();
  }, [token, user, loadUser]);

  if (!token) return <Navigate to={`/?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  if (!user) return <div className="flex-1 flex items-center justify-center"><p className="text-muted-foreground">加载中...</p></div>;
  return <Outlet />;
}
