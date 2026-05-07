import { lazy } from 'react';

const LobbyPage = lazy(() => import('./pages/LobbyPage'));

export const lobbyProtectedRoutes = [
  { path: '/lobby', element: <LobbyPage /> },
];
