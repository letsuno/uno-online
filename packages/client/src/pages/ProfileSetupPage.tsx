import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store.js';
import { apiPatch, apiPost } from '../api.js';
import AvatarUpload from '../components/AvatarUpload.js';

export default function ProfileSetupPage() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user?.username ?? '');
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [avatar, setAvatar] = useState<string | null>(user?.avatarUrl ?? null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    setError('');
    setSubmitting(true);
    try {
      const updates: Record<string, string> = {};
      if (username !== user?.username) updates.username = username;
      if (nickname !== user?.nickname) updates.nickname = nickname || username;
      if (Object.keys(updates).length > 0) {
        await apiPatch('/profile', updates);
      }
      let finalAvatar = avatar;
      if (avatar && avatar !== user?.avatarUrl && avatar.startsWith('data:')) {
        const res = await apiPost<{ avatarUrl: string | null }>('/profile/avatar', { avatar });
        finalAvatar = res.avatarUrl;
      }
      setUser({
        id: user!.id,
        username: updates.username ?? user!.username,
        nickname: updates.nickname ?? user!.nickname,
        avatarUrl: finalAvatar ?? user!.avatarUrl,
      });
      navigate('/lobby');
    } catch (err) {
      setError((err as Error).message || '保存失败');
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
      <h2 style={{ fontFamily: 'var(--font-game)', fontSize: 28, color: 'var(--text-accent)', marginBottom: 8 }}>完善个人信息</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>首次登录，请确认你的用户名和昵称</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 300, alignItems: 'center' }}>
        <AvatarUpload avatarUrl={avatar} size={80} onUpload={setAvatar} />

        <div style={{ width: '100%' }}>
          <label style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4, display: 'block' }}>用户名（登录用）</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ width: '100%' }}>
          <label style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4, display: 'block' }}>昵称（游戏中显示）</label>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} style={inputStyle} />
        </div>

        {error && <p style={{ color: 'var(--color-red)', fontSize: 14, margin: 0 }}>{error}</p>}

        <button className="btn-primary" onClick={handleSave} disabled={submitting} style={{ fontSize: 16, padding: '12px 32px', width: '100%' }}>
          <Check size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {submitting ? '保存中...' : '确认'}
        </button>
      </div>
    </div>
  );
}
