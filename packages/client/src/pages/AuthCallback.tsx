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
    <div className="flex flex-1 items-center justify-center">
      <p className="text-lg text-muted-foreground">登录中...</p>
    </div>
  );
}
