import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import { authRoutes, authProtectedRoutes } from '@/features/auth/routes';
import { gameProtectedRoutes } from '@/features/game/routes';
import { profileProtectedRoutes } from '@/features/profile/routes';
import CheatOverlayMount from '@/features/game/components/CheatOverlayMount';
import RootSwitch from './RootSwitch';

const allPublicRoutes = [...authRoutes];
const allProtectedRoutes = [
  ...authProtectedRoutes,
  ...gameProtectedRoutes,
  ...profileProtectedRoutes,
];

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-muted-foreground">
            Loading...
          </div>
        }
      >
        <Routes>
          {/* `/` 由 RootSwitch 智能分发：未登录 → HomePage，已登录 → LobbyPage */}
          <Route path="/" element={<RootSwitch />} />

          {allPublicRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route element={<ProtectedRoute />}>
            {allProtectedRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Route>
        </Routes>
      </Suspense>
      <CheatOverlayMount />
    </BrowserRouter>
  );
}
