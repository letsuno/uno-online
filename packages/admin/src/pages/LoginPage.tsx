import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuthStore } from '@/stores/auth-store';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, devLogin, loadConfig, devMode, loading, error, configLoading, configError } = useAuthStore();

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (devMode === null) return;
    if (devMode) await devLogin(username);
    else await login(username, password);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <section className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-xl font-semibold text-slate-100">UNO 管理后台</h1>
        <p className="mt-1 text-sm text-slate-500">
          {devMode === null ? '正在读取登录配置…' : devMode ? '开发模式' : '管理员登录'}
        </p>

        {(configError ?? error) && (
          <div className="mt-4 rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
            {configError ?? error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm text-slate-300">
              用户名
            </label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </div>

          {devMode === false && (
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm text-slate-300">
                密码
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          )}

          <Button type="submit" disabled={loading || configLoading || devMode === null} className="w-full">
            {configLoading ? '读取配置中…' : loading ? '登录中…' : '登录'}
          </Button>
          {configError && (
            <Button type="button" variant="secondary" className="w-full" onClick={() => void loadConfig()}>
              重试
            </Button>
          )}
        </form>
      </section>
    </main>
  );
}
