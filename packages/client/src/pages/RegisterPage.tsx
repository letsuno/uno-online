import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store.js';
import AvatarUpload from '../components/AvatarUpload.js';

export default function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('两次密码不一致'); return; }
    setSubmitting(true);
    try {
      await register(username, password, nickname || username, avatar ?? undefined);
      navigate('/lobby');
    } catch (err) {
      setError((err as Error).message || '注册失败');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.15)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 16, width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <h2 style={{ fontFamily: 'var(--font-game)', fontSize: 32, color: 'var(--text-accent)', marginBottom: 24 }}>注册</h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 300, alignItems: 'center' }}>
        <AvatarUpload avatarUrl={avatar} size={80} onUpload={setAvatar} />

        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名（登录用）" style={inputStyle} required />
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="昵称（游戏中显示，可选）" style={inputStyle} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码（至少 6 位）" style={inputStyle} required />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="确认密码" style={inputStyle} required />

        {error && <p style={{ color: 'var(--color-red)', fontSize: 14, margin: 0 }}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={submitting} style={{ fontSize: 16, padding: '12px 32px', width: '100%' }}>
          <UserPlus size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {submitting ? '注册中...' : '注册'}
        </button>
      </form>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <Link to="/" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>已有账号？去登录</Link>
      </div>
    </div>
  );
}
