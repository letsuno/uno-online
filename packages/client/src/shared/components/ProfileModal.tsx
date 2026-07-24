import { useEffect, useState } from 'react';
import { Edit3, Save, Lock, Key, Copy, Trash2, Bell, X, Fingerprint } from 'lucide-react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/shared/api';
import { getRoleColor, cn } from '@/shared/lib/utils';
import AvatarUpload from '@/features/auth/components/AvatarUpload';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { IconButton } from '@/shared/components/ui/IconButton';
import { Switch } from '@/shared/components/ui/Switch';
import Modal from '@/shared/components/ui/Modal';
import { useNotificationStore, type NotificationEventType } from '@/shared/stores/notification-store';
import { useProfileModalStore } from '@/shared/stores/profile-modal-store';
import { showConfirm } from '@/shared/stores/confirm-store';

interface ProfileData {
  user: { id: string; username: string; nickname: string; avatarUrl: string | null; githubId?: string | null; role?: string };
}

const TABS = [
  { id: 'notification', icon: Bell, label: '通知' },
  { id: 'security', icon: Lock, label: '安全' },
  { id: 'apikeys', icon: Key, label: 'API Keys' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ProfileModal() {
  const isOpen = useProfileModalStore((s) => s.isOpen);
  const close = useProfileModalStore((s) => s.close);

  const { user, setUser } = useAuthStore();
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
  const [passkeys, setPasskeys] = useState<{ id: string; name: string; createdAt: string }[]>([]);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeySuccess, setPasskeySuccess] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('notification');

  useEffect(() => {
    if (!isOpen) return;
    apiGet<ProfileData>('/profile').then((p) => {
      setProfile(p);
      setNickname(p.user.nickname);
    }).catch(() => close());
    apiGet<typeof apiKeys>('/api-keys').then(setApiKeys).catch(() => {});
    if (browserSupportsWebAuthn()) {
      useAuthStore.getState().getPasskeys().then(setPasskeys).catch(() => {});
    }
  }, [isOpen]);

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
    if (password.length < 8) { setPasswordMsg('密码至少 8 位，需包含字母和数字'); return; }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) { setPasswordMsg('密码必须同时包含字母和数字'); return; }
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
    if (!(await showConfirm({
      title: '删除 API Key',
      message: '删除后使用该 Key 的 MCP 客户端将无法连接，确定吗？',
      confirmText: '删除',
      variant: 'danger',
    }))) return;
    try {
      await apiDelete(`/api-keys/${id}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setKeyError((err as Error).message || '删除失败');
    }
  };

  const handleRegisterPasskey = async () => {
    if (!newPasskeyName.trim()) return;
    setRegisteringPasskey(true);
    setPasskeyError('');
    setPasskeySuccess('');
    try {
      const passkey = await useAuthStore.getState().registerPasskey(newPasskeyName.trim());
      setPasskeys((prev) => [passkey, ...prev]);
      setNewPasskeyName('');
      setPasskeySuccess('Passkey 添加成功');
    } catch (err) {
      setPasskeyError((err as Error).message || '添加失败');
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!(await showConfirm({
      title: '删除 Passkey',
      message: '删除后将无法使用该 Passkey 登录，确定吗？',
      confirmText: '删除',
      variant: 'danger',
    }))) return;
    try {
      await useAuthStore.getState().deletePasskey(id);
      setPasskeys((prev) => prev.filter((pk) => pk.id !== id));
    } catch (err) {
      setPasskeyError((err as Error).message || '删除失败');
    }
  };

  const profileRoleColor = getRoleColor(profile?.user.role);

  const nicknameBlock = (
    <>
      {editingNickname ? (
        <div className="flex items-center gap-2 justify-center">
          <Input inputSize="sm" className="w-32" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          <Button variant="primary" size="sm" onClick={handleSaveNickname} disabled={saving} sound="click">
            <Save size={14} />
          </Button>
        </div>
      ) : (
        <p className="text-primary text-[30px] font-black cursor-pointer inline-flex items-center gap-2"
          onClick={() => setEditingNickname(true)}
          style={profileRoleColor ? { color: profileRoleColor } : undefined}>
          {profile?.user.nickname}
          <Edit3 size={16} className="text-muted-foreground" />
        </p>
      )}
      <p className="text-muted-foreground mt-1">@{profile?.user.username}</p>
    </>
  );

  return (
    <Modal
      open={isOpen}
      onClose={close}
      width={1110}
      className="h-[min(820px,calc(100svh-80px))] overflow-hidden"
    >
      {/* 全出血布局：抵消 Modal 内容区内边距，保持左右分栏结构 */}
      <div className="absolute inset-0 grid grid-cols-[270px_1fr] max-md:grid-cols-1">
        {/* Left: Sidebar */}
        <div className="border-r border-white/[0.08] p-[34px_22px] bg-white/[0.025] flex flex-col max-md:hidden overflow-y-auto scrollbar-thin shrink-0">
          <div className="self-stretch flex items-center gap-3 text-[26px] font-black mb-8">
            <span className="text-primary">♠</span>
            <span>设置</span>
          </div>

          {profile && (
            <div className="text-center mb-8">
              <div className="flex justify-center">
                <AvatarUpload avatarUrl={profile.user.avatarUrl} size={100} onUpload={handleAvatarUpload} />
              </div>
              <div className="mt-[18px]">{nicknameBlock}</div>
            </div>
          )}

          {/* Tab navigation */}
          <nav className="flex flex-col gap-1">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-[14px] text-[15px] font-bold transition-all text-left cursor-pointer border',
                  activeTab === id
                    ? 'bg-primary/10 text-primary border-primary/28'
                    : 'text-muted-foreground border-transparent hover:bg-white/[0.04] hover:text-foreground',
                )}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={close} sound="click">关闭</Button>
        </div>

        {/* Right: Settings main */}
        <div className="relative p-[42px_34px_36px] max-md:p-[22px_18px_36px] overflow-y-auto scrollbar-thin">
          {/* Close button */}
          <IconButton
            size="md"
            onClick={close}
            title="关闭"
            className="absolute top-6 right-6 max-md:hidden"
          >
            <X size={20} />
          </IconButton>

          {/* Mobile header */}
          <div className="hidden max-md:flex items-center justify-between mb-[26px]">
            <IconButton size="lg" active onClick={close} title="返回">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m15 18-6-6 6-6"/></svg>
            </IconButton>
            <h1 className="text-[34px] font-black">设置</h1>
            <div className="w-14" />
          </div>

          {/* Mobile profile card */}
          {profile && (
            <div className="hidden max-md:flex items-center gap-[22px] rounded-[24px] p-[26px_24px] mb-[18px] border border-primary/22 bg-white/[0.035]">
              <AvatarUpload avatarUrl={profile.user.avatarUrl} size={92} onUpload={handleAvatarUpload} />
              <div>{nicknameBlock}</div>
            </div>
          )}

          {/* Mobile tab bar */}
          <div className="hidden max-md:flex gap-2 mb-[18px] overflow-x-auto scrollbar-thin">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all cursor-pointer border',
                  activeTab === id
                    ? 'bg-primary/[0.12] text-primary border-primary/32'
                    : 'text-muted-foreground border-white/[0.10] bg-white/[0.03]',
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Notification settings section */}
          {activeTab === 'notification' && <NotificationSettingsInline />}

          {/* Security section (Password + Passkey) */}
          {activeTab === 'security' && <>
          <div className="rounded-[22px] p-[22px_26px_26px] mb-[18px] bg-white/[0.035] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <h2 className="flex items-center gap-3 text-foreground text-[22px] font-black mb-4">
              <Lock size={22} /> 设置密码
            </h2>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="新密码"
              className="mb-3" autoComplete="new-password" />
            <Input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="确认密码"
              className="mb-3" autoComplete="new-password" />
            {passwordMsg && (
              <p className={cn('text-xs mb-3', passwordMsg.includes('成功') ? 'text-uno-green' : 'text-destructive')}>{passwordMsg}</p>
            )}
            <Button variant="game" className="w-full h-[58px] text-base tracking-[0.08em]" onClick={handleSetPassword} sound="click">保存密码</Button>
          </div>

          {/* Passkey section */}
          {browserSupportsWebAuthn() && (
            <div className="rounded-[22px] p-[22px_26px_26px] mb-[18px] bg-white/[0.035] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <h2 className="flex items-center gap-3 text-foreground text-[22px] font-black mb-4">
                <Fingerprint size={22} /> Passkey
              </h2>
              <p className="text-foreground/80 mb-3.5 leading-[1.7]">绑定 Passkey 后可免密码登录，支持指纹、面容或安全密钥</p>

              {passkeyError && <p className="text-xs text-destructive mb-2">{passkeyError}</p>}
              {passkeySuccess && <p className="text-xs text-uno-green mb-2">{passkeySuccess}</p>}

              <Input
                type="text"
                placeholder="Passkey 名称（如：我的 MacBook）"
                value={newPasskeyName}
                onChange={(e) => setNewPasskeyName(e.target.value)}
                maxLength={50}
                className="mb-3"
              />
              <Button
                variant="game"
                className="w-full h-[58px] text-base tracking-[0.08em]"
                onClick={handleRegisterPasskey}
                disabled={registeringPasskey || !newPasskeyName.trim()}
                sound="click"
              >
                {registeringPasskey ? '注册中...' : '添加 Passkey'}
              </Button>

              {passkeys.length > 0 && (
                <div className="flex flex-col gap-2 mt-4">
                  {passkeys.map((pk) => (
                    <div key={pk.id} className="flex items-center justify-between rounded-[14px] border border-white/[0.10] px-4 py-3 bg-white/[0.02]">
                      <div>
                        <span className="text-sm font-medium">{pk.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{new Date(pk.createdAt).toLocaleDateString()}</span>
                      </div>
                      <button onClick={() => handleDeletePasskey(pk.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="删除 Passkey">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          </>}

          {/* API Keys section */}
          {activeTab === 'apikeys' && (
          <div className="rounded-[22px] p-[22px_26px_26px] mb-[18px] bg-white/[0.035] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <h2 className="flex items-center gap-3 text-foreground text-[22px] font-black mb-4">
              <Key size={22} /> API Keys
            </h2>
            <p className="text-foreground/80 mb-3.5 leading-[1.7]">用于连接 MCP 客户端（如 Claude Code），让 AI 代你玩游戏</p>

            {newKeyFull && (
              <div className="mb-3 rounded-[14px] border border-uno-green/30 bg-uno-green/10 p-4">
                <p className="text-xs text-uno-green mb-2">Key 已生成，请立即复制（仅显示一次）：</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-black/30 px-3 py-1.5 text-xs">{newKeyFull}</code>
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

            <Input
              type="text"
              placeholder="Key 名称（如：我的 Claude）"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              maxLength={50}
              className="mb-3"
            />
            <Button variant="game" className="w-full h-[58px] text-base tracking-[0.08em]" onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()} sound="click">
              生成 Key
            </Button>

            {apiKeys.length > 0 && (
              <div className="flex flex-col gap-2 mt-4">
                {apiKeys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between rounded-[14px] border border-white/[0.10] px-4 py-3 bg-white/[0.02]">
                    <div>
                      <span className="text-sm font-medium">{k.name}</span>
                      <code className="ml-2 text-xs text-muted-foreground">{k.keyPreview}</code>
                    </div>
                    <button onClick={() => handleDeleteKey(k.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="删除 Key">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* -- Notification settings (inline, no glass-panel wrapper) -- */

const NOTIFICATION_LABELS: { key: NotificationEventType; label: string }[] = [
  { key: 'gameStart', label: '游戏开始' },
  { key: 'myTurn', label: '轮到我出牌' },
  { key: 'gameEnd', label: '游戏结束' },
  { key: 'kicked', label: '被踢出房间' },
  { key: 'roomDissolved', label: '房间解散' },
];

function NotificationSettingsInline() {
  const { preferences, setPreference } = useNotificationStore();
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  const handleRequest = async () => {
    if (typeof Notification !== 'undefined') {
      await Notification.requestPermission();
    }
  };

  return (
    <div className="rounded-[22px] p-[22px_26px_26px] mb-[18px] bg-white/[0.035] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <h2 className="flex items-center gap-3 text-foreground text-[22px] font-black mb-4">
        <Bell size={22} /> 通知设置
      </h2>

      {permission !== 'granted' && (
        <div className="mb-4 rounded-[14px] border border-primary/26 bg-primary/[0.06] px-4 py-3">
          {permission === 'denied' ? (
            <p className="text-sm text-destructive/80">
              通知权限已被拒绝，请在浏览器地址栏左侧的网站设置中手动开启。
            </p>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">尚未开启通知权限</p>
              <button onClick={handleRequest} className="text-sm font-bold text-primary hover:opacity-80 transition-opacity">
                开启
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col">
        {NOTIFICATION_LABELS.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between cursor-pointer min-h-[48px] border-b border-white/[0.07] last:border-b-0 text-[17px]">
            <span>{label}</span>
            <Switch
              checked={preferences[key]}
              onChange={(checked) => setPreference(key, checked)}
              label={label}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
