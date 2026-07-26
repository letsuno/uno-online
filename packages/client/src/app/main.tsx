import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/fredoka';
import '../index.css';
import './dev-hooks';
import { initCardTheme } from '@/shared/stores/settings-store';

initCardTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
