import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { apiGet } from '@/shared/api';
import AvatarUpload from '../components/AvatarUpload';
import AuthLayout from '../components/AuthLayout';
import { Button } from '@/shared/components/ui/Button';
import { useBgm } from '@/shared/sound/useBgm';
import { Turnstile } from 'react-turnstile';

export default function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useBgm('lobby');

  useEffect(() => {
    apiGet<{ turnstileSiteKey: string | null }>('/auth/config')
      .then((cfg) => setTurnstileSiteKey(cfg.turnstileSiteKey))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');
    if (!username.trim()) { setFieldError('请输入用户名'); return; }
    if (password.length < 8) { setFieldError('密码至少 8 位，需包含字母和数字'); return; }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) { setFieldError('密码必须同时包含字母和数字'); return; }
    if (password !== confirm) { setFieldError('两次密码不一致'); return; }
    setSubmitting(true);
    try {
      await register(username, password, nickname || username, avatar ?? undefined, turnstileToken ?? undefined);
      navigate('/');
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || '注册失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="注册"
      footer={<Link to="/" className="hover:text-foreground transition-colors">已有账号？去登录</Link>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex justify-center">
          <AvatarUpload avatarUrl={avatar} size={96} onUpload={setAvatar} />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">用户名（用于登录）</label>
          <input
            value={username}
            onChange={(e) => { setUsername(e.target.value); setFieldError(''); }}
            className="glass-input w-full text-foreground"
            required
            autoComplete="username"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">昵称（游戏中显示，可选）</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="glass-input w-full text-foreground"
            placeholder="留空则使用用户名"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">密码（至少 8 位，需包含字母和数字）</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFieldError(''); }}
            className="glass-input w-full text-foreground"
            required
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">确认密码</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setFieldError(''); }}
            className="glass-input w-full text-foreground"
            required
            autoComplete="new-password"
          />
        </div>

        {turnstileSiteKey && (
          <Turnstile sitekey={turnstileSiteKey} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
        )}

        {fieldError && <p className="text-sm text-destructive m-0">{fieldError}</p>}

        <Button type="submit" variant="game" className="w-full mt-1" disabled={submitting} sound="click">
          {submitting ? '注册中...' : '注 册'}
        </Button>
      </form>
    </AuthLayout>
  );
}
