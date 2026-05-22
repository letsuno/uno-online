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
      footer={<Link to="/" className="text-[var(--gold)] font-extrabold no-underline hover:opacity-80">已有账号？去登录</Link>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-[22px]">
        <div className="flex justify-center">
          <AvatarUpload avatarUrl={avatar} size={96} onUpload={setAvatar} />
        </div>

        <div>
          <label className="block text-[#dce5ff] text-[18px] font-bold mb-2.5">用户名（用于登录）</label>
          <div className="relative">
            <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--gold)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setFieldError(''); }}
              className="h-[68px] w-full rounded-[16px] border border-[rgba(127,154,225,0.32)] bg-[rgba(13,20,39,0.64)] text-foreground outline-0 pl-14 pr-5 text-base placeholder:text-[rgba(216,224,245,0.38)] focus:border-[rgba(246,190,62,0.6)] focus:shadow-[0_0_0_4px_rgba(246,190,62,0.10)] transition-all"
              required
              autoComplete="username"
            />
          </div>
        </div>

        <div>
          <label className="block text-[#dce5ff] text-[18px] font-bold mb-2.5">昵称（游戏中显示，可选）</label>
          <div className="relative">
            <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--gold)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21H3v-4L16.5 3.5Z"/></svg>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="留空则使用用户名"
              className="h-[68px] w-full rounded-[16px] border border-[rgba(127,154,225,0.32)] bg-[rgba(13,20,39,0.64)] text-foreground outline-0 pl-14 pr-5 text-base placeholder:text-[rgba(216,224,245,0.38)] focus:border-[rgba(246,190,62,0.6)] focus:shadow-[0_0_0_4px_rgba(246,190,62,0.10)] transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-[#dce5ff] text-[18px] font-bold mb-2.5">密码（至少 8 位，需包含字母和数字）</label>
          <div className="relative">
            <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--gold)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError(''); }}
              className="h-[68px] w-full rounded-[16px] border border-[rgba(127,154,225,0.32)] bg-[rgba(13,20,39,0.64)] text-foreground outline-0 pl-14 pr-5 text-base placeholder:text-[rgba(216,224,245,0.38)] focus:border-[rgba(246,190,62,0.6)] focus:shadow-[0_0_0_4px_rgba(246,190,62,0.10)] transition-all"
              required
              autoComplete="new-password"
            />
          </div>
        </div>

        <div>
          <label className="block text-[#dce5ff] text-[18px] font-bold mb-2.5">确认密码</label>
          <div className="relative">
            <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--gold)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            <input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setFieldError(''); }}
              className="h-[68px] w-full rounded-[16px] border border-[rgba(127,154,225,0.32)] bg-[rgba(13,20,39,0.64)] text-foreground outline-0 pl-14 pr-5 text-base placeholder:text-[rgba(216,224,245,0.38)] focus:border-[rgba(246,190,62,0.6)] focus:shadow-[0_0_0_4px_rgba(246,190,62,0.10)] transition-all"
              required
              autoComplete="new-password"
            />
          </div>
        </div>

        {turnstileSiteKey && (
          <Turnstile sitekey={turnstileSiteKey} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
        )}

        {fieldError && <p className="text-sm text-destructive m-0">{fieldError}</p>}

        <Button type="submit" variant="game" className="w-full h-[76px] text-2xl tracking-[0.35em] mt-1" disabled={submitting} sound="click">
          {submitting ? '注册中...' : '注 册'}
        </Button>
      </form>
    </AuthLayout>
  );
}
