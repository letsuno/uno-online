import type { Card, Color } from './card.js';
import type { ChatMessage } from './chat.js';
import type { HouseRules } from './house-rules.js';
import type { UserRole } from './role.js';
import type { BotConfig } from './bot.js';

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

export type GameMode = 'classic' | 'flip';

/** 当前生效的牌面。classic 模式恒为 'light'。 */
export type FlipSide = 'light' | 'dark';

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
  botConfig?: BotConfig;
}

export interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500 | 1000;
  gameMode: GameMode;
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
  /** 当前生效的牌面。classic 模式恒为 'light'。 */
  flipSide: FlipSide;
  drawStack: number;
  pendingDrawPlayerId: string | null;
  pendingPenaltyDraws?: number;
  pendingPenaltyNextPlayerIndex?: number | null;
  pendingPenaltySourcePlayerId?: string | null;
  pendingPenaltyQueue?: PendingPenaltyDraw[];
  /**
   * Wild Draw Color 的条件式罚摸：一直摸到抽出该颜色为止。
   * 生效期间 `pendingPenaltyDraws` 恒为 1（表示「至少还要再摸一张」），
   * 因此所有既有的 `pendingPenaltyDraws > 0` 判断都无需改动。
   */
  pendingPenaltyUntilColor?: Color | null;
  /** 条件式罚摸已经摸了几张，用于村规「摸色上限」。 */
  pendingPenaltyUntilColorDrawn?: number;
  /** 摸到目标色之后还要追加摸的张数（质疑失败时为 2）。 */
  pendingPenaltyExtra?: number;
  lastAction: GameAction | null;
  roundNumber: number;
  winnerId: string | null;
  deckHash: string;
  settings: RoomSettings;
  chatHistory?: ChatMessage[];
  gameStartedAt?: number;
  turnStartedAt?: number;
}

export interface PendingPenaltyDraw {
  playerId: string;
  count: number;
  nextPlayerIndex: number;
  sourcePlayerId?: string | null;
  untilColor?: Color | null;
  extra?: number;
}

export interface RoundResult {
  winnerId: string;
  scores: Record<string, number>;
}

export type GameAction =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: Color; isJumpIn?: boolean }
  | { type: 'DRAW_CARD'; playerId: string; side: DrawSide }
  | { type: 'PASS'; playerId: string }
  | { type: 'CALL_UNO'; playerId: string }
  | { type: 'CATCH_UNO'; catcherId: string; targetId: string; catcherName?: string }
  | { type: 'CHALLENGE'; playerId: string; succeeded?: boolean; penaltyPlayerId?: string; penaltyCount?: number }
  | { type: 'ACCEPT'; playerId: string }
  | { type: 'CHOOSE_COLOR'; playerId: string; color: Color }
  | { type: 'CHOOSE_SWAP_TARGET'; playerId: string; targetId: string };
