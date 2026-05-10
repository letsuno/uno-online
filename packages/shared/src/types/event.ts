import type { Card, Color } from './card';
import type { ChatMessage } from './chat';
import type { RoomSettings } from './game';
import type { Direction } from './game';

export const GameEventType = {
  GAME_START: 'game_start',
  PLAY_CARD: 'play_card',
  DRAW_CARD: 'draw_card',
  PASS: 'pass',
  CALL_UNO: 'call_uno',
  CATCH_UNO: 'catch_uno',
  CHALLENGE: 'challenge',
  ACCEPT: 'accept',
  CHOOSE_COLOR: 'choose_color',
  CHOOSE_SWAP_TARGET: 'choose_swap_target',
  CHAT_MESSAGE: 'chat_message',
  ROUND_END: 'round_end',
  GAME_OVER: 'game_over',
} as const;

export type GameEventType = (typeof GameEventType)[keyof typeof GameEventType];

export interface GameStartPayload {
  initialDeck: Card[];
  deckHash: string;
  playerHands: Record<string, Card[]>;
  firstDiscard: Card;
  direction: Direction;
  settings: RoomSettings;
}

export interface PlayCardPayload {
  cardId: string;
  card: Card;
  chosenColor?: Color;
}

export interface DrawCardPayload {
  card: Card;
}

export interface CatchUnoPayload {
  targetPlayerId: string;
}

export interface ChallengePayload {
  success: boolean;
  penaltyCards: Card[];
}

export interface AcceptPayload {
  drawnCards: Card[];
}

export interface ChooseColorPayload {
  color: Color;
}

export interface ChooseSwapTargetPayload {
  targetId: string;
}

export interface ChatMessagePayload {
  message: ChatMessage;
}

export interface RoundEndPayload {
  winnerId: string;
  scores: Record<string, number>;
}

export interface GameOverPayload {
  winnerId: string;
  finalScores: Record<string, number>;
  reason?: string;
}

export type GameEventPayload =
  | GameStartPayload
  | PlayCardPayload
  | DrawCardPayload
  | Record<string, never>
  | CatchUnoPayload
  | ChallengePayload
  | AcceptPayload
  | ChooseColorPayload
  | ChooseSwapTargetPayload
  | ChatMessagePayload
  | RoundEndPayload
  | GameOverPayload;

export interface GameEvent {
  seq: number;
  eventType: GameEventType;
  payload: GameEventPayload;
  playerId: string | null;
  createdAt: string;
}
