import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { LogIn, Spade, Type, Upload, X } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store.js';
import { useSettingsStore, FONT_OPTIONS, type FontOption } from '../stores/settings-store.js';
import { loadCardPack, clearCardPack, isPackLoaded } from '../utils/card-images.js';
import { apiGet } from '../api.js';

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

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.15)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 16,
    width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 24, textAlign: 'center', padding: 20,
    }}>
      <h1 style={{
        fontFamily: 'var(--font-game)', fontSize: 48, color: 'var(--text-accent)',
        textShadow: '3px 4px 0px rgba(0,0,0,0.3)',
      }}>
        <Spade size={36} style={{ verticalAlign: 'middle' }} /> UNO Online
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 18, maxWidth: 400 }}>
        和朋友一起玩 UNO！支持 2-10 人在线对战、语音通话、自定义村规。
      </p>

      {!loading && !token && authConfig && (
        authConfig.devMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={devUsername}
                onChange={(e) => { setDevUsername(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
                placeholder="输入用户名"
                style={{
                  padding: '12px 16px', borderRadius: 12, border: '2px solid rgba(255,255,255,0.2)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 18,
                  textAlign: 'center', width: 200,
                }}
              />
              <button className="btn-primary" onClick={handleDevLogin} style={{ fontSize: 18, padding: '12px 24px' }}>
                <LogIn size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />登录
              </button>
            </div>
            {error && <p style={{ color: 'var(--color-red)', fontSize: 14 }}>{error}</p>}
            <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>开发模式</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: 280 }}>
            <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <input
                value={loginUsername} onChange={(e) => { setLoginUsername(e.target.value); setError(''); }}
                placeholder="用户名" style={inputStyle} autoComplete="username"
              />
              <input
                type="password" value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setError(''); }}
                placeholder="密码" style={inputStyle} autoComplete="current-password"
              />
              {error && <p style={{ color: 'var(--color-red)', fontSize: 13, margin: 0 }}>{error}</p>}
              <button type="submit" className="btn-primary" disabled={loggingIn} style={{ fontSize: 16, padding: '10px 24px' }}>
                <LogIn size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {loggingIn ? '登录中...' : '登录'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>或</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
            </div>

            <a href={loginUrl} className="btn-primary" style={{
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 15, padding: '10px 24px', width: '100%', boxSizing: 'border-box',
              background: '#24292e',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg> GitHub 登录
            </a>

            <Link to="/register" style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
              没有账号？注册
            </Link>
          </div>
        )
      )}

      {(loading || (!token && !authConfig)) && <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>}

      <div style={{
        position: 'absolute', bottom: 24, right: 24,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {cardImagePack && isPackLoaded() ? (
            <button
              onClick={() => { clearCardPack(); setCardImagePack(false); }}
              style={{
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
                padding: '6px 10px', fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <X size={14} /> 卸载资源包
            </button>
          ) : (
            <label style={{
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
              padding: '6px 10px', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Type size={16} style={{ color: 'var(--text-secondary)' }} />
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value as FontOption)}
            style={{
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
              padding: '6px 10px', fontSize: 14, cursor: 'pointer',
              fontFamily: FONT_OPTIONS[fontFamily].value,
            }}
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
