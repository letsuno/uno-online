import { useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
        <div className="p-6 pb-0 text-center">
          <h1 className="text-2xl font-bold text-white">UNO Admin</h1>
          <p className="mt-1.5 text-sm text-slate-400">Sign in to access the admin panel</p>
        </div>
        <div className="p-6">
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="username" className="text-sm font-medium text-slate-300">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium text-slate-300">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
