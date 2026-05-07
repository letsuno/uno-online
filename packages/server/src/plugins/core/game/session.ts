import { initializeGame, applyActionWithHouseRules } from '@uno-online/shared';
import { initializeNextRound } from '@uno-online/shared';
import type { GameState, GameAction, RoomSettings, UserRole } from '@uno-online/shared';
import type { Card } from '@uno-online/shared';

export interface PlayerView {
  viewerId: string;
  phase: GameState['phase'];
  players: {
    id: string;
    name: string;
    hand: Card[];
    handCount: number;
    score: number;
    connected: boolean;
    autopilot: boolean;
    calledUno: boolean;
    eliminated?: boolean;
    teamId?: number;
    avatarUrl?: string | null;
    role?: string;
  }[];
  currentPlayerIndex: number;
  direction: GameState['direction'];
  discardPile: Card[];
  currentColor: GameState['currentColor'];
  drawStack: number;
  deckCount: number;
  roundNumber: number;
  winnerId: string | null;
  settings: GameState['settings'];
  pendingDrawPlayerId: string | null;
  lastAction: GameState['lastAction'];
}

interface ActionResult {
  success: boolean;
  error?: string;
  drawnCard?: Card;
}

export class GameSession {
  private state: GameState;

  private constructor(state: GameState) {
    this.state = state;
  }

  static create(players: { id: string; name: string; avatarUrl?: string | null; role?: UserRole }[], settings?: RoomSettings): GameSession {
    const state = initializeGame(players, settings?.houseRules);
    const stateWithSettings = settings
      ? { ...state, settings }
      : state;
    return new GameSession(stateWithSettings);
  }

  static fromState(state: GameState): GameSession {
    return new GameSession(state);
  }

  getFullState(): GameState {
    return this.state;
  }

  getPlayerView(playerId: string): PlayerView {
    return {
      viewerId: playerId,
      phase: this.state.phase,
      players: this.state.players.map((p) => {
        const threshold = this.state.settings.houseRules.handRevealThreshold;
        const shouldReveal =
          p.id === playerId ||
          (threshold !== null && p.hand.length > 0 && p.hand.length <= threshold);
        return {
          id: p.id,
          name: p.name,
          hand: shouldReveal ? p.hand : [],
          handCount: p.hand.length,
          score: p.score,
          connected: p.connected,
          autopilot: p.autopilot,
          calledUno: p.calledUno,
          eliminated: p.eliminated,
          teamId: p.teamId,
          avatarUrl: p.avatarUrl,
          role: p.role,
        };
      }),
      currentPlayerIndex: this.state.currentPlayerIndex,
      direction: this.state.direction,
      discardPile: this.state.discardPile.slice(-1),
      currentColor: this.state.currentColor,
      drawStack: this.state.drawStack,
      deckCount: this.state.deck.length,
      roundNumber: this.state.roundNumber,
      winnerId: this.state.winnerId,
      settings: this.state.settings,
      pendingDrawPlayerId: this.state.pendingDrawPlayerId,
      lastAction: this.state.lastAction,
    };
  }

  applyAction(action: GameAction): ActionResult {
    const prevState = this.state;
    const newState = applyActionWithHouseRules(this.state, action);

    if (newState === prevState) {
      return { success: false, error: 'Invalid action' };
    }

    let drawnCard: Card | undefined;
    if (action.type === 'DRAW_CARD') {
      const prevPlayer = prevState.players.find((p) => p.id === action.playerId);
      const newPlayer = newState.players.find((p) => p.id === action.playerId);
      if (prevPlayer && newPlayer && newPlayer.hand.length > prevPlayer.hand.length) {
        drawnCard = newPlayer.hand[newPlayer.hand.length - 1];
      }
    }

    this.state = newState;
    return { success: true, drawnCard };
  }

  setPlayerConnected(playerId: string, connected: boolean): void {
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === playerId ? { ...p, connected } : p,
      ),
    };
  }

  setPlayerAutopilot(playerId: string, autopilot: boolean): void {
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === playerId ? { ...p, autopilot } : p,
      ),
    };
  }

  getCurrentPlayerId(): string {
    return this.state.players[this.state.currentPlayerIndex]!.id;
  }

  isGameOver(): boolean {
    return this.state.phase === 'game_over';
  }

  isRoundEnd(): boolean {
    return this.state.phase === 'round_end';
  }

  forceGameOver(winnerId: string): void {
    this.state = {
      ...this.state,
      phase: 'game_over',
      winnerId,
    };
  }

  startNextRound(): void {
    this.state = initializeNextRound(this.state);
  }

  resetForRematch(): void {
    const players = this.state.players.map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, role: p.role }));
    const settings = this.state.settings;
    const fresh = initializeGame(players, settings.houseRules);
    this.state = { ...fresh, settings };
  }
}
