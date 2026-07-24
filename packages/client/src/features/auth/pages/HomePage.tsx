import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { apiGet } from '@/shared/api';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { User, Lock, KeyRound } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { useBgm } from '@/shared/sound/useBgm';
import { Turnstile } from 'react-turnstile';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';

interface AuthConfig {
  devMode: boolean;
  githubClientId: string;
  turnstileSiteKey: string | null;
  passkeyEnabled: boolean;
}

export default function HomePage() {
  const { token, loading, loadUser, devLogin, passwordLogin, passkeyLogin } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [devUsername, setDevUsername] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [passkeyLoggingIn, setPasskeyLoggingIn] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
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
      await passwordLogin(loginUsername.trim(), loginPassword, turnstileToken ?? undefined);
      sessionStorage.removeItem('loginRedirect');
      navigate(getRedirectTarget());
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || '登录失败', 'error');
    } finally {
      setLoggingIn(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoggingIn(true);
    try {
      await passkeyLogin();
      sessionStorage.removeItem('loginRedirect');
      navigate(getRedirectTarget());
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || 'Passkey 登录失败', 'error');
    } finally {
      setPasskeyLoggingIn(false);
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
      <AuthLayout title="登录" footer={<span className="text-sm text-muted-foreground">开发模式</span>}>
        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-foreground text-[18px] font-bold mb-2.5">用户名</label>
            <Input
              icon={<User size={24} />}
              inputSize="lg"
              value={devUsername}
              onChange={(e) => { setDevUsername(e.target.value); setFieldError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
              placeholder="输入用户名"
            />
          </div>
          {fieldError && <p className="text-sm text-destructive m-0">{fieldError}</p>}
          <Button variant="game" className="w-full h-[76px] text-2xl tracking-[0.35em]" onClick={handleDevLogin} sound="click">
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
      footer={<>没有账号？ <Link to="/register" className="text-primary font-extrabold no-underline hover:opacity-80">立即注册</Link></>}
    >
      <div className="flex flex-col gap-5">
        {/* GitHub OAuth 主 CTA */}
        <a
          href={loginUrl}
          className="w-full h-[76px] rounded-btn border border-primary/62 text-foreground bg-white/[0.03] flex justify-center items-center gap-3.5 text-[22px] font-extrabold no-underline shadow-[0_0_22px_rgba(246,190,62,0.12)] transition-all hover:bg-white/[0.06] hover:border-primary/80"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A12 12 0 0 0 8.2 23.9c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.5 18.3 4.8 18.3 4.8c.6 1.6.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.5-2.7 5.5-5.3 5.8.5.4.9 1.1.9 2.2v4.1c0 .4.2.7.8.6A12 12 0 0 0 12 .5Z"/></svg>
          GitHub 登录
        </a>

        {/* 分割线 */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[22px] text-muted-foreground tracking-[0.28em]">
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
          <span className="text-sm">或使用账号密码</span>
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
        </div>

        {/* 密码登录表单 */}
        <form onSubmit={handlePasswordLogin} className="flex flex-col gap-[22px]">
          <div>
            <label className="block text-foreground text-[18px] font-bold mb-2.5">用户名</label>
            <Input
              icon={<User size={24} />}
              inputSize="lg"
              value={loginUsername}
              onChange={(e) => { setLoginUsername(e.target.value); setFieldError(''); }}
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-foreground text-[18px] font-bold mb-2.5">密码</label>
            <Input
              icon={<Lock size={24} />}
              inputSize="lg"
              type="password"
              value={loginPassword}
              onChange={(e) => { setLoginPassword(e.target.value); setFieldError(''); }}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>
          {authConfig?.turnstileSiteKey && (
            <Turnstile sitekey={authConfig.turnstileSiteKey} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
          )}
          {fieldError && <p className="text-sm text-destructive m-0">{fieldError}</p>}
          <Button type="submit" variant="game" className="w-full h-[76px] text-2xl tracking-[0.35em]" disabled={loggingIn} sound="click">
            {loggingIn ? '登录中...' : '登 录'}
          </Button>
        </form>

        {/* Passkey 登录 */}
        {authConfig?.passkeyEnabled && browserSupportsWebAuthn() && (
          <>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[22px] text-muted-foreground tracking-[0.28em]">
              <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
              <span className="text-sm">或</span>
              <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
            </div>
            <Button
              variant="game"
              className="w-full h-[76px] text-2xl tracking-[0.35em] flex items-center justify-center gap-2"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoggingIn}
              sound="click"
            >
              <KeyRound size={28} className="shrink-0" />
              {passkeyLoggingIn ? '验证中...' : 'Passkey 登录'}
            </Button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
