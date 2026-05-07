import { lazy } from 'react';

const HomePage = lazy(() => import('./pages/HomePage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ProfileSetupPage = lazy(() => import('./pages/ProfileSetupPage'));

export const authRoutes = [
  { path: '/', element: <HomePage /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/register', element: <RegisterPage /> },
];

export const authProtectedRoutes = [
  { path: '/profile/setup', element: <ProfileSetupPage /> },
];
