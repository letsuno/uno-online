import { createHash } from 'node:crypto';
import { initializeGame, applyActionWithHouseRules, GameEventType } from '@uno-online/shared';
import { initializeNextRound, serializeDecks } from '@uno-online/shared';
import type { GameState, GameAction, RoomSettings, UserRole } from '@uno-online/shared';
import type { Card } from '@uno-online/shared';
import type { GameEvent, GameEventPayload, GameEventType as GameEventTypeValue } from '@uno-online/shared';
import type { ChatMessage } from '@uno-online/shared';

export interface PlayerView {
  viewerId: string;
  phase: GameState['phase'];
  players: {
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
  }[];
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
}

interface ActionResult {
  success: boolean;
  error?: string;
  drawnCard?: Card;
}

export class GameSession {
  private state: GameState;
  private events: GameEvent[] = [];
  private chatHistory: ChatMessage[] = [];
  private initialDeckSerialized: string = '';

  private constructor(state: GameState) {
    this.state = state;
  }

  private static computeDeckHash(state: GameState): string {
    const serialized = serializeDecks(state.deckLeft, state.deckRight);
    return createHash('sha256').update(serialized).digest('hex');
  }

  static create(players: { id: string; name: string; avatarUrl?: string | null; role?: UserRole }[], settings?: RoomSettings): GameSession {
    const state = initializeGame(players, settings?.houseRules);
    const deckHash = GameSession.computeDeckHash(state);
    const stateWithExtras = {
      ...state,
      deckHash,
      ...(settings ? { settings } : {}),
    };
    const session = new GameSession(stateWithExtras);
    session.initialDeckSerialized = serializeDecks(state.deckLeft, state.deckRight);
    return session;
  }

  static fromState(state: GameState): GameSession {
    const { chatHistory, ...restState } = state;
    const session = new GameSession(restState);
    session.chatHistory = chatHistory ?? [];
    return session;
  }

  getFullState(): GameState {
    return { ...this.state, chatHistory: this.chatHistory };
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
          roundWins: p.roundWins ?? 0,
          connected: p.connected,
          autopilot: p.autopilot,
          calledUno: p.calledUno,
          unoCaught: p.unoCaught,
          eliminated: p.eliminated,
          teamId: p.teamId,
          avatarUrl: p.avatarUrl,
          role: p.role,
        };
      }),
      currentPlayerIndex: this.state.currentPlayerIndex,
      direction: this.state.direction,
      discardPile: this.state.discardPile,
      currentColor: this.state.currentColor,
      drawStack: this.state.drawStack,
      pendingPenaltyDraws: this.state.pendingPenaltyDraws ?? 0,
      deckLeftCount: this.state.deckLeft.length,
      deckRightCount: this.state.deckRight.length,
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

  removePlayer(playerId: string): void {
    this.state = {
      ...this.state,
      players: this.state.players.filter((p) => p.id !== playerId),
    };
  }

  getPlayerCount(): number {
    return this.state.players.length;
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
    this.state = { ...this.state, deckHash: GameSession.computeDeckHash(this.state) };
    this.initialDeckSerialized = serializeDecks(this.state.deckLeft, this.state.deckRight);
  }

  resetForRematch(): void {
    const players = this.state.players.map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, role: p.role }));
    const settings = this.state.settings;
    const fresh = initializeGame(players, settings.houseRules);
    const deckHash = GameSession.computeDeckHash(fresh);
    this.state = { ...fresh, settings, deckHash };
    this.initialDeckSerialized = serializeDecks(fresh.deckLeft, fresh.deckRight);
    this.events = [];
    this.chatHistory = [];
  }

  recordEvent(eventType: GameEventTypeValue, payload: GameEventPayload, playerId: string | null): void {
    this.events.push({
      seq: this.events.length,
      eventType,
      payload,
      playerId,
      createdAt: new Date().toISOString(),
    });
  }

  getEvents(): GameEvent[] {
    return this.events;
  }

  clearEvents(): void {
    this.events = [];
  }

  addChatMessage(message: ChatMessage): void {
    this.chatHistory = [...this.chatHistory, message].slice(-200);
    this.state = { ...this.state, chatHistory: this.chatHistory };
    this.recordEvent(GameEventType.CHAT_MESSAGE, { message }, message.userId);
  }

  getChatHistory(): ChatMessage[] {
    return this.chatHistory;
  }

  clearChatHistory(): void {
    this.chatHistory = [];
    this.state = { ...this.state, chatHistory: [] };
  }

  getInitialDeckSerialized(): string {
    return this.initialDeckSerialized;
  }

  getSpectatorView(mode: 'full' | 'hidden'): PlayerView {
    return {
      viewerId: '__spectator__',
      phase: this.state.phase,
      players: this.state.players.map((p) => {
        const threshold = this.state.settings.houseRules.handRevealThreshold;
        const shouldReveal =
          mode === 'full' ||
          (threshold !== null && p.hand.length > 0 && p.hand.length <= threshold);
        return {
          id: p.id,
          name: p.name,
          hand: shouldReveal ? p.hand : [],
          handCount: p.hand.length,
          score: p.score,
          roundWins: p.roundWins ?? 0,
          connected: p.connected,
          autopilot: p.autopilot,
          calledUno: p.calledUno,
          unoCaught: p.unoCaught,
          eliminated: p.eliminated,
          teamId: p.teamId,
          avatarUrl: p.avatarUrl,
          role: p.role,
        };
      }),
      currentPlayerIndex: this.state.currentPlayerIndex,
      direction: this.state.direction,
      discardPile: this.state.discardPile,
      currentColor: this.state.currentColor,
      drawStack: this.state.drawStack,
      pendingPenaltyDraws: this.state.pendingPenaltyDraws ?? 0,
      deckLeftCount: this.state.deckLeft.length,
      deckRightCount: this.state.deckRight.length,
      roundNumber: this.state.roundNumber,
      winnerId: this.state.winnerId,
      settings: this.state.settings,
      pendingDrawPlayerId: this.state.pendingDrawPlayerId,
      lastAction: this.state.lastAction,
    };
  }
}
