import { create } from 'zustand';
import type { Card, Color, GameAction, HouseRules } from '@uno-online/shared';

export interface PlayerInfo {
  id: string;
  name: string;
  hand: Card[];
  handCount: number;
  score: number;
  connected: boolean;
  autopilot: boolean;
  calledUno: boolean;
  eliminated?: boolean;
  teamId?: number;
  avatarUrl?: string | null;
  role?: string;
}

export type InfoDrawerTab = 'rules' | 'house-rules' | 'log' | 'chat';

interface GameState {
  viewerId: string | null;
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
  lastAction: GameAction | null;
  turnEndTime: number | null;
  lastDrawnCard: Card | null;
  hasDrawnThisTurn: boolean;
  isSpectator: boolean;
  deckHash: string | null;
  setSpectator: (value: boolean) => void;
  infoDrawerOpen: boolean;
  infoDrawerTab: InfoDrawerTab;
  toggleInfoDrawer: () => void;
  setInfoDrawerTab: (tab: InfoDrawerTab) => void;
  setGameState: (view: Record<string, unknown>) => void;
  setDrawnCard: (card: Card | null) => void;
  setTurnEndTime: (t: number | null) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: null,
  viewerId: null,
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
  lastAction: null,
  turnEndTime: null,
  lastDrawnCard: null,
  hasDrawnThisTurn: false,
  isSpectator: false,
  deckHash: null,
  setSpectator: (value) => set({ isSpectator: value }),
  infoDrawerOpen: false,
  infoDrawerTab: 'rules' as InfoDrawerTab,
  toggleInfoDrawer: () => set((state) => ({ infoDrawerOpen: !state.infoDrawerOpen })),
  setInfoDrawerTab: (tab: InfoDrawerTab) => set({ infoDrawerTab: tab }),
  setGameState: (view) =>
    set((state) => {
      const players = view.players as PlayerInfo[];
      const viewerId = (view.viewerId as string | undefined) ?? state.viewerId;
      const currentPlayerIndex = view.currentPlayerIndex as number;
      const phase = view.phase as string;
      const lastAction = (view.lastAction as GameAction | null) ?? null;
      const currentPlayerId = players[currentPlayerIndex]?.id;
      const hasDrawnThisTurn =
        phase === 'playing' &&
        lastAction?.type === 'DRAW_CARD' &&
        lastAction.playerId === currentPlayerId;

      return {
        phase,
        viewerId,
        players,
        currentPlayerIndex,
        direction: view.direction as 'clockwise' | 'counter_clockwise',
        discardPile: view.discardPile as Card[],
        currentColor: view.currentColor as Color | null,
        drawStack: view.drawStack as number,
        deckCount: view.deckCount as number,
        roundNumber: view.roundNumber as number,
        winnerId: view.winnerId as string | null,
        pendingDrawPlayerId: view.pendingDrawPlayerId as string | null,
        settings: view.settings as { turnTimeLimit: number; targetScore: number; houseRules?: HouseRules },
        lastAction,
        hasDrawnThisTurn,
        lastDrawnCard: hasDrawnThisTurn ? state.lastDrawnCard : null,
        deckHash: (view.deckHash as string | undefined) ?? state.deckHash,
      };
    }),
  setDrawnCard: (card) => set({ lastDrawnCard: card, hasDrawnThisTurn: true }),
  setTurnEndTime: (t) => set({ turnEndTime: t }),
  clearGame: () =>
    set({
      phase: null,
      viewerId: null,
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
      lastAction: null,
      turnEndTime: null,
      lastDrawnCard: null,
      hasDrawnThisTurn: false,
      isSpectator: false,
      deckHash: null,
      infoDrawerOpen: false,
      infoDrawerTab: 'rules' as InfoDrawerTab,
    }),
}));
