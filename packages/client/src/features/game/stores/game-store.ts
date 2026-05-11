import { create } from 'zustand';
import type { Card, Color, GameAction, HouseRules, PlayerView, PlayerViewPlayer } from '@uno-online/shared';

export type PlayerInfo = PlayerViewPlayer;

export type InfoDrawerTab = 'rules' | 'house-rules' | 'log' | 'chat';

export interface NextRoundVoteState {
  votes: number;
  required: number;
  voters: string[];
}

interface GameState {
  viewerId: string | null;
  phase: string | null;
  players: PlayerInfo[];
  currentPlayerIndex: number;
  direction: 'clockwise' | 'counter_clockwise';
  discardPile: Card[];
  currentColor: Color | null;
  drawStack: number;
  pendingPenaltyDraws: number;
  deckLeftCount: number;
  deckRightCount: number;
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
  nextRoundVote: NextRoundVoteState | null;
  cheatDetected: boolean;
  setCheatDetected: (value: boolean) => void;
  setSpectator: (value: boolean) => void;
  infoDrawerOpen: boolean;
  infoDrawerTab: InfoDrawerTab;
  toggleInfoDrawer: () => void;
  openInfoDrawer: (tab?: InfoDrawerTab) => void;
  setInfoDrawerTab: (tab: InfoDrawerTab) => void;
  setGameState: (view: PlayerView) => void;
  setNextRoundVote: (vote: NextRoundVoteState | null) => void;
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
  pendingPenaltyDraws: 0,
  deckLeftCount: 0,
  deckRightCount: 0,
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
  nextRoundVote: null,
  cheatDetected: false,
  setCheatDetected: (value) => set({ cheatDetected: value }),
  setSpectator: (value) => set({ isSpectator: value }),
  infoDrawerOpen: false,
  infoDrawerTab: 'rules' as InfoDrawerTab,
  toggleInfoDrawer: () => set((state) => ({ infoDrawerOpen: !state.infoDrawerOpen })),
  openInfoDrawer: (tab = 'rules') => set({ infoDrawerOpen: true, infoDrawerTab: tab }),
  setInfoDrawerTab: (tab: InfoDrawerTab) => set({ infoDrawerTab: tab }),
  setGameState: (view) =>
    set((state) => {
      const players = view.players;
      const viewerId = view.viewerId ?? state.viewerId;
      const currentPlayerIndex = view.currentPlayerIndex;
      const phase = view.phase;
      const lastAction = view.lastAction ?? null;
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
        direction: view.direction,
        discardPile: view.discardPile,
        currentColor: view.currentColor,
        drawStack: view.drawStack,
        pendingPenaltyDraws: view.pendingPenaltyDraws ?? 0,
        deckLeftCount: view.deckLeftCount,
        deckRightCount: view.deckRightCount,
        roundNumber: view.roundNumber,
        winnerId: view.winnerId,
        pendingDrawPlayerId: view.pendingDrawPlayerId,
        settings: view.settings,
        lastAction,
        turnEndTime: phase === 'round_end' || phase === 'game_over' ? null : state.turnEndTime,
        hasDrawnThisTurn,
        lastDrawnCard: hasDrawnThisTurn ? state.lastDrawnCard : null,
        deckHash: view.deckHash ?? state.deckHash,
        nextRoundVote: phase === 'round_end' ? state.nextRoundVote : null,
      };
    }),
  setNextRoundVote: (vote) => set({ nextRoundVote: vote }),
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
      pendingPenaltyDraws: 0,
      deckLeftCount: 0,
      deckRightCount: 0,
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
      nextRoundVote: null,
      cheatDetected: false,
      infoDrawerOpen: false,
      infoDrawerTab: 'rules' as InfoDrawerTab,
    }),
}));
