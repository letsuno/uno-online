import { create } from 'zustand';
import type { Card, Color, GameAction, HouseRules, PlayerView, PlayerViewPlayer } from '@uno-online/shared';

export type PlayerInfo = PlayerViewPlayer;

function shallowPlayersEqual(a: PlayerViewPlayer[], b: PlayerViewPlayer[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i], pb = b[i];
    if (pa.id !== pb.id || pa.handCount !== pb.handCount || pa.score !== pb.score ||
        pa.connected !== pb.connected || pa.autopilot !== pb.autopilot ||
        pa.calledUno !== pb.calledUno || pa.hand.length !== pb.hand.length ||
        pa.eliminated !== pb.eliminated || pa.roundWins !== pb.roundWins) return false;
  }
  return true;
}

function shallowDiscardEqual(a: Card[], b: Card[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return a[a.length - 1].id === b[b.length - 1].id;
}

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
  discardPileCount: number;
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
  roundEndAt: number | null;
  gameOverAt: number | null;
  cheatDetected: boolean;
  setCheatDetected: (value: boolean) => void;
  setSpectator: (value: boolean) => void;
  infoDrawerOpen: boolean;
  infoDrawerTab: InfoDrawerTab;
  toggleInfoDrawer: () => void;
  openInfoDrawer: (tab?: InfoDrawerTab) => void;
  setInfoDrawerTab: (tab: InfoDrawerTab) => void;
  setGameState: (view: PlayerView, turnEndTime?: number | null) => void;
  setNextRoundVote: (vote: NextRoundVoteState | null) => void;
  setRoundEndAt: (t: number | null) => void;
  setGameOverAt: (t: number | null) => void;
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
  discardPileCount: 0,
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
  roundEndAt: null,
  gameOverAt: null,
  cheatDetected: false,
  setCheatDetected: (value) => set({ cheatDetected: value }),
  setSpectator: (value) => set({ isSpectator: value }),
  infoDrawerOpen: false,
  infoDrawerTab: 'rules' as InfoDrawerTab,
  toggleInfoDrawer: () => set((state) => ({ infoDrawerOpen: !state.infoDrawerOpen })),
  openInfoDrawer: (tab = 'rules') => set({ infoDrawerOpen: true, infoDrawerTab: tab }),
  setInfoDrawerTab: (tab: InfoDrawerTab) => set({ infoDrawerTab: tab }),
  setGameState: (view, turnEndTime) =>
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

      const isSpectatorView = viewerId === '__spectator__';
      const spectatorChange = isSpectatorView
        ? { isSpectator: true }
        : state.isSpectator && !isSpectatorView
          ? { isSpectator: false }
          : {};

      return {
        phase,
        viewerId,
        players: shallowPlayersEqual(state.players, players) ? state.players : players,
        currentPlayerIndex,
        direction: view.direction,
        discardPile: shallowDiscardEqual(state.discardPile, view.discardPile) ? state.discardPile : view.discardPile,
        currentColor: view.currentColor,
        drawStack: view.drawStack,
        pendingPenaltyDraws: view.pendingPenaltyDraws ?? 0,
        deckLeftCount: view.deckLeftCount,
        deckRightCount: view.deckRightCount,
        discardPileCount: view.discardPileCount ?? view.discardPile.length,
        roundNumber: view.roundNumber,
        winnerId: view.winnerId,
        pendingDrawPlayerId: view.pendingDrawPlayerId,
        settings: view.settings,
        lastAction,
        turnEndTime: turnEndTime !== undefined ? turnEndTime : state.turnEndTime,
        hasDrawnThisTurn,
        lastDrawnCard: hasDrawnThisTurn ? state.lastDrawnCard : null,
        deckHash: view.deckHash ?? state.deckHash,
        nextRoundVote: phase === 'round_end' ? state.nextRoundVote : null,
        roundEndAt: phase === 'round_end' ? state.roundEndAt : null,
        gameOverAt: phase === 'game_over' ? state.gameOverAt : null,
        ...spectatorChange,
      };
    }),
  setNextRoundVote: (vote) => set({ nextRoundVote: vote }),
  setRoundEndAt: (t) => set({ roundEndAt: t }),
  setGameOverAt: (t) => set({ gameOverAt: t }),
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
      discardPileCount: 0,
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
      roundEndAt: null,
      gameOverAt: null,
      cheatDetected: false,
      infoDrawerOpen: false,
      infoDrawerTab: 'rules' as InfoDrawerTab,
    }),
}));
