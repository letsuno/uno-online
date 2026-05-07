import { lazy } from 'react';

const ReplayPage = lazy(() => import('./pages/ReplayPage'));

export const replayProtectedRoutes = [
  { path: '/replay/:gameId', element: <ReplayPage /> },
];
