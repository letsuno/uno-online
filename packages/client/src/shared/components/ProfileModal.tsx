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
import { useToastStore } from '@/shared/stores/toast-store';
import type { UserRole } from '@uno-online/shared';

interface ProfileData {
  user: {
    id: string;
    username: string;
    nickname: string;
    avatarUrl: string | null;
    githubId: string | null;
    role: UserRole;
  };
}

const TABS = [
  { id: 'notification', icon: Bell, label: '通知' },
  { id: 'security', icon: Lock, label: '安全' },
  { id: 'apikeys', icon: Key, label: 'API Keys' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** 内容区块：统一的分组卡片外观 */
const SECTION_CLS = 'rounded-2xl p-6 max-md:p-5 mb-4 bg-white/[0.035] border border-white/[0.10]';

function SectionTitle({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-bold text-foreground mb-3">
      <Icon size={16} className="text-primary" /> {children}
    </h2>
  );
}

export default function ProfileModal() {
  const isOpen = useProfileModalStore(s => s.isOpen);
  const close = useProfileModalStore(s => s.close);

  const { user, setUser } = useAuthStore();
  const userId = user?.id;
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
    let cancelled = false;
    setProfile(null);
    setApiKeys([]);
    setPasskeys([]);
    setKeyError('');
    setPasskeyError('');
    if (!userId) {
      close();
      return;
    }

    void apiGet<ProfileData>('/profile')
      .then(p => {
        if (cancelled) return;
        setProfile(p);
        setNickname(p.user.nickname);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        useToastStore.getState().addToast(error instanceof Error ? error.message : '个人资料加载失败', 'error');
        close();
      });
    void apiGet<typeof apiKeys>('/api-keys')
      .then(keys => {
        if (!cancelled) setApiKeys(keys);
      })
      .catch((error: unknown) => {
        if (!cancelled) setKeyError(error instanceof Error ? error.message : 'API Key 加载失败');
      });
    if (browserSupportsWebAuthn()) {
      void useAuthStore
        .getState()
        .getPasskeys()
        .then(items => {
          if (!cancelled) setPasskeys(items);
        })
        .catch((error: unknown) => {
          if (!cancelled) setPasskeyError(error instanceof Error ? error.message : 'Passkey 加载失败');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [close, isOpen, userId]);

  const handleSaveNickname = async () => {
    setSaving(true);
    try {
      await apiPatch('/profile', { nickname });
      setProfile(p => (p ? { ...p, user: { ...p.user, nickname } } : p));
      if (user) setUser({ ...user, nickname });
      setEditingNickname(false);
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : '昵称保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (dataUrl: string) => {
    try {
      const res = await apiPost<{ avatarUrl: string | null }>('/profile/avatar', { avatar: dataUrl });
      const url = res.avatarUrl;
      setProfile(p => (p ? { ...p, user: { ...p.user, avatarUrl: url } } : p));
      if (user) setUser({ ...user, avatarUrl: url });
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : '头像保存失败', 'error');
    }
  };

  const handleSetPassword = async () => {
    if (password.length < 8) {
      setPasswordMsg('密码至少 8 位，需包含字母和数字');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setPasswordMsg('密码必须同时包含字母和数字');
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordMsg('两次密码不一致');
      return;
    }
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
      const result = await apiPost<{ id: string; key: string; name: string; createdAt: string }>('/api-keys', {
        name: newKeyName.trim(),
      });
      setNewKeyFull(result.key);
      setKeyCopied(false);
      setApiKeys(prev => [
        { id: result.id, name: result.name, keyPreview: `${result.key.slice(0, 11)}...`, createdAt: result.createdAt },
        ...prev,
      ]);
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
    if (
      !(await showConfirm({
        title: '删除 API Key',
        message: '删除后使用该 Key 的 MCP 客户端将无法连接，确定吗？',
        confirmText: '删除',
        variant: 'danger',
      }))
    )
      return;
    try {
      await apiDelete(`/api-keys/${id}`);
      setApiKeys(prev => prev.filter(k => k.id !== id));
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
      setPasskeys(prev => [passkey, ...prev]);
      setNewPasskeyName('');
      setPasskeySuccess('Passkey 添加成功');
    } catch (err) {
      setPasskeyError((err as Error).message || '添加失败');
    } finally {
      setRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (
      !(await showConfirm({
        title: '删除 Passkey',
        message: '删除后将无法使用该 Passkey 登录，确定吗？',
        confirmText: '删除',
        variant: 'danger',
      }))
    )
      return;
    try {
      await useAuthStore.getState().deletePasskey(id);
      setPasskeys(prev => prev.filter(pk => pk.id !== id));
    } catch (err) {
      setPasskeyError((err as Error).message || '删除失败');
    }
  };

  const profileRoleColor = getRoleColor(profile?.user.role);

  const nicknameBlock = (
    <>
      {editingNickname ? (
        <div className="flex items-center gap-2 justify-center">
          <Input inputSize="sm" className="w-32" value={nickname} onChange={e => setNickname(e.target.value)} />
          <Button variant="primary" size="sm" onClick={handleSaveNickname} disabled={saving} sound="click">
            <Save size={14} />
          </Button>
        </div>
      ) : (
        <p
          className="text-primary text-[21px] font-black cursor-pointer inline-flex items-center gap-1.5 group"
          onClick={() => setEditingNickname(true)}
          title="修改昵称"
          style={profileRoleColor ? { color: profileRoleColor } : undefined}
        >
          {profile?.user.nickname}
          <Edit3 size={13} className="text-muted-foreground group-hover:text-foreground transition-colors" />
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-0.5">@{profile?.user.username}</p>
    </>
  );

  return (
    <Modal open={isOpen} onClose={close} width={900} className="h-[min(620px,calc(100svh-80px))] overflow-hidden">
      {/* 全出血布局：抵消 Modal 内容区内边距，保持左右分栏结构 */}
      <div className="absolute inset-0 grid grid-cols-[236px_1fr] max-md:grid-cols-1">
        {/* Left: Sidebar */}
        <div className="border-r border-white/[0.08] px-4 py-7 bg-white/[0.025] flex flex-col max-md:hidden overflow-y-auto scrollbar-thin shrink-0">
          {profile && (
            <div className="text-center mb-7">
              <div className="flex justify-center">
                <AvatarUpload avatarUrl={profile.user.avatarUrl} size={84} onUpload={handleAvatarUpload} />
              </div>
              <div className="mt-3.5">{nicknameBlock}</div>
            </div>
          )}

          {/* Tab navigation */}
          <nav className="flex flex-col gap-1">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all text-left cursor-pointer border',
                  activeTab === id
                    ? 'bg-primary/10 text-primary border-primary/28'
                    : 'text-muted-foreground border-transparent hover:bg-white/[0.04] hover:text-foreground',
                )}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right: Settings main */}
        <div className="relative p-[22px_30px_28px] max-md:p-[16px_16px_32px] overflow-y-auto scrollbar-thin">
          {/* Desktop pane header：当前 Tab 名 + 关闭，不再悬浮压内容 */}
          <div className="flex max-md:hidden items-center justify-between mb-4">
            {(() => {
              const tab = TABS.find(t => t.id === activeTab)!;
              const Icon = tab.icon;
              return (
                <h1 className="flex items-center gap-2.5 text-lg font-black text-foreground">
                  <Icon size={18} className="text-primary" /> {tab.label}
                </h1>
              );
            })()}
            <IconButton size="md" onClick={close} title="关闭">
              <X size={20} />
            </IconButton>
          </div>

          {/* Mobile header */}
          <div className="hidden max-md:flex items-center gap-2 mb-4">
            <IconButton size="md" onClick={close} title="返回">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="m15 18-6-6 6-6" />
              </svg>
            </IconButton>
            <h1 className="text-lg font-black">个人信息</h1>
          </div>

          {/* Mobile profile card */}
          {profile && (
            <div className="hidden max-md:flex items-center gap-4 rounded-2xl p-4 mb-3.5 border border-white/[0.10] bg-white/[0.035]">
              <AvatarUpload avatarUrl={profile.user.avatarUrl} size={64} onUpload={handleAvatarUpload} />
              <div className="min-w-0 [&_p]:text-left">{nicknameBlock}</div>
            </div>
          )}

          {/* Mobile tab bar */}
          <div className="hidden max-md:flex gap-2 mb-3.5 overflow-x-auto scrollbar-hidden">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-all cursor-pointer border',
                  activeTab === id
                    ? 'bg-primary/[0.12] text-primary border-primary/32'
                    : 'text-muted-foreground border-white/[0.10] bg-white/[0.03]',
                )}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Notification settings section */}
          {activeTab === 'notification' && <NotificationSettingsInline />}

          {/* Security section (Password + Passkey) */}
          {activeTab === 'security' && (
            <>
              <div className={SECTION_CLS}>
                <SectionTitle icon={Lock}>设置密码</SectionTitle>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="新密码"
                  className="mb-3"
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="确认密码"
                  className="mb-3"
                  autoComplete="new-password"
                />
                <div className="flex items-center justify-between gap-3">
                  <p
                    className={cn(
                      'text-xs min-w-0',
                      passwordMsg
                        ? passwordMsg.includes('成功')
                          ? 'text-uno-green'
                          : 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {passwordMsg || '至少 8 位，需包含字母和数字'}
                  </p>
                  <Button
                    variant="primary"
                    className="shrink-0 whitespace-nowrap"
                    onClick={handleSetPassword}
                    sound="click"
                  >
                    保存密码
                  </Button>
                </div>
              </div>

              {/* Passkey section */}
              {browserSupportsWebAuthn() && (
                <div className={SECTION_CLS}>
                  <SectionTitle icon={Fingerprint}>Passkey</SectionTitle>
                  <p className="text-[13px] text-muted-foreground mb-3.5 leading-relaxed">
                    绑定 Passkey 后可免密码登录，支持指纹、面容或安全密钥
                  </p>

                  {passkeyError && <p className="text-xs text-destructive mb-2">{passkeyError}</p>}
                  {passkeySuccess && <p className="text-xs text-uno-green mb-2">{passkeySuccess}</p>}

                  <div className="flex gap-2.5">
                    <Input
                      type="text"
                      placeholder="Passkey 名称（如：我的 MacBook）"
                      value={newPasskeyName}
                      onChange={e => setNewPasskeyName(e.target.value)}
                      maxLength={50}
                      className="flex-1"
                    />
                    <Button
                      variant="primary"
                      className="shrink-0"
                      onClick={handleRegisterPasskey}
                      disabled={registeringPasskey || !newPasskeyName.trim()}
                      sound="click"
                    >
                      {registeringPasskey ? '注册中...' : '添加'}
                    </Button>
                  </div>

                  {passkeys.length > 0 && (
                    <div className="flex flex-col gap-2 mt-4">
                      {passkeys.map(pk => (
                        <div
                          key={pk.id}
                          className="flex items-center justify-between rounded-[14px] border border-white/[0.10] px-4 py-3 bg-white/[0.02]"
                        >
                          <div>
                            <span className="text-sm font-medium">{pk.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {new Date(pk.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeletePasskey(pk.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="删除 Passkey"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* API Keys section */}
          {activeTab === 'apikeys' && (
            <div className={SECTION_CLS}>
              <p className="text-[13px] text-muted-foreground mb-3.5 leading-relaxed">
                用于连接 MCP 客户端（如 Claude Code），让 AI 代你玩游戏
              </p>

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
                    <button
                      onClick={handleDismissKey}
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      我已保存，关闭此提示
                    </button>
                  )}
                </div>
              )}

              {keyError && <p className="text-xs text-destructive mb-2">{keyError}</p>}

              <div className="flex gap-2.5">
                <Input
                  type="text"
                  placeholder="Key 名称（如：我的 Claude）"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  maxLength={50}
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  className="shrink-0"
                  onClick={handleCreateKey}
                  disabled={creatingKey || !newKeyName.trim()}
                  sound="click"
                >
                  生成 Key
                </Button>
              </div>

              {apiKeys.length > 0 && (
                <div className="flex flex-col gap-2 mt-4">
                  {apiKeys.map(k => (
                    <div
                      key={k.id}
                      className="flex items-center justify-between rounded-[14px] border border-white/[0.10] px-4 py-3 bg-white/[0.02]"
                    >
                      <div>
                        <span className="text-sm font-medium">{k.name}</span>
                        <code className="ml-2 text-xs text-muted-foreground">{k.keyPreview}</code>
                      </div>
                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="删除 Key"
                      >
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
      try {
        await Notification.requestPermission();
      } catch (error) {
        useToastStore.getState().addToast(error instanceof Error ? error.message : '通知权限请求失败', 'error');
      }
    }
  };

  return (
    <div className={SECTION_CLS}>
      <p className="text-[13px] text-muted-foreground mb-2 leading-relaxed">
        切到其他窗口时，以下事件会推送桌面通知提醒你
      </p>

      {permission !== 'granted' && (
        <div className="mb-4 rounded-[14px] border border-primary/26 bg-primary/[0.06] px-4 py-3">
          {permission === 'denied' ? (
            <p className="text-sm text-destructive/80">通知权限已被拒绝，请在浏览器地址栏左侧的网站设置中手动开启。</p>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">尚未开启通知权限</p>
              <button
                onClick={handleRequest}
                className="text-sm font-bold text-primary hover:opacity-80 transition-opacity"
              >
                开启
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col">
        {NOTIFICATION_LABELS.map(({ key, label }) => (
          <label
            key={key}
            className="flex items-center justify-between cursor-pointer min-h-[46px] border-b border-white/[0.07] last:border-b-0 text-[15px]"
          >
            <span>{label}</span>
            <Switch checked={preferences[key]} onChange={checked => setPreference(key, checked)} label={label} />
          </label>
        ))}
      </div>
    </div>
  );
}
