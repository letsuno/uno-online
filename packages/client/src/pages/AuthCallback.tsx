import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  useEffect(() => {
    const code = params.get('code');
    if (!code) { navigate('/'); return; }
    const target = sessionStorage.getItem('loginRedirect') || '/lobby';
    sessionStorage.removeItem('loginRedirect');
    login(code).then(() => navigate(target)).catch(() => navigate('/'));
  }, [params, login, navigate]);

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 18 }}>登录中...</p>
    </div>
  );
}
