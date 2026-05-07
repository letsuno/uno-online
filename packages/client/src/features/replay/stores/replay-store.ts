import { create } from 'zustand';
import { apiGet } from '@/shared/api';
import type { GameEvent } from '@uno-online/shared';

interface GameDetailPlayer {
  userId: string;
  nickname: string;
  placement: number;
  finalScore: number;
}

interface GameDetail {
  id: string;
  roomCode: string;
  players: GameDetailPlayer[];
  winnerId: string;
  winnerName: string;
  playerCount: number;
  rounds: number;
  duration: number;
  deckHash: string;
  createdAt: string;
  events: GameEvent[];
  initialDeck: string | null;
}

interface ReplayState {
  gameDetail: GameDetail | null;
  currentStep: number;
  isPlaying: boolean;
  speed: number;
  loading: boolean;
  error: string | null;
  fetchGame: (gameId: string) => Promise<void>;
  setStep: (step: number) => void;
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  gameDetail: null,
  currentStep: 0,
  isPlaying: false,
  speed: 1,
  loading: false,
  error: null,
  fetchGame: async (gameId: string) => {
    set({ loading: true, error: null });
    try {
      const detail = await apiGet<GameDetail>(`/games/${gameId}`);
      set({ gameDetail: detail, currentStep: 0, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },
  setStep: (step) => {
    const { gameDetail } = get();
    if (!gameDetail) return;
    const maxStep = gameDetail.events.length - 1;
    set({ currentStep: Math.max(0, Math.min(step, maxStep)) });
  },
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stepForward: () => {
    const { currentStep, gameDetail } = get();
    if (!gameDetail) return;
    if (currentStep < gameDetail.events.length - 1) {
      set({ currentStep: currentStep + 1 });
    } else {
      set({ isPlaying: false });
    }
  },
  stepBackward: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },
  setSpeed: (speed) => set({ speed }),
  reset: () => set({
    gameDetail: null,
    currentStep: 0,
    isPlaying: false,
    speed: 1,
    loading: false,
    error: null,
  }),
}));
