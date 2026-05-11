import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/shared/api';
import { getRoleColor } from '@/shared/lib/utils';
import AvatarUpload from '@/features/auth/components/AvatarUpload';
import { Edit3, Save, Lock, Key, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

interface ProfileData {
  user: { id: string; username: string; nickname: string; avatarUrl: string | null; totalGames: number; totalWins: number; githubId?: string | null; role?: string };
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
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; keyPreview: string; createdAt: string }[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyFull, setNewKeyFull] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);

  useEffect(() => {
    apiGet<ProfileData>('/profile').then((p) => {
      setProfile(p);
      setNickname(p.user.nickname);
    }).catch(() => navigate('/lobby'));
    apiGet<typeof apiKeys>('/api-keys').then(setApiKeys).catch(() => {});
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

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const result = await apiPost<{ id: string; key: string; name: string; createdAt: string }>('/api-keys', { name: newKeyName.trim() });
      setNewKeyFull(result.key);
      setApiKeys((prev) => [{ id: result.id, name: result.name, keyPreview: `${result.key.slice(0, 11)}...`, createdAt: result.createdAt }, ...prev]);
      setNewKeyName('');
    } catch {
      // ignore
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await apiDelete(`/api-keys/${id}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      // ignore
    }
  };

  const profileRoleColor = getRoleColor(profile?.user.role);

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
                <Button variant="primary" size="sm" onClick={handleSaveNickname} disabled={saving} sound="click">
                  <Save size={14} />
                </Button>
              </div>
            ) : (
              <p className="text-xl font-bold cursor-pointer" onClick={() => setEditingNickname(true)}
                style={profileRoleColor ? { color: profileRoleColor } : undefined}>
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
              <Button variant="primary" size="sm" onClick={handleSetPassword} sound="click">保存密码</Button>
            </div>
          </div>

          {/* API Keys */}
          <div className="bg-card rounded-xl p-4 w-full max-w-[360px]">
            <h3 className="text-sm text-muted-foreground mb-3 flex items-center gap-1.5">
              <Key size={14} /> API Keys
            </h3>
            <p className="text-xs text-muted-foreground mb-3">用于连接 MCP 客户端（如 Claude Code），让 AI 代你玩游戏</p>

            {newKeyFull && (
              <div className="mb-3 rounded-lg border border-uno-green/30 bg-uno-green/10 p-3">
                <p className="text-xs text-uno-green mb-2">Key 已生成，请立即复制（仅显示一次）：</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-black/30 px-2 py-1 text-xs">{newKeyFull}</code>
                  <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(newKeyFull); setNewKeyFull(''); }} sound="click">
                    <Copy size={12} />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Key 名称（如：我的 Claude）"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1 rounded-lg border border-white/15 bg-card px-3 py-2 text-sm text-foreground"
              />
              <Button variant="primary" size="sm" onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()} sound="click">
                生成
              </Button>
            </div>

            {apiKeys.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {apiKeys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2">
                    <div>
                      <span className="text-sm">{k.name}</span>
                      <code className="ml-2 text-xs text-muted-foreground">{k.keyPreview}</code>
                    </div>
                    <button onClick={() => handleDeleteKey(k.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
      <Button variant="secondary" onClick={() => navigate('/lobby')} sound="click">返回大厅</Button>
    </div>
  );
}
