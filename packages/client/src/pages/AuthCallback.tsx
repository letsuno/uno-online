import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, type BindInfo } from '../stores/auth-store.js';
import { LogIn, Link as LinkIcon } from 'lucide-react';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { login, bindGithub } = useAuthStore();
  const navigate = useNavigate();
  const [bindInfo, setBindInfo] = useState<BindInfo | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const code = params.get('code');
    if (!code) { navigate('/'); return; }
    const savedTarget = sessionStorage.getItem('loginRedirect') || '/lobby';
    sessionStorage.removeItem('loginRedirect');
    login(code)
      .then((result) => {
        if (result.needsBind) {
          setBindInfo(result.needsBind);
        } else if (result.isNewUser) {
          navigate('/profile/setup');
        } else {
          navigate(savedTarget);
        }
      })
      .catch(() => navigate('/'));
  }, []);

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bindInfo || !password) return;
    setError('');
    setSubmitting(true);
    try {
      await bindGithub(bindInfo.username, password, bindInfo.githubId, bindInfo.githubAvatarUrl);
      navigate(sessionStorage.getItem('loginRedirect') || '/lobby');
    } catch (err) {
      setError((err as Error).message || '绑定失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (bindInfo) {
    const inputStyle: React.CSSProperties = {
      padding: '10px 14px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.15)',
      background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 16,
      width: '100%', boxSizing: 'border-box',
    };

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <LinkIcon size={32} style={{ color: 'var(--text-accent)', marginBottom: 16 }} />
        <h2 style={{ fontFamily: 'var(--font-game)', fontSize: 24, color: 'var(--text-accent)', marginBottom: 8 }}>绑定账号</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, textAlign: 'center', maxWidth: 360 }}>
          用户名 <strong>{bindInfo.username}</strong> 已存在。输入该账号的密码即可绑定 GitHub 登录。
        </p>
        <form onSubmit={handleBind} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="输入账号密码" style={inputStyle} autoFocus autoComplete="current-password" />
          {error && <p style={{ color: 'var(--color-red)', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting} style={{ fontSize: 16, padding: '10px 24px' }}>
            <LogIn size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {submitting ? '绑定中...' : '确认绑定'}
          </button>
        </form>
        <button onClick={() => navigate('/')} style={{
          marginTop: 16, background: 'none', border: 'none', color: 'var(--text-secondary)',
          fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
        }}>
          取消
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 18 }}>登录中...</p>
    </div>
  );
}
