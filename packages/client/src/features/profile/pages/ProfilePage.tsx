import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/shared/api';
import { getRoleColor } from '@/shared/lib/utils';
import AvatarUpload from '@/features/auth/components/AvatarUpload';
import { Edit3, Save, Lock, Key, Copy, Trash2, Bell } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { useNotificationStore, type NotificationEventType } from '@/shared/stores/notification-store';
import GamePageShell from '@/shared/components/GamePageShell';
import GameTopBar from '@/shared/components/GameTopBar';

interface ProfileData {
  user: { id: string; username: string; nickname: string; avatarUrl: string | null; githubId?: string | null; role?: string };
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
  const [keyError, setKeyError] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);

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
    setKeyError('');
    try {
      const result = await apiPost<{ id: string; key: string; name: string; createdAt: string }>('/api-keys', { name: newKeyName.trim() });
      setNewKeyFull(result.key);
      setKeyCopied(false);
      setApiKeys((prev) => [{ id: result.id, name: result.name, keyPreview: `${result.key.slice(0, 11)}...`, createdAt: result.createdAt }, ...prev]);
      setNewKeyName('');
    } catch (err) {
      setKeyError((err as Error).message || '创建失败');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(newKeyFull);
      setKeyCopied(true);
    } catch {
      setKeyError('复制失败，请手动选择文本复制');
    }
  };

  const handleDismissKey = () => {
    setNewKeyFull('');
    setKeyCopied(false);
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('确定要删除这个 API Key 吗？删除后使用该 Key 的 MCP 客户端将无法连接。')) return;
    try {
      await apiDelete(`/api-keys/${id}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setKeyError((err as Error).message || '删除失败');
    }
  };

  const profileRoleColor = getRoleColor(profile?.user.role);

  return (
    <GamePageShell showDecoCards={true}>
      <GameTopBar />
      <div className="relative z-1 flex flex-col items-center gap-6 w-full max-w-[520px] overflow-y-auto max-h-[calc(100vh-120px)] p-6 scrollbar-thin">
        <h2 className="font-game text-[32px] text-primary text-shadow-bold">个人信息</h2>
        {profile && (
          <>
            <AvatarUpload avatarUrl={profile.user.avatarUrl} size={96} onUpload={handleAvatarUpload} />

            <div className="text-center">
              {editingNickname ? (
                <div className="flex items-center gap-2">
                  <input value={nickname} onChange={(e) => setNickname(e.target.value)}
                    className="glass-input w-40 text-sm" />
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
            </div>

            {/* Notification settings */}
            <NotificationSettings />

            {/* Password section */}
            <div className="glass-panel p-5 w-full">
              <h3 className="text-sm text-muted-foreground mb-3 flex items-center gap-1.5">
                <Lock size={14} /> 设置密码
              </h3>
              <div className="flex flex-col gap-2">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="新密码"
                  className="glass-input w-full text-sm" autoComplete="new-password" />
                <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="确认密码"
                  className="glass-input w-full text-sm" autoComplete="new-password" />
                {passwordMsg && (
                  <p className={`text-xs m-0 ${passwordMsg.includes('成功') ? 'text-uno-green' : 'text-destructive'}`}>{passwordMsg}</p>
                )}
                <Button variant="primary" size="sm" onClick={handleSetPassword} sound="click">保存密码</Button>
              </div>
            </div>

            {/* API Keys */}
            <div className="glass-panel p-5 w-full">
              <h3 className="text-sm text-muted-foreground mb-3 flex items-center gap-1.5">
                <Key size={14} /> API Keys
              </h3>
              <p className="text-xs text-muted-foreground mb-3">用于连接 MCP 客户端（如 Claude Code），让 AI 代你玩游戏</p>

              {newKeyFull && (
                <div className="mb-3 rounded-lg border border-uno-green/30 bg-uno-green/10 p-3">
                  <p className="text-xs text-uno-green mb-2">Key 已生成，请立即复制（仅显示一次）：</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-black/30 px-2 py-1 text-xs">{newKeyFull}</code>
                    <Button size="sm" variant="secondary" onClick={handleCopyKey} sound="click">
                      <Copy size={12} /> {keyCopied ? '已复制' : ''}
                    </Button>
                  </div>
                  {keyCopied && (
                    <button onClick={handleDismissKey} className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      我已保存，关闭此提示
                    </button>
                  )}
                </div>
              )}

              {keyError && (
                <p className="text-xs text-destructive mb-2">{keyError}</p>
              )}

              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Key 名称（如：我的 Claude）"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={50}
                  className="glass-input w-full text-sm flex-1"
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
                      <button onClick={() => handleDeleteKey(k.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="删除 Key">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </>
        )}
        <Button variant="ghost" onClick={() => navigate('/lobby')} sound="click">返回大厅</Button>
      </div>
    </GamePageShell>
  );
}

const NOTIFICATION_LABELS: { key: NotificationEventType; label: string }[] = [
  { key: 'gameStart', label: '游戏开始' },
  { key: 'myTurn', label: '轮到我出牌' },
  { key: 'gameEnd', label: '游戏结束' },
  { key: 'kicked', label: '被踢出房间' },
  { key: 'roomDissolved', label: '房间解散' },
];

function NotificationSettings() {
  const { preferences, setPreference } = useNotificationStore();
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  const handleRequest = async () => {
    if (typeof Notification !== 'undefined') {
      await Notification.requestPermission();
    }
  };

  return (
    <div className="glass-panel p-5 w-full">
      <h3 className="text-sm text-muted-foreground mb-3 flex items-center gap-1.5">
        <Bell size={14} /> 通知设置
      </h3>

      {permission !== 'granted' && (
        <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
          {permission === 'denied' ? (
            <p className="text-xs text-destructive/80">
              通知权限已被拒绝，请在浏览器地址栏左侧的网站设置中手动开启。
            </p>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">尚未开启通知权限</p>
              <button onClick={handleRequest} className="text-xs font-bold text-accent hover:opacity-80 transition-opacity">
                开启
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {NOTIFICATION_LABELS.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between cursor-pointer">
            <span className="text-sm">{label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={preferences[key]}
              onClick={() => setPreference(key, !preferences[key])}
              className={`relative h-5 w-9 rounded-full transition-colors ${preferences[key] ? 'bg-accent' : 'bg-white/15'}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${preferences[key] ? 'translate-x-4' : ''}`} />
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}
