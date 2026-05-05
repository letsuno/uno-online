import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}
