import type { Card, Color } from './card';
import type { HouseRules } from './house-rules';

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

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  connected: boolean;
  calledUno: boolean;
  eliminated?: boolean;
  teamId?: number;
  avatarUrl?: string | null;
}

export interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500;
  houseRules: HouseRules;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  direction: Direction;
  deck: Card[];
  discardPile: Card[];
  currentColor: Color | null;
  drawStack: number;
  pendingDrawPlayerId: string | null;
  lastAction: GameAction | null;
  roundNumber: number;
  winnerId: string | null;
  settings: RoomSettings;
}

export interface RoundResult {
  winnerId: string;
  scores: Record<string, number>;
}

export type GameAction =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: Color }
  | { type: 'DRAW_CARD'; playerId: string }
  | { type: 'PASS'; playerId: string }
  | { type: 'CALL_UNO'; playerId: string }
  | { type: 'CATCH_UNO'; catcherId: string; targetId: string }
  | { type: 'CHALLENGE'; playerId: string }
  | { type: 'ACCEPT'; playerId: string }
  | { type: 'CHOOSE_COLOR'; playerId: string; color: Color }
  | { type: 'CHOOSE_SWAP_TARGET'; playerId: string; targetId: string };
