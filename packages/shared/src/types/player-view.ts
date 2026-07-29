import type { Card, CardBack } from './card.js';
import type { GameState } from './game.js';
import type { BotConfig } from './bot.js';

export interface PlayerViewPlayer {
  id: string;
  name: string;
  /** 本人的手牌（已剥离 back）／被揭示的手牌；不可见时为空数组。 */
  hand: Card[];
  handCount: number;
  /**
   * 对手手牌的背面，与 handCount 等长。仅 flip 模式下发，且**不会**发给手牌主人本人——
   * 官方规则下你看不到自己手牌的背面（见设计文档 §5.2）。
   */
  handBacks?: CardBack[];
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
  botConfig?: BotConfig;
}

export interface PlayerView {
  viewerId: string;
  phase: GameState['phase'];
  players: PlayerViewPlayer[];
  currentPlayerIndex: number;
  direction: GameState['direction'];
  discardPile: Card[];
  currentColor: GameState['currentColor'];
  flipSide: GameState['flipSide'];
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
  gameStartedAt?: number;
  turnStartedAt?: number;
}
