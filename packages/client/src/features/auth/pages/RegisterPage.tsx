import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import AvatarUpload from '../components/AvatarUpload';
import { Button } from '@/shared/components/ui/Button';
import GamePageShell from '@/shared/components/GamePageShell';

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
      navigate('/');
    } catch (err) {
      setError((err as Error).message || '注册失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GamePageShell>
      <div className="relative z-1 flex flex-col items-center justify-center text-center">
        <h1 className="font-game text-[40px] text-primary text-shadow-bold">注册</h1>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col items-center gap-4 w-[400px]">
          <AvatarUpload avatarUrl={avatar} size={80} onUpload={setAvatar} />

          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名（登录用）"
            className="glass-input w-full text-foreground"
            required
          />
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="昵称（游戏中显示，可选）"
            className="glass-input w-full text-foreground"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（至少 6 位）"
            className="glass-input w-full text-foreground"
            required
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="确认密码"
            className="glass-input w-full text-foreground"
            required
          />

          {error && <p className="text-sm text-destructive m-0">{error}</p>}

          <Button type="submit" variant="game" className="w-full" disabled={submitting} sound="click">
            {submitting ? '注册中...' : '注册'}
          </Button>
        </form>

        <Link to="/" className="mt-6 text-muted-foreground text-sm hover:text-foreground transition-colors">
          已有账号？去登录
        </Link>
      </div>
    </GamePageShell>
  );
}
