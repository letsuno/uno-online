import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, type BindInfo } from '../stores/auth-store';
import { Button } from '@/shared/components/ui/Button';
import GamePageShell from '@/shared/components/GamePageShell';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { login, bindGithub } = useAuthStore();
  const navigate = useNavigate();
  const [bindInfo, setBindInfo] = useState<BindInfo | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const code = params.get('code');
    if (!code) { navigate('/'); return; }
    const savedTarget = sessionStorage.getItem('loginRedirect') || '/';
    sessionStorage.removeItem('loginRedirect');
    login(code)
      .then((result) => {
        if (result.needsBind) {
          setBindInfo(result.needsBind);
        } else if (result.isNewUser) {
          navigate('/profile/setup');
        } else {
          navigate(savedTarget);
        }
      })
      .catch(() => navigate('/'));
  }, []);

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bindInfo || !password) return;
    setError('');
    setSubmitting(true);
    try {
      await bindGithub(bindInfo.username, password, bindInfo.githubId, bindInfo.githubAvatarUrl);
      navigate(sessionStorage.getItem('loginRedirect') || '/');
    } catch (err) {
      setError((err as Error).message || '绑定失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (bindInfo) {
    return (
      <GamePageShell>
        <div className="relative z-1 flex flex-col items-center justify-center text-center">
          <h1 className="font-game text-[36px] text-primary text-shadow-bold">绑定账号</h1>
          <p className="mt-3 text-muted-foreground text-sm max-w-[400px]">
            用户名 <strong className="text-foreground">{bindInfo.username}</strong> 已存在。输入该账号的密码即可绑定 GitHub 登录。
          </p>

          <form onSubmit={handleBind} className="mt-8 flex flex-col gap-3 w-[400px]">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="输入账号密码"
              className="glass-input w-full text-foreground"
              autoFocus
              autoComplete="current-password"
            />
            {error && <p className="text-sm text-destructive m-0">{error}</p>}
            <Button type="submit" variant="game" className="w-full" disabled={submitting} sound="click">
              {submitting ? '绑定中...' : '确认绑定'}
            </Button>
          </form>

          <button
            onClick={() => navigate('/')}
            className="mt-5 bg-transparent border-none text-muted-foreground text-sm cursor-pointer hover:text-foreground transition-colors"
          >
            取消
          </button>
        </div>
      </GamePageShell>
    );
  }

  return (
    <GamePageShell>
      <div className="relative z-1 flex flex-col items-center justify-center text-center">
        <p className="text-lg text-muted-foreground">登录中...</p>
      </div>
    </GamePageShell>
  );
}
