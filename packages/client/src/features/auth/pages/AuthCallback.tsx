import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, type BindInfo } from '../stores/auth-store';
import { LogIn, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

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
    const savedTarget = sessionStorage.getItem('loginRedirect') || '/lobby';
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
      navigate(sessionStorage.getItem('loginRedirect') || '/lobby');
    } catch (err) {
      setError((err as Error).message || '绑定失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (bindInfo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-5">
        <LinkIcon size={32} className="text-primary mb-4" />
        <h2 className="font-game text-2xl text-primary mb-2">绑定账号</h2>
        <p className="text-muted-foreground text-sm mb-5 text-center max-w-[360px]">
          用户名 <strong>{bindInfo.username}</strong> 已存在。输入该账号的密码即可绑定 GitHub 登录。
        </p>
        <form onSubmit={handleBind} className="flex flex-col gap-2.5 w-[280px]">
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="输入账号密码"
            className="w-full rounded-xl border-2 border-white/15 bg-card px-3.5 py-2.5 text-base text-foreground"
            autoFocus autoComplete="current-password" />
          {error && <p className="text-sm text-destructive m-0">{error}</p>}
          <Button type="submit" variant="primary" disabled={submitting}>
            <LogIn size={18} className="inline-block align-middle mr-1.5" />
            {submitting ? '绑定中...' : '确认绑定'}
          </Button>
        </form>
        <button onClick={() => navigate('/')} className="mt-4 bg-transparent border-none text-muted-foreground text-sm cursor-pointer underline">
          取消
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-lg text-muted-foreground">登录中...</p>
    </div>
  );
}
