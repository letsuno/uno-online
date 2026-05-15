import { createHash } from 'node:crypto';
import { initializeGame, applyActionWithHouseRules } from '@uno-online/shared';
import { initializeNextRound, serializeDecks } from '@uno-online/shared';
import type { GameState, GameAction, RoomSettings, UserRole } from '@uno-online/shared';
import type { Card } from '@uno-online/shared';
import type { ChatMessage, PlayerView } from '@uno-online/shared';

export type { PlayerView };

interface ActionResult {
  success: boolean;
  error?: string;
  drawnCard?: Card;
}

export class GameSession {
  private state: GameState;
  private initialDeckSerialized: string = '';
  private _spectatorMode: 'full' | 'hidden' = 'hidden';

  get spectatorMode(): 'full' | 'hidden' {
    return this._spectatorMode;
  }

  private constructor(state: GameState) {
    this.state = state;
  }

  private static computeDeckHash(state: GameState): string {
    const serialized = serializeDecks(state.deckLeft, state.deckRight);
    return createHash('sha256').update(serialized).digest('hex');
  }

  static create(players: { id: string; name: string; avatarUrl?: string | null; role?: UserRole; isBot?: boolean }[], settings?: RoomSettings): GameSession {
    const state = initializeGame(players, settings?.houseRules);
    const deckHash = GameSession.computeDeckHash(state);
    const stateWithExtras = {
      ...state,
      deckHash,
      ...(settings ? { settings } : {}),
    };
    const session = new GameSession(stateWithExtras);
    session._spectatorMode = settings?.spectatorMode ?? 'hidden';
    session.initialDeckSerialized = serializeDecks(state.deckLeft, state.deckRight);
    return session;
  }

  static fromState(state: GameState): GameSession {
    const session = new GameSession({ ...state, chatHistory: state.chatHistory ?? [] });
    session._spectatorMode = state.settings?.spectatorMode ?? 'hidden';
    return session;
  }

  getFullState(): GameState {
    return this.state;
  }

  private static readonly DISCARD_TRUNCATE = 10;

  private buildPlayerViews(viewerId: string, shouldReveal: (playerId: string) => boolean): PlayerView {
    const threshold = this.state.settings.houseRules.handRevealThreshold;
    const fullPile = this.state.discardPile;
    const truncated = fullPile.length > GameSession.DISCARD_TRUNCATE;
    return {
      viewerId,
      phase: this.state.phase,
      players: this.state.players.map((p) => {
        const reveal =
          shouldReveal(p.id) ||
          (threshold !== null && p.hand.length > 0 && p.hand.length <= threshold);
        return {
          id: p.id,
          name: p.name,
          hand: reveal ? p.hand : [],
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
          isBot: p.isBot,
        };
      }),
      currentPlayerIndex: this.state.currentPlayerIndex,
      direction: this.state.direction,
      discardPile: truncated ? fullPile.slice(-GameSession.DISCARD_TRUNCATE) : fullPile,
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
      ...(truncated ? { discardPileCount: fullPile.length } : {}),
    };
  }

  getPlayerView(playerId: string): PlayerView {
    return this.buildPlayerViews(playerId, id => id === playerId);
  }

  getGameUpdateBatch(): { baseView: PlayerView; hands: Map<string, Card[]> } {
    const baseView = this.buildPlayerViews('__batch__', () => false);
    const hands = new Map<string, Card[]>();
    for (const p of this.state.players) {
      hands.set(p.id, p.hand);
    }
    return { baseView, hands };
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

  addPlayer(data: { id: string; name: string; avatarUrl?: string | null; role?: UserRole; isBot?: boolean }): void {
    if (this.state.players.some((p) => p.id === data.id)) return;
    this.state = {
      ...this.state,
      players: [
        ...this.state.players,
        {
          id: data.id,
          name: data.name,
          hand: [],
          score: 0,
          roundWins: 0,
          connected: true,
          autopilot: false,
          calledUno: false,
          unoCaught: false,
          eliminated: false,
          avatarUrl: data.avatarUrl ?? null,
          role: data.role,
          isBot: data.isBot ?? false,
        },
      ],
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
    const players = this.state.players.map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, role: p.role, isBot: p.isBot }));
    const settings = this.state.settings;
    const fresh = initializeGame(players, settings.houseRules);
    const deckHash = GameSession.computeDeckHash(fresh);
    this.state = { ...fresh, settings, deckHash, chatHistory: [] };
    this.initialDeckSerialized = serializeDecks(fresh.deckLeft, fresh.deckRight);
  }

  addChatMessage(message: ChatMessage): void {
    this.state = { ...this.state, chatHistory: [...(this.state.chatHistory ?? []), message].slice(-200) };
  }

  getChatHistory(): ChatMessage[] {
    return this.state.chatHistory ?? [];
  }

  clearChatHistory(): void {
    this.state = { ...this.state, chatHistory: [] };
  }

  getInitialDeckSerialized(): string {
    return this.initialDeckSerialized;
  }

  getSpectatorView(mode: 'full' | 'hidden'): PlayerView {
    return this.buildPlayerViews('__spectator__', () => mode === 'full');
  }
}
