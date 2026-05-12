import type { Card, Color } from './card.js';
import type { ChatMessage } from './chat.js';
import type { HouseRules } from './house-rules.js';
import type { UserRole } from './role.js';

export type GamePhase =
  | 'waiting'
  | 'dealing'
  | 'playing'
  | 'choosing_color'
  | 'challenging'
  | 'choosing_swap_target'
  | 'round_end'
  | 'game_over';

export type Direction = 'clockwise' | 'counter_clockwise';

export type DrawSide = 'left' | 'right';

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  roundWins?: number;
  connected: boolean;
  autopilot: boolean;
  calledUno: boolean;
  unoCaught?: boolean;
  eliminated?: boolean;
  teamId?: number;
  avatarUrl?: string | null;
  role?: UserRole;
  isBot: boolean;
}

export interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500;
  houseRules: HouseRules;
  allowSpectators: boolean;
  spectatorMode: 'full' | 'hidden';
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  direction: Direction;
  deckLeft: Card[];
  deckRight: Card[];
  deckLeftInitialCount: number;
  deckRightInitialCount: number;
  discardPile: Card[];
  currentColor: Color | null;
  drawStack: number;
  pendingDrawPlayerId: string | null;
  pendingPenaltyDraws?: number;
  pendingPenaltyNextPlayerIndex?: number | null;
  pendingPenaltySourcePlayerId?: string | null;
  pendingPenaltyQueue?: PendingPenaltyDraw[];
  lastAction: GameAction | null;
  roundNumber: number;
  winnerId: string | null;
  deckHash: string;
  settings: RoomSettings;
  chatHistory?: ChatMessage[];
}

export interface PendingPenaltyDraw {
  playerId: string;
  count: number;
  nextPlayerIndex: number;
  sourcePlayerId?: string | null;
}

export interface RoundResult {
  winnerId: string;
  scores: Record<string, number>;
}

export type GameAction =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: Color }
  | { type: 'DRAW_CARD'; playerId: string; side: DrawSide }
  | { type: 'PASS'; playerId: string }
  | { type: 'CALL_UNO'; playerId: string }
  | { type: 'CATCH_UNO'; catcherId: string; targetId: string }
  | { type: 'CHALLENGE'; playerId: string; succeeded?: boolean; penaltyPlayerId?: string; penaltyCount?: number }
  | { type: 'ACCEPT'; playerId: string }
  | { type: 'CHOOSE_COLOR'; playerId: string; color: Color }
  | { type: 'CHOOSE_SWAP_TARGET'; playerId: string; targetId: string };
