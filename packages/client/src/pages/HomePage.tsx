import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Spade } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import { GITHUB_CLIENT_ID, DEV_MODE } from '../env';

export default function HomePage() {
  const { user, token, loading, loadUser, devLogin } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [devUsername, setDevUsername] = useState('');
  const [error, setError] = useState('');
  const redirect = searchParams.get('redirect');

  const getRedirectTarget = () => redirect || sessionStorage.getItem('loginRedirect') || '/lobby';

  useEffect(() => {
    if (redirect) sessionStorage.setItem('loginRedirect', redirect);
  }, [redirect]);

  useEffect(() => {
    loadUser().then(() => {
      const u = useAuthStore.getState().user;
      if (u) {
        const target = getRedirectTarget();
        sessionStorage.removeItem('loginRedirect');
        navigate(target);
      }
    });
  }, []);

  const loginUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user`;

  const handleDevLogin = async () => {
    if (!devUsername.trim()) { setError('请输入用户名'); return; }
    setError('');
    try {
      await devLogin(devUsername.trim());
      const target = getRedirectTarget();
      sessionStorage.removeItem('loginRedirect');
      navigate(target);
    } catch {
      setError('登录失败');
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-5 text-center">
      <h1 className="font-game text-[48px] text-primary drop-shadow-[3px_4px_0px_rgba(0,0,0,0.3)]">
        <Spade size={36} className="inline-block align-middle" /> UNO Online
      </h1>
      <p className="max-w-[400px] text-lg text-muted-foreground">
        和朋友一起玩 UNO！支持 2-10 人在线对战、语音通话、自定义村规。
      </p>
      {!loading && !token && (
        DEV_MODE ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                value={devUsername}
                onChange={(e) => { setDevUsername(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
                placeholder="输入用户名"
                className="w-[200px] rounded-xl border-2 border-white/20 bg-card px-4 py-3 text-center text-lg text-foreground"
              />
              <button className="bg-primary text-primary-foreground px-6 py-3 rounded-3xl text-lg font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-105 active:scale-[0.97]" onClick={handleDevLogin}>
                <LogIn size={20} className="mr-1.5 inline-block align-middle" />登录
              </button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">开发模式</p>
          </div>
        ) : (
          <a href={loginUrl} className="bg-primary text-primary-foreground inline-flex items-center gap-2 px-8 py-3.5 rounded-3xl text-lg font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-105 active:scale-[0.97] no-underline">
            <LogIn size={20} /> GitHub 登录
          </a>
        )
      )}
      {loading && <p className="text-muted-foreground">加载中...</p>}
    </div>
  );
}
