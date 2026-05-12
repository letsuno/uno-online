import { create } from 'zustand';

export interface NotificationPreferences {
  gameStart: boolean;
  myTurn: boolean;
  gameEnd: boolean;
  kicked: boolean;
  roomDissolved: boolean;
}

export type NotificationEventType = keyof NotificationPreferences;

const STORAGE_KEY = 'notification-preferences';

function loadPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultPreferences, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultPreferences };
}

const defaultPreferences: NotificationPreferences = {
  gameStart: true,
  myTurn: true,
  gameEnd: true,
  kicked: true,
  roomDissolved: true,
};

interface NotificationState {
  preferences: NotificationPreferences;
  setPreference: (key: NotificationEventType, value: boolean) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  preferences: loadPreferences(),
  setPreference: (key, value) =>
    set((state) => {
      const next = { ...state.preferences, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return { preferences: next };
    }),
}));
