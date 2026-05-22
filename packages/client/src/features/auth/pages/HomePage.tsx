import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { apiGet } from '@/shared/api';
import { Button } from '@/shared/components/ui/Button';
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
      <AuthLayout title="登录" footer={<span className="text-sm text-[#8b95b3]">开发模式</span>}>
        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-[#dce5ff] text-[18px] font-bold mb-2.5">用户名</label>
            <div className="relative">
              <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--gold)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
              <input
                value={devUsername}
                onChange={(e) => { setDevUsername(e.target.value); setFieldError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
                placeholder="输入用户名"
                className="h-[68px] w-full rounded-[16px] border border-[rgba(127,154,225,0.32)] bg-[rgba(13,20,39,0.64)] text-foreground outline-0 pl-14 pr-5 text-base placeholder:text-[rgba(216,224,245,0.38)] focus:border-[rgba(246,190,62,0.6)] focus:shadow-[0_0_0_4px_rgba(246,190,62,0.10)] transition-all"
              />
            </div>
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
      footer={<>没有账号？ <Link to="/register" className="text-[var(--gold)] font-extrabold no-underline hover:opacity-80">立即注册</Link></>}
    >
      <div className="flex flex-col gap-5">
        {/* GitHub OAuth 主 CTA */}
        <a
          href={loginUrl}
          className="w-full h-[76px] rounded-[18px] border border-[rgba(246,190,62,0.62)] text-[#f3f6ff] bg-white/[0.03] flex justify-center items-center gap-3.5 text-[22px] font-extrabold no-underline shadow-[0_0_22px_rgba(246,190,62,0.12)] transition-all hover:bg-white/[0.06] hover:border-[rgba(246,190,62,0.8)]"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A12 12 0 0 0 8.2 23.9c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.5 18.3 4.8 18.3 4.8c.6 1.6.2 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.5-2.7 5.5-5.3 5.8.5.4.9 1.1.9 2.2v4.1c0 .4.2.7.8.6A12 12 0 0 0 12 .5Z"/></svg>
          GitHub 登录
        </a>

        {/* 分割线 */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[22px] text-[#c6cee4] tracking-[0.28em]">
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
          <span className="text-sm">或使用账号密码</span>
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
        </div>

        {/* 密码登录表单 */}
        <form onSubmit={handlePasswordLogin} className="flex flex-col gap-[22px]">
          <div>
            <label className="block text-[#dce5ff] text-[18px] font-bold mb-2.5">用户名</label>
            <div className="relative">
              <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--gold)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
              <input
                value={loginUsername}
                onChange={(e) => { setLoginUsername(e.target.value); setFieldError(''); }}
                placeholder="请输入用户名"
                className="h-[68px] w-full rounded-[16px] border border-[rgba(127,154,225,0.32)] bg-[rgba(13,20,39,0.64)] text-foreground outline-0 pl-14 pr-5 text-base placeholder:text-[rgba(216,224,245,0.38)] focus:border-[rgba(246,190,62,0.6)] focus:shadow-[0_0_0_4px_rgba(246,190,62,0.10)] transition-all"
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="block text-[#dce5ff] text-[18px] font-bold mb-2.5">密码</label>
            <div className="relative">
              <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--gold)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => { setLoginPassword(e.target.value); setFieldError(''); }}
                placeholder="请输入密码"
                className="h-[68px] w-full rounded-[16px] border border-[rgba(127,154,225,0.32)] bg-[rgba(13,20,39,0.64)] text-foreground outline-0 pl-14 pr-5 text-base placeholder:text-[rgba(216,224,245,0.38)] focus:border-[rgba(246,190,62,0.6)] focus:shadow-[0_0_0_4px_rgba(246,190,62,0.10)] transition-all"
                autoComplete="current-password"
              />
            </div>
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
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[22px] text-[#c6cee4] tracking-[0.28em]">
              <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
              <span className="text-sm">或</span>
              <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,190,62,0.48), transparent)' }} />
            </div>
            <Button
              variant="game"
              className="w-full h-[76px] text-2xl tracking-[0.35em]"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoggingIn}
              sound="click"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mr-2">
                <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
                <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
              </svg>
              {passkeyLoggingIn ? '验证中...' : 'Passkey 登录'}
            </Button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
