import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import { authRoutes, authProtectedRoutes } from '@/features/auth/routes';
import { gameProtectedRoutes } from '@/features/game/routes';
import { lobbyProtectedRoutes } from '@/features/lobby/routes';
import { profileProtectedRoutes } from '@/features/profile/routes';

const allPublicRoutes = [...authRoutes];
const allProtectedRoutes = [
  ...authProtectedRoutes,
  ...gameProtectedRoutes,
  ...lobbyProtectedRoutes,
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
    </BrowserRouter>
  );
}
