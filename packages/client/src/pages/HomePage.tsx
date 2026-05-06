import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Spade, Type, Upload, X } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store.js';
import { useSettingsStore, FONT_OPTIONS, type FontOption } from '../stores/settings-store.js';
import { loadCardPack, clearCardPack, isPackLoaded } from '../utils/card-images.js';
import { GITHUB_CLIENT_ID, DEV_MODE } from '../env.js';

export default function HomePage() {
  const { user, token, loading, loadUser, devLogin } = useAuthStore();
  const { fontFamily, setFontFamily, cardImagePack, setCardImagePack } = useSettingsStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [devUsername, setDevUsername] = useState('');
  const [error, setError] = useState('');
  const redirect = searchParams.get('redirect');

  const getRedirectTarget = () => redirect || sessionStorage.getItem('loginRedirect') || '/lobby';

  useEffect(() => {
    if (redirect) sessionStorage.setItem('loginRedirect', redirect);
  }, [redirect]);

  useEffect(() => {
    loadUser().then(() => {
      const u = useAuthStore.getState().user;
      if (u) {
        const target = getRedirectTarget();
        sessionStorage.removeItem('loginRedirect');
        navigate(target);
      }
    });
  }, []);

  const loginUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user`;

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

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 32, textAlign: 'center', padding: 20,
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
      {!loading && !token && (
        DEV_MODE ? (
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
          <a href={loginUrl} className="btn-primary" style={{
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 18, padding: '14px 32px',
          }}>
            <LogIn size={20} /> GitHub 登录
          </a>
        )
      )}
      {loading && <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>}

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
