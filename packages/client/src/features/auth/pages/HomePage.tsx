import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { apiGet } from '@/shared/api';
import { Button } from '@/shared/components/ui/Button';
import AuthLayout from '../components/AuthLayout';
import { useBgm } from '@/shared/sound/useBgm';

interface AuthConfig {
  devMode: boolean;
  githubClientId: string;
}

export default function HomePage() {
  const { token, loading, loadUser, devLogin, passwordLogin } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [devUsername, setDevUsername] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const redirect = searchParams.get('redirect');

  useBgm('lobby');

  const getRedirectTarget = () => redirect || sessionStorage.getItem('loginRedirect') || '/';

  useEffect(() => {
    if (redirect) sessionStorage.setItem('loginRedirect', redirect);
  }, [redirect]);

  useEffect(() => {
    if (searchParams.get('session_expired')) {
      useToastStore.getState().addToast('登录已过期，请重新登录', 'error');
    }
    apiGet<AuthConfig>('/auth/config').then(setAuthConfig).catch(() => {});
    void loadUser();
  }, []);

  const loginUrl = authConfig
    ? `https://github.com/login/oauth/authorize?client_id=${authConfig.githubClientId}&scope=read:user`
    : '#';

  const handleDevLogin = async () => {
    if (!devUsername.trim()) { setFieldError('请输入用户名'); return; }
    setFieldError('');
    try {
      await devLogin(devUsername.trim());
      sessionStorage.removeItem('loginRedirect');
      navigate(getRedirectTarget());
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || '登录失败', 'error');
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) { setFieldError('请输入用户名和密码'); return; }
    setFieldError('');
    setLoggingIn(true);
    try {
      await passwordLogin(loginUsername.trim(), loginPassword);
      sessionStorage.removeItem('loginRedirect');
      navigate(getRedirectTarget());
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || '登录失败', 'error');
    } finally {
      setLoggingIn(false);
    }
  };

  // 配置加载中
  if (loading || (!token && !authConfig)) {
    return (
      <AuthLayout title="登录">
        <p className="text-center text-muted-foreground py-8">加载中...</p>
      </AuthLayout>
    );
  }

  // dev 模式：只一栏用户名 + 登录按钮
  if (authConfig?.devMode) {
    return (
      <AuthLayout title="登录" footer={<span className="text-xs">开发模式</span>}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">用户名</label>
            <input
              value={devUsername}
              onChange={(e) => { setDevUsername(e.target.value); setFieldError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
              placeholder="输入用户名"
              className="glass-input w-full text-foreground"
            />
          </div>
          {fieldError && <p className="text-sm text-destructive m-0">{fieldError}</p>}
          <Button variant="game" className="w-full" onClick={handleDevLogin} sound="click">
            登录
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // 生产模式：GitHub 主推 + 密码登录
  return (
    <AuthLayout
      title="登录"
      footer={<>没有账号？<Link to="/register" className="text-primary hover:underline">立即注册</Link></>}
    >
      <div className="flex flex-col gap-5">
        {/* GitHub OAuth 主 CTA */}
        <a
          href={loginUrl}
          className="bg-white text-[#1f2328] border border-white/80 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[15px] font-bold shadow-card transition-all duration-150 hover:scale-[1.02] hover:bg-[#f6f8fa] hover:shadow-[0_0_24px_rgba(255,255,255,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-click no-underline w-full"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub 登录
        </a>

        {/* 分割线 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <span className="text-muted-foreground text-xs">或使用账号密码</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        </div>

        {/* 密码登录表单 */}
        <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">用户名</label>
            <input
              value={loginUsername}
              onChange={(e) => { setLoginUsername(e.target.value); setFieldError(''); }}
              className="glass-input w-full text-foreground"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">密码</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => { setLoginPassword(e.target.value); setFieldError(''); }}
              className="glass-input w-full text-foreground"
              autoComplete="current-password"
            />
          </div>
          {fieldError && <p className="text-sm text-destructive m-0">{fieldError}</p>}
          <Button type="submit" variant="game" className="w-full" disabled={loggingIn} sound="click">
            {loggingIn ? '登录中...' : '登 录'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
