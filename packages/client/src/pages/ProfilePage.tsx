import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { apiGet, apiPatch, apiPost } from '../api';
import AvatarUpload from '../components/AvatarUpload';
import { Edit3, Save, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';

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

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-10">
      <h2 className="font-game text-primary">个人信息</h2>
      {profile && (
        <>
          <AvatarUpload avatarUrl={profile.user.avatarUrl} size={96} onUpload={handleAvatarUpload} />

          <div className="text-center">
            {editingNickname ? (
              <div className="flex items-center gap-2">
                <input value={nickname} onChange={(e) => setNickname(e.target.value)}
                  className="w-40 rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-foreground" />
                <Button variant="primary" size="sm" onClick={handleSaveNickname} disabled={saving}>
                  <Save size={14} />
                </Button>
              </div>
            ) : (
              <p className="text-xl font-bold cursor-pointer" onClick={() => setEditingNickname(true)}>
                {profile.user.nickname} <Edit3 size={14} className="inline-block align-middle text-muted-foreground" />
              </p>
            )}
            <p className="text-muted-foreground text-sm mt-1">@{profile.user.username}</p>
            <p className="mt-2 text-muted-foreground">
              总场次: {profile.user.totalGames} | 胜场: {profile.user.totalWins} |
              胜率: {profile.user.totalGames > 0 ? Math.round(profile.user.totalWins / profile.user.totalGames * 100) : 0}%
            </p>
          </div>

          {/* Password section */}
          <div className="bg-card rounded-xl p-4 w-full max-w-[360px]">
            <h3 className="text-sm text-muted-foreground mb-3 flex items-center gap-1.5">
              <Lock size={14} /> 设置密码
            </h3>
            <div className="flex flex-col gap-2">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="新密码"
                className="w-full rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-foreground" autoComplete="new-password" />
              <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="确认密码"
                className="w-full rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-foreground" autoComplete="new-password" />
              {passwordMsg && (
                <p className={`text-xs m-0 ${passwordMsg.includes('成功') ? 'text-uno-green' : 'text-destructive'}`}>{passwordMsg}</p>
              )}
              <Button variant="primary" size="sm" onClick={handleSetPassword}>保存密码</Button>
            </div>
          </div>

          {profile.recentGames.length > 0 && (
            <div className="w-full max-w-profile-max rounded-xl bg-card p-4">
              <h3 className="mb-3 text-sm text-muted-foreground">最近对局</h3>
              {profile.recentGames.map((g) => (
                <div key={g.id} className="flex justify-between border-b border-white/5 py-1.5 text-caption">
                  <span>房间 {g.game.roomCode}</span>
                  <span>第 {g.placement} 名 | {g.finalScore} 分</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <Button variant="secondary" onClick={() => navigate('/lobby')}>返回大厅</Button>
    </div>
  );
}
