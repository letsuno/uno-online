import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to={`/?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}
