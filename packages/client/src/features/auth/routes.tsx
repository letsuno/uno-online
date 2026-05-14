import { lazy } from 'react';

const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ProfileSetupPage = lazy(() => import('./pages/ProfileSetupPage'));

// 注意：`/` 路径由 app/RootSwitch.tsx 智能分发到 HomePage 或 LobbyPage，
// 在 app/router.tsx 中直接注册，不在这里。
export const authRoutes = [
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/register', element: <RegisterPage /> },
];

export const authProtectedRoutes = [
  { path: '/profile/setup', element: <ProfileSetupPage /> },
];
