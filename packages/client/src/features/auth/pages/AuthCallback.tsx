import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, type BindInfo } from '../stores/auth-store';
import { useToastStore } from '@/shared/stores/toast-store';
import AuthLayout from '../components/AuthLayout';
import SpinningCard from '../components/SpinningCard';
import { Button } from '@/shared/components/ui/Button';
import { useBgm } from '@/shared/sound/useBgm';

const STATUS_MESSAGES = [
  '正在与 GitHub 验证...',
  '拉取用户信息...',
  '登录成功，跳转中...',
];

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { login, bindGithub } = useAuthStore();
  const navigate = useNavigate();
  const [bindInfo, setBindInfo] = useState<BindInfo | null>(null);
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);

  useBgm('lobby');

  // 状态文字按 600ms 间隔递进，给短暂 callback 添加视觉反馈
  useEffect(() => {
    if (bindInfo) return;  // 进入绑定分支后不再切换状态文字
    const t1 = setTimeout(() => setStatusIdx(1), 600);
    const t2 = setTimeout(() => setStatusIdx(2), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [bindInfo]);

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
      .catch(() => {
        useToastStore.getState().addToast('登录失败，请重试', 'error');
        navigate('/');
      });
  }, []);

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bindInfo || !password) { setFieldError('请输入密码'); return; }
    setFieldError('');
    setSubmitting(true);
    try {
      await bindGithub(bindInfo.username, password, bindInfo.githubId, bindInfo.githubAvatarUrl);
      navigate(sessionStorage.getItem('loginRedirect') || '/');
    } catch (err) {
      useToastStore.getState().addToast((err as Error).message || '绑定失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 绑定分支
  if (bindInfo) {
    return (
      <AuthLayout title="账号已存在" subtitle="该用户名已被注册">
        <form onSubmit={handleBind} className="flex flex-col gap-4">
          <div className="rounded-lg bg-white/[0.03] border border-white/8 p-4 text-sm text-muted-foreground leading-relaxed">
            我们检测到 GitHub 用户名{' '}
            <strong className="text-foreground">{bindInfo.username}</strong>{' '}
            已经在 UNO Online 注册过。输入该账号的密码，即可关联到你的账号上，之后用 GitHub 一键登录。
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 tracking-wide">该账号密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldError(''); }}
              className="glass-input w-full text-foreground"
              autoFocus
              autoComplete="current-password"
            />
          </div>

          {fieldError && <p className="text-sm text-destructive m-0">{fieldError}</p>}

          <Button type="submit" variant="game" className="w-full" disabled={submitting} sound="click">
            {submitting ? '绑定中...' : '确认绑定'}
          </Button>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="bg-transparent border-none text-muted-foreground text-sm cursor-pointer hover:text-foreground transition-colors"
          >
            取消
          </button>
        </form>
      </AuthLayout>
    );
  }

  // 等待状态
  return (
    <AuthLayout showLogo={false}>
      <div className="flex flex-col items-center gap-8 py-8">
        <SpinningCard size={80} />
        <p className="text-sm text-muted-foreground tracking-[2px] uppercase">
          {STATUS_MESSAGES[statusIdx]}
        </p>
      </div>
    </AuthLayout>
  );
}
