import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import AvatarUpload from '../components/AvatarUpload';
import { Button } from '@/shared/components/ui/Button';

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

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-5">
      <h2 className="font-game text-[32px] text-primary mb-6">注册</h2>

      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-3.5 w-[300px]">
        <AvatarUpload avatarUrl={avatar} size={80} onUpload={setAvatar} />

        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名（登录用）"
          className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground" required />
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="昵称（游戏中显示，可选）"
          className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码（至少 6 位）"
          className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground" required />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="确认密码"
          className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground" required />

        {error && <p className="text-sm text-destructive m-0">{error}</p>}

        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          <UserPlus size={18} className="inline-block align-middle mr-1.5" />
          {submitting ? '注册中...' : '注册'}
        </Button>
      </form>

      <div className="mt-5 flex flex-col items-center gap-2">
        <Link to="/" className="text-muted-foreground text-sm">已有账号？去登录</Link>
      </div>
    </div>
  );
}
