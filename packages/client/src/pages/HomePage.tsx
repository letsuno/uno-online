import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { LogIn, Spade, Type, Upload, X } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import { useSettingsStore, FONT_OPTIONS, type FontOption } from '../stores/settings-store';
import { loadCardPack, clearCardPack, isPackLoaded } from '../utils/card-images';
import { apiGet } from '../api';
import { Button } from '../components/ui/Button';

interface AuthConfig {
  devMode: boolean;
  githubClientId: string;
}

export default function HomePage() {
  const { user, token, loading, loadUser, devLogin, passwordLogin } = useAuthStore();
  const { fontFamily, setFontFamily, cardImagePack, setCardImagePack } = useSettingsStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [devUsername, setDevUsername] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [error, setError] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const redirect = searchParams.get('redirect');

  const getRedirectTarget = () => redirect || sessionStorage.getItem('loginRedirect') || '/lobby';

  useEffect(() => {
    if (redirect) sessionStorage.setItem('loginRedirect', redirect);
  }, [redirect]);

  useEffect(() => {
    apiGet<AuthConfig>('/auth/config').then(setAuthConfig).catch(() => {});
    loadUser().then(() => {
      const u = useAuthStore.getState().user;
      if (u) {
        const target = getRedirectTarget();
        sessionStorage.removeItem('loginRedirect');
        navigate(target);
      }
    });
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
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-5 text-center">
      <h1 className="font-game text-heading-xl text-primary text-shadow-bold">
        <Spade size={36} className="inline-block align-middle" /> UNO Online
      </h1>
      <p className="max-w-houserules-max text-lg text-muted-foreground">
        和朋友一起玩 UNO！支持 2-10 人在线对战、语音通话、自定义村规。
      </p>

      {!loading && !token && authConfig && (
        authConfig.devMode ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                value={devUsername}
                onChange={(e) => { setDevUsername(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
                placeholder="输入用户名"
                className="w-dev-input rounded-xl border-2 border-white/20 bg-card px-4 py-3 text-center text-lg text-foreground"
              />
              <Button variant="primary" className="px-6 py-3 text-lg" onClick={handleDevLogin}>
                <LogIn size={20} className="mr-1.5 inline-block align-middle" />登录
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">开发模式</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 w-[280px]">
            <form onSubmit={handlePasswordLogin} className="flex flex-col gap-2.5 w-full">
              <input
                value={loginUsername} onChange={(e) => { setLoginUsername(e.target.value); setError(''); }}
                placeholder="用户名"
                className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground"
                autoComplete="username"
              />
              <input
                type="password" value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setError(''); }}
                placeholder="密码"
                className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground"
                autoComplete="current-password"
              />
              {error && <p className="text-sm text-destructive m-0">{error}</p>}
              <Button type="submit" variant="primary" disabled={loggingIn}>
                <LogIn size={18} className="inline-block align-middle mr-1.5" />
                {loggingIn ? '登录中...' : '登录'}
              </Button>
            </form>

            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-white/15" />
              <span className="text-muted-foreground text-xs">或</span>
              <div className="flex-1 h-px bg-white/15" />
            </div>

            <a href={loginUrl} className="bg-[#24292e] text-primary-foreground inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-3xl text-[15px] font-bold shadow-card transition-transform duration-150 hover:scale-105 active:scale-click no-underline w-full">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg> GitHub 登录
            </a>

            <Link to="/register" className="text-muted-foreground text-sm mt-1">
              没有账号？注册
            </Link>
          </div>
        )
      )}

      {(loading || (!token && !authConfig)) && <p className="text-muted-foreground">加载中...</p>}

      <div className="absolute bottom-6 right-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          {cardImagePack && isPackLoaded() ? (
            <button
              onClick={() => { clearCardPack(); setCardImagePack(false); }}
              className="bg-card text-foreground border border-white/20 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer flex items-center gap-1"
            >
              <X size={14} /> 卸载资源包
            </button>
          ) : (
            <label className="bg-card text-foreground border border-white/20 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer flex items-center gap-1">
              <Upload size={14} /> 加载卡面资源包
              <input
                type="file"
                accept=".zip"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    await loadCardPack(file);
                    setCardImagePack(true);
                  } catch {
                    setCardImagePack(false);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Type size={16} className="text-muted-foreground" />
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value as FontOption)}
            className="bg-card text-foreground border border-white/20 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer"
            style={{ fontFamily: FONT_OPTIONS[fontFamily].value }}
          >
            {(Object.keys(FONT_OPTIONS) as FontOption[]).map((k) => (
              <option key={k} value={k}>{FONT_OPTIONS[k].label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
