import type { GameState, GameAction, Direction } from '../types/game';
import type { Card, Color } from '../types/card';
import type { HouseRules } from '../types/house-rules';

export interface RuleMetadata {
  id: string;
  keys: (keyof HouseRules)[];
  label: string;
  description: string;
}

export type PreCheckResult =
  | { handled: false }
  | { handled: true; state: GameState };

export interface RuleContext {
  applyAction: (state: GameState, action: GameAction) => GameState;
  checkRoundEnd: (state: GameState, playerId: string) => GameState;
  drawCardsFromDeck: (state: GameState, playerId: string, count: number) => GameState;
  startPenaltyDraw: (
    state: GameState,
    playerId: string,
    count: number,
    nextPlayerIndex: number,
    sourcePlayerId?: string | null,
  ) => GameState;
  putAttackCardOnStack: (
    state: GameState,
    action: Extract<GameAction, { type: 'PLAY_CARD' }>,
    card: Card,
    stackAdd: number,
  ) => GameState;
  getCardDrawPenalty: (card: Card) => number;
  canStartDrawStack: (state: GameState, card: Card) => boolean;
  isLastCard: (state: GameState, playerId: string, cardId: string) => boolean;
  isWildCard: (card: Card) => boolean;
  isFunctionCard: (card: Card) => boolean;
  handleDrawUntilPlayable: (state: GameState, action: Extract<GameAction, { type: 'DRAW_CARD' }>) => GameState;
  handleForcedPlayAfterDraw: (state: GameState, action: Extract<GameAction, { type: 'DRAW_CARD' }>) => GameState;
  applyDoubleScore: (before: GameState, after: GameState) => GameState;
  canPlayCard: (card: Card, topCard: Card, currentColor: Color) => boolean;
  getNextPlayerIndex: (current: number, total: number, direction: Direction, skip?: number) => number;
}

export interface HouseRulePlugin {
  meta: RuleMetadata;
  isEnabled: (hr: HouseRules) => boolean;
  preCheck?: (state: GameState, action: GameAction, ctx: RuleContext) => PreCheckResult;
  postProcess?: (before: GameState, after: GameState, action: GameAction, ctx: RuleContext) => GameState;
}
