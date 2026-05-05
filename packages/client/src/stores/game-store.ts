import { create } from 'zustand';
import type { Card, Color, HouseRules } from '@uno-online/shared';

interface PlayerInfo {
  id: string;
  name: string;
  hand: Card[];
  handCount: number;
  score: number;
  connected: boolean;
  calledUno: boolean;
  eliminated?: boolean;
  teamId?: number;
}

interface GameState {
  phase: string | null;
  players: PlayerInfo[];
  currentPlayerIndex: number;
  direction: 'clockwise' | 'counter_clockwise';
  discardPile: Card[];
  currentColor: Color | null;
  drawStack: number;
  deckCount: number;
  roundNumber: number;
  winnerId: string | null;
  pendingDrawPlayerId: string | null;
  settings: { turnTimeLimit: number; targetScore: number; houseRules?: HouseRules } | null;
  turnEndTime: number | null;
  lastDrawnCard: Card | null;
  hasDrawnThisTurn: boolean;
  setGameState: (view: Record<string, unknown>) => void;
  setDrawnCard: (card: Card | null) => void;
  setHasDrawn: (v: boolean) => void;
  setTurnEndTime: (t: number | null) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: null,
  players: [],
  currentPlayerIndex: 0,
  direction: 'clockwise',
  discardPile: [],
  currentColor: null,
  drawStack: 0,
  deckCount: 0,
  roundNumber: 0,
  winnerId: null,
  pendingDrawPlayerId: null,
  settings: null,
  turnEndTime: null,
  lastDrawnCard: null,
  hasDrawnThisTurn: false,
  setGameState: (view) =>
    set({
      phase: view.phase as string,
      players: view.players as PlayerInfo[],
      currentPlayerIndex: view.currentPlayerIndex as number,
      direction: view.direction as 'clockwise' | 'counter_clockwise',
      discardPile: view.discardPile as Card[],
      currentColor: view.currentColor as Color | null,
      drawStack: view.drawStack as number,
      deckCount: view.deckCount as number,
      roundNumber: view.roundNumber as number,
      winnerId: view.winnerId as string | null,
      pendingDrawPlayerId: view.pendingDrawPlayerId as string | null,
      settings: view.settings as { turnTimeLimit: number; targetScore: number; houseRules?: HouseRules },
      hasDrawnThisTurn: false,
      lastDrawnCard: null,
    }),
  setDrawnCard: (card) => set({ lastDrawnCard: card, hasDrawnThisTurn: true }),
  setHasDrawn: (v) => set({ hasDrawnThisTurn: v }),
  setTurnEndTime: (t) => set({ turnEndTime: t }),
  clearGame: () =>
    set({
      phase: null,
      players: [],
      currentPlayerIndex: 0,
      direction: 'clockwise',
      discardPile: [],
      currentColor: null,
      drawStack: 0,
      deckCount: 0,
      roundNumber: 0,
      winnerId: null,
      pendingDrawPlayerId: null,
      settings: null,
      turnEndTime: null,
      lastDrawnCard: null,
      hasDrawnThisTurn: false,
    }),
}));
