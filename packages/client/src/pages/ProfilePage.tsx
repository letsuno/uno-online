import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store.js';
import { apiGet, apiPatch, apiPost } from '../api.js';
import AvatarUpload from '../components/AvatarUpload.js';
import { Edit3, Save, Lock } from 'lucide-react';

interface ProfileData {
  user: { id: string; username: string; nickname: string; avatarUrl: string | null; totalGames: number; totalWins: number; githubId?: string | null };
  recentGames: { id: string; game: { roomCode: string; createdAt: string }; finalScore: number; placement: number }[];
}

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<ProfileData>('/profile').then((p) => {
      setProfile(p);
      setNickname(p.user.nickname);
    }).catch(() => navigate('/lobby'));
  }, []);

  const handleSaveNickname = async () => {
    setSaving(true);
    try {
      await apiPatch('/profile', { nickname });
      setProfile((p) => p ? { ...p, user: { ...p.user, nickname } } : p);
      if (user) setUser({ ...user, nickname });
      setEditingNickname(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (dataUrl: string) => {
    try {
      const res = await apiPost<{ avatarUrl: string | null }>('/profile/avatar', { avatar: dataUrl });
      const url = res.avatarUrl;
      setProfile((p) => p ? { ...p, user: { ...p.user, avatarUrl: url } } : p);
      if (user) setUser({ ...user, avatarUrl: url });
    } catch {
      // ignore
    }
  };

  const handleSetPassword = async () => {
    if (password.length < 6) { setPasswordMsg('密码至少 6 个字符'); return; }
    if (password !== passwordConfirm) { setPasswordMsg('两次密码不一致'); return; }
    setPasswordMsg('');
    try {
      await apiPost('/auth/set-password', { password });
      setPasswordMsg('密码设置成功');
      setPassword('');
      setPasswordConfirm('');
    } catch (err) {
      setPasswordMsg((err as Error).message || '设置失败');
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 40, gap: 24,
    }}>
      <h2 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)' }}>个人信息</h2>
      {profile && (
        <>
          <AvatarUpload avatarUrl={profile.user.avatarUrl} size={96} onUpload={handleAvatarUpload} />

          <div style={{ textAlign: 'center' }}>
            {editingNickname ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} style={{ ...inputStyle, width: 160 }} />
                <button className="btn-primary" onClick={handleSaveNickname} disabled={saving} style={{ padding: '8px 12px', fontSize: 13 }}>
                  <Save size={14} />
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 20, fontWeight: 'bold', cursor: 'pointer' }} onClick={() => setEditingNickname(true)}>
                {profile.user.nickname} <Edit3 size={14} style={{ verticalAlign: 'middle', color: 'var(--text-secondary)' }} />
              </p>
            )}
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>@{profile.user.username}</p>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
              总场次: {profile.user.totalGames} | 胜场: {profile.user.totalWins} |
              胜率: {profile.user.totalGames > 0 ? Math.round(profile.user.totalWins / profile.user.totalGames * 100) : 0}%
            </p>
          </div>

          {/* Password section */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 16, width: '100%', maxWidth: 360 }}>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={14} /> 设置密码
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="新密码" style={inputStyle} autoComplete="new-password" />
              <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="确认密码" style={inputStyle} autoComplete="new-password" />
              {passwordMsg && <p style={{ fontSize: 12, color: passwordMsg.includes('成功') ? 'var(--color-green)' : 'var(--color-red)', margin: 0 }}>{passwordMsg}</p>}
              <button className="btn-primary" onClick={handleSetPassword} style={{ fontSize: 13, padding: '8px 16px' }}>保存密码</button>
            </div>
          </div>

          {profile.recentGames.length > 0 && (
            <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 16, width: '100%', maxWidth: 500 }}>
              <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>最近对局</h3>
              {profile.recentGames.map((g) => (
                <div key={g.id} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13,
                }}>
                  <span>房间 {g.game.roomCode}</span>
                  <span>第 {g.placement} 名 | {g.finalScore} 分</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <button className="btn-secondary" onClick={() => navigate('/lobby')}>返回大厅</button>
    </div>
  );
}
