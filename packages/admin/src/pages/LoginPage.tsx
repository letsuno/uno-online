import { useEffect, useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const {
    login,
    devLogin,
    loadConfig,
    devMode,
    loading,
    error,
    configLoading,
    configError,
  } = useAuthStore();

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (devMode === null) return;
    if (devMode) await devLogin(username);
    else await login(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
        <div className="p-6 pb-0 text-center">
          <h1 className="text-2xl font-bold text-white">UNO Admin</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {devMode === null
              ? '正在确认登录模式'
              : devMode
                ? '开发模式：输入任意名称进入管理后台'
                : '登录后访问管理后台'}
          </p>
        </div>
        <div className="p-6">
          {(configError ?? error) && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2 mb-4">
              {configError ?? error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="username" className="text-sm font-medium text-slate-300">
                用户名
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={devMode ? '输入任意名称' : '输入用户名'}
                required
                autoFocus
              />
            </div>

            {devMode === false && (
              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium text-slate-300">
                  密码
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  required
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || configLoading || devMode === null}
              className="w-full"
            >
              {configLoading
                ? '正在读取配置...'
                : loading
                  ? '正在登录...'
                  : devMode
                    ? '进入管理后台'
                    : '登录'}
            </Button>
            {configError && (
              <Button type="button" variant="secondary" className="w-full" onClick={() => void loadConfig()}>
                重新读取配置
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
