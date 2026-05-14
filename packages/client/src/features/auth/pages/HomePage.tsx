import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { apiGet } from '@/shared/api';
import { Button } from '@/shared/components/ui/Button';
import { ServerSelectModal } from '@/shared/components/ServerSelectModal';
import GamePageShell from '@/shared/components/GamePageShell';
import ServerStatusBar from '@/shared/components/ServerStatusBar';
import { useBgm } from '@/shared/sound/useBgm';

interface AuthConfig {
  devMode: boolean;
  githubClientId: string;
}

/**
 * 登录页。仅当 RootSwitch 检测到未登录时被渲染。
 *
 * 不再处理「已登录跳转」的逻辑——RootSwitch 会自动渲染 LobbyPage 而不是来这里。
 * 不再处理「按任意键继续」的启动屏——StartScreenOverlay 是全局浮层，与本页解耦。
 */
export default function HomePage() {
  const { token, loading, loadUser, devLogin, passwordLogin } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [devUsername, setDevUsername] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const redirect = searchParams.get('redirect');

  // 与 LobbyPage 共用 'lobby' scene，登录前后 BGM 续播不中断（bgm-engine 同 scene 不重启）
  useBgm('lobby');

  const getRedirectTarget = () => redirect || sessionStorage.getItem('loginRedirect') || '/';

  useEffect(() => {
    if (redirect) sessionStorage.setItem('loginRedirect', redirect);
  }, [redirect]);

  useEffect(() => {
    if (searchParams.get('session_expired')) {
      setError('登录已过期，请重新登录');
    }
    apiGet<AuthConfig>('/auth/config').then(setAuthConfig).catch(() => {});
    void loadUser();
  }, []);

  const loginUrl = authConfig
    ? `https://github.com/login/oauth/authorize?client_id=${authConfig.githubClientId}&scope=read:user`
    : '#';

  const handleDevLogin = async () => {
    if (!devUsername.trim()) { setError('请输入用户名'); return; }
    setError('');
    try {
      await devLogin(devUsername.trim());
      const target = getRedirectTarget();
      sessionStorage.removeItem('loginRedirect');
      navigate(target);
    } catch {
      setError('登录失败');
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) { setError('请输入用户名和密码'); return; }
    setError('');
    setLoggingIn(true);
    try {
      await passwordLogin(loginUsername.trim(), loginPassword);
      const target = getRedirectTarget();
      sessionStorage.removeItem('loginRedirect');
      navigate(target);
    } catch (err) {
      setError((err as Error).message || '登录失败');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <GamePageShell>
      <div className="relative z-1 flex flex-col items-center justify-center text-center">
        <h1 className="font-game text-[88px] leading-none text-primary" style={{ textShadow: '0 0 40px rgba(251,191,36,0.3), 0 2px 8px rgba(0,0,0,0.5)' }}>
          ♠ UNO
        </h1>
        <p className="mt-2 text-sm tracking-[6px] text-white/40 font-medium uppercase">
          Online Card Game
        </p>
        <p className="mt-4 max-w-[440px] text-base text-muted-foreground">
          和朋友一起玩 UNO！支持 2-10 人在线对战、语音通话、自定义村规。
        </p>

        {!loading && !token && authConfig && (
          authConfig.devMode ? (
            <div className="mt-12 flex flex-col items-center gap-4 w-[440px]">
              <input
                value={devUsername}
                onChange={(e) => { setDevUsername(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
                placeholder="输入用户名"
                className="glass-input w-full text-foreground text-center"
              />
              <Button variant="game" className="w-full" onClick={handleDevLogin} sound="click">
                登录
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground">开发模式</p>
            </div>
          ) : (
            <div className="mt-12 flex flex-col items-center gap-4 w-[440px]">
              <form onSubmit={handlePasswordLogin} className="flex flex-col gap-3 w-full">
                <input
                  value={loginUsername}
                  onChange={(e) => { setLoginUsername(e.target.value); setError(''); }}
                  placeholder="用户名"
                  className="glass-input w-full text-foreground"
                  autoComplete="username"
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => { setLoginPassword(e.target.value); setError(''); }}
                  placeholder="密码"
                  className="glass-input w-full text-foreground"
                  autoComplete="current-password"
                />
                {error && <p className="text-sm text-destructive m-0">{error}</p>}
                <Button type="submit" variant="game" className="w-full" disabled={loggingIn} sound="click">
                  {loggingIn ? '登录中...' : '登录'}
                </Button>
              </form>

              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                <span className="text-muted-foreground text-xs">— 或 —</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              </div>

              <a href={loginUrl} className="bg-white text-[#1f2328] border border-white/80 inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-3xl text-[15px] font-bold shadow-card transition-all duration-150 hover:scale-105 hover:bg-[#f6f8fa] hover:shadow-[0_0_24px_rgba(255,255,255,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-click no-underline w-full">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg> GitHub 登录
              </a>

              <Link to="/register" className="text-muted-foreground text-sm mt-1 hover:text-foreground transition-colors">
                没有账号？注册
              </Link>
            </div>
          )
        )}

        {(loading || (!token && !authConfig)) && <p className="mt-12 text-muted-foreground">加载中...</p>}
      </div>

      <ServerStatusBar />
      <ServerSelectModal />
    </GamePageShell>
  );
}
