import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import AuthCallback from './pages/AuthCallback.js';
import RegisterPage from './pages/RegisterPage.js';
import ProfileSetupPage from './pages/ProfileSetupPage.js';
import LobbyPage from './pages/LobbyPage.js';
import RoomPage from './pages/RoomPage.js';
import GamePage from './pages/GamePage.js';
import ProfilePage from './pages/ProfilePage.js';
import ProtectedRoute from './components/ProtectedRoute.js';
import ToastContainer from './components/Toast.js';
import { useSettingsStore, FONT_OPTIONS } from './stores/settings-store.js';

// Apply saved font on initial load
const savedFont = useSettingsStore.getState().fontFamily;
if (savedFont !== 'default') {
  document.documentElement.style.setProperty('--font-game', FONT_OPTIONS[savedFont].value);
  document.documentElement.style.setProperty('--font-ui', FONT_OPTIONS[savedFont].value);
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile/setup" element={<ProtectedRoute><ProfileSetupPage /></ProtectedRoute>} />
        <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
        <Route path="/room/:roomCode" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />
        <Route path="/game/:roomCode" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
