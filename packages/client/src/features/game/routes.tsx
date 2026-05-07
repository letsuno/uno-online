import { lazy } from 'react';

const GamePage = lazy(() => import('./pages/GamePage'));
const RoomPage = lazy(() => import('./pages/RoomPage'));

export const gameProtectedRoutes = [
  { path: '/room/:roomCode', element: <RoomPage /> },
  { path: '/game/:roomCode', element: <GamePage /> },
];
