import { lazy } from 'react';

const ProfilePage = lazy(() => import('./pages/ProfilePage'));

export const profileProtectedRoutes = [
  { path: '/profile', element: <ProfilePage /> },
];
