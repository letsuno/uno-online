import type { Card } from './card.js';
import type { GameState } from './game.js';

export interface PlayerViewPlayer {
  id: string;
  name: string;
  hand: Card[];
  handCount: number;
  score: number;
  roundWins?: number;
  connected: boolean;
  autopilot: boolean;
  calledUno: boolean;
  unoCaught?: boolean;
  eliminated?: boolean;
  teamId?: number;
  avatarUrl?: string | null;
  role?: string;
  isBot: boolean;
}

export interface PlayerView {
  viewerId: string;
  phase: GameState['phase'];
  players: PlayerViewPlayer[];
  currentPlayerIndex: number;
  direction: GameState['direction'];
  discardPile: Card[];
  currentColor: GameState['currentColor'];
  drawStack: number;
  pendingPenaltyDraws?: number;
  deckLeftCount: number;
  deckRightCount: number;
  roundNumber: number;
  winnerId: string | null;
  settings: GameState['settings'];
  pendingDrawPlayerId: string | null;
  lastAction: GameState['lastAction'];
  deckHash?: string;
  discardPileCount?: number;
}
