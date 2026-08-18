import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { useAuthStore } from '@/stores/auth-store';
import LoginPage from '@/pages/LoginPage';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const RoomsPage = lazy(() => import('@/pages/RoomsPage'));
const AiPluginsPage = lazy(() => import('@/pages/AiPluginsPage'));

const navigation: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/dashboard', label: '概览', icon: 'dashboard' },
  { to: '/users', label: '用户', icon: 'users' },
  { to: '/rooms', label: '房间', icon: 'rooms' },
  { to: '/ai-plugins', label: 'AI 引擎', icon: 'ai' },
];

function Brand() {
  return <div className="text-base font-semibold text-slate-100">UNO 管理后台</div>;
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? 'flex min-w-max gap-1 px-3 pb-2' : 'space-y-1 px-2 py-3'} aria-label="管理后台导航">
      {navigation.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            mobile
              ? `flex items-center gap-2 rounded px-3 py-2 text-sm ${
                  isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              : `flex items-center gap-3 rounded px-3 py-2.5 text-sm ${
                  isActive
                    ? 'bg-slate-700 font-medium text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
          }
        >
          <Icon name={item.icon} className="h-5 w-5 shrink-0" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Layout() {
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const location = useLocation();
  const current = navigation.find(item => location.pathname.startsWith(item.to)) ?? navigation[0];

  return (
    <div className="min-h-screen bg-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-800 bg-slate-900 md:flex">
        <div className="border-b border-slate-800 px-5 py-4">
          <Brand />
        </div>
        <Navigation />
      </aside>

      <div className="md:pl-56">
        <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6">
            <div className="md:hidden">
              <Brand />
            </div>
            <h1 className="hidden text-base font-medium text-slate-100 md:block">{current.label}</h1>
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-400 sm:inline">{user?.nickname}</span>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                aria-label="退出登录"
              >
                <Icon name="logout" className="h-4 w-4" />
                <span className="hidden sm:inline">退出</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto md:hidden">
            <Navigation mobile />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
          <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">加载中…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const user = useAuthStore(state => state.user);
  const init = useAuthStore(state => state.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/ai-plugins" element={<AiPluginsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
