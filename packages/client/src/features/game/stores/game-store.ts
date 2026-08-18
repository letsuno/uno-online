import { create } from 'zustand';
import type {
  Card,
  Color,
  CommittedGameAction,
  GamePhase,
  PlayerView,
  PlayerViewPlayer,
  RoomSettings,
} from '@uno-online/shared';

export type PlayerInfo = PlayerViewPlayer;

export type InfoDrawerTab = 'rules' | 'house-rules' | 'log' | 'chat';

interface NextRoundVoteState {
  votes: number;
  required: number;
  voters: string[];
}

interface GameState {
  viewerId: string | null;
  phase: GamePhase | null;
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
  settings: RoomSettings | null;
  lastAction: CommittedGameAction | null;
  turnEndTime: number | null;
  lastDrawnCard: Card | null;
  hasDrawnThisTurn: boolean;
  isSpectator: boolean;
  deckHash: string | null;
  nextRoundVote: NextRoundVoteState | null;
  roundEndAt: number | null;
  gameOverAt: number | null;
  /** 终局展示窗剩余秒数：>0 时压住结算板、保留牌桌（可继续扔表情、查看最后一张牌） */
  endRevealLeft: number;
  cheatDetected: boolean;
  ownerTransferAt: number | null;
  gameStartedAt: number | null;
  turnStartedAt: number | null;
  setCheatDetected: (value: boolean) => void;
  setOwnerTransferAt: (transferAt: number | null) => void;
  setSpectator: (value: boolean) => void;
  infoDrawerOpen: boolean;
  infoDrawerTab: InfoDrawerTab;
  toggleInfoDrawer: () => void;
  openInfoDrawer: (tab?: InfoDrawerTab) => void;
  setInfoDrawerTab: (tab: InfoDrawerTab) => void;
  setGameState: (view: PlayerView) => void;
  setNextRoundVote: (vote: NextRoundVoteState | null) => void;
  setRoundEndAt: (t: number | null) => void;
  setGameOverAt: (t: number | null) => void;
  setEndRevealLeft: (n: number) => void;
  setDrawnCard: (card: Card | null) => void;
  clearGame: () => void;
}

export const useGameStore = create<GameState>(set => ({
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
  endRevealLeft: 0,
  cheatDetected: false,
  ownerTransferAt: null,
  gameStartedAt: null,
  turnStartedAt: null,
  setCheatDetected: value => set({ cheatDetected: value }),
  setOwnerTransferAt: transferAt => set({ ownerTransferAt: transferAt }),
  setSpectator: value => set({ isSpectator: value }),
  infoDrawerOpen: false,
  infoDrawerTab: 'rules' as InfoDrawerTab,
  toggleInfoDrawer: () => set(state => ({ infoDrawerOpen: !state.infoDrawerOpen })),
  openInfoDrawer: (tab = 'rules') => set({ infoDrawerOpen: true, infoDrawerTab: tab }),
  setInfoDrawerTab: (tab: InfoDrawerTab) => set({ infoDrawerTab: tab }),
  setGameState: view =>
    set(state => {
      const players = view.players;
      const viewerId = view.viewerId;
      const currentPlayerIndex = view.currentPlayerIndex;
      const phase = view.phase;
      const lastAction = view.lastAction;
      const currentPlayerId = players[currentPlayerIndex]?.id;
      const hasDrawnThisTurn =
        phase === 'playing' && lastAction?.type === 'DRAW_CARD' && lastAction.playerId === currentPlayerId;

      const isSpectatorView = viewerId === '__spectator__';
      const turnEndTime =
        phase === 'round_end' || phase === 'game_over'
          ? null
          : view.turnStartedAt +
            (view.settings.houseRules.fastMode
              ? Math.floor(view.settings.turnTimeLimit / 2)
              : view.settings.turnTimeLimit) *
              1000;
      const spectatorChange = isSpectatorView
        ? { isSpectator: true }
        : state.isSpectator && !isSpectatorView
          ? { isSpectator: false }
          : {};

      return {
        phase,
        viewerId,
        gameStartedAt: view.gameStartedAt,
        turnStartedAt: view.turnStartedAt,
        players,
        currentPlayerIndex,
        direction: view.direction,
        discardPile: view.discardPile,
        currentColor: view.currentColor,
        drawStack: view.drawStack,
        pendingPenaltyDraws: view.pendingPenaltyDraws,
        deckLeftCount: view.deckLeftCount,
        deckRightCount: view.deckRightCount,
        discardPileCount: view.discardPileCount,
        roundNumber: view.roundNumber,
        winnerId: view.winnerId,
        pendingDrawPlayerId: view.pendingDrawPlayerId,
        settings: view.settings,
        lastAction,
        turnEndTime,
        hasDrawnThisTurn,
        lastDrawnCard: hasDrawnThisTurn ? state.lastDrawnCard : null,
        deckHash: view.deckHash,
        nextRoundVote: phase === 'round_end' ? state.nextRoundVote : null,
        roundEndAt: phase === 'round_end' ? state.roundEndAt : null,
        gameOverAt: phase === 'game_over' ? state.gameOverAt : null,
        endRevealLeft: phase === 'round_end' || phase === 'game_over' ? state.endRevealLeft : 0,
        ...spectatorChange,
      };
    }),
  setNextRoundVote: vote => set({ nextRoundVote: vote }),
  setRoundEndAt: t => set({ roundEndAt: t }),
  setGameOverAt: t => set({ gameOverAt: t }),
  setEndRevealLeft: n => set({ endRevealLeft: n }),
  setDrawnCard: card => set({ lastDrawnCard: card, hasDrawnThisTurn: true }),
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
      endRevealLeft: 0,
      cheatDetected: false,
      ownerTransferAt: null,
      gameStartedAt: null,
      turnStartedAt: null,
      infoDrawerOpen: false,
      infoDrawerTab: 'rules' as InfoDrawerTab,
    }),
}));
