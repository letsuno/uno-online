import type { Card, Color } from '../types/card.js';
import type { GameState, Direction, Player } from '../types/game.js';
import type { HouseRules } from '../types/house-rules.js';
import type { UserRole } from '../types/role.js';
import { isColoredCard } from '../types/card.js';
import { createDeck, shuffleDeck } from './deck.js';
import { getNextPlayerIndex, reverseDirection } from './turn.js';
import { INITIAL_HAND_SIZE } from '../constants/deck.js';
import { DEFAULT_TARGET_SCORE, DEFAULT_TURN_TIME_LIMIT } from '../constants/scoring.js';
import { DEFAULT_HOUSE_RULES } from '../types/house-rules.js';
import { PENALTY_STATE_DEFAULTS } from './game-engine.js';

export interface DealResult {
  hands: Record<string, Card[]>;
  remainingDeck: Card[];
}

export function dealCards(
  deck: readonly Card[],
  playerIds: readonly string[],
  cardsPerPlayer: number,
): DealResult {
  const remaining = [...deck];
  const hands: Record<string, Card[]> = {};

  for (const id of playerIds) {
    hands[id] = [];
  }

  for (let i = 0; i < cardsPerPlayer; i++) {
    for (const id of playerIds) {
      const card = remaining.shift();
      if (card) {
        hands[id]!.push(card);
      }
    }
  }

  return { hands, remainingDeck: remaining };
}

export type FirstCardEffect =
  | { type: 'skip' }
  | { type: 'reverse' }
  | { type: 'draw_two' }
  | { type: 'choose_color' }
  | null;

export interface FirstDiscardResult {
  topCard: Card;
  remainingDeck: Card[];
  effect: FirstCardEffect;
}

export function handleFirstDiscard(deck: readonly Card[], skipWild?: boolean): FirstDiscardResult {
  const remaining = [...deck];

  while (remaining.length > 0) {
    const card = remaining.shift()!;

    if (card.type === 'wild_draw_four') {
      remaining.push(card);
      continue;
    }

    if (skipWild && card.type === 'wild') {
      remaining.push(card);
      continue;
    }

    let effect: FirstCardEffect = null;
    if (card.type === 'skip') effect = { type: 'skip' };
    else if (card.type === 'reverse') effect = { type: 'reverse' };
    else if (card.type === 'draw_two') effect = { type: 'draw_two' };
    else if (card.type === 'wild') effect = { type: 'choose_color' };

    return { topCard: card, remainingDeck: remaining, effect };
  }

  throw new Error('Deck is empty — cannot draw first discard');
}

function splitDeck(deck: Card[]): { deckLeft: Card[]; deckRight: Card[]; deckLeftInitialCount: number; deckRightInitialCount: number } {
  const half = Math.ceil(deck.length / 2);
  return {
    deckLeft: deck.slice(0, half),
    deckRight: deck.slice(half),
    deckLeftInitialCount: half,
    deckRightInitialCount: deck.length - half,
  };
}

function applyFirstDiscardEffect(
  effect: FirstCardEffect,
  players: Player[],
  currentPlayerIndex: number,
  direction: Direction,
  deckAfterDiscard: Card[],
): { currentPlayerIndex: number; direction: Direction; phase: GameState['phase'] } {
  let phase: GameState['phase'] = 'playing';
  if (!effect) return { currentPlayerIndex, direction, phase };

  switch (effect.type) {
    case 'skip':
      currentPlayerIndex = getNextPlayerIndex(currentPlayerIndex, players.length, direction);
      break;
    case 'reverse':
      direction = reverseDirection(direction);
      break;
    case 'draw_two': {
      const targetPlayer = players[currentPlayerIndex];
      if (targetPlayer) {
        const drawn = deckAfterDiscard.splice(0, 2);
        targetPlayer.hand.push(...drawn);
      }
      currentPlayerIndex = getNextPlayerIndex(currentPlayerIndex, players.length, direction);
      break;
    }
    case 'choose_color':
      phase = 'choosing_color';
      break;
  }

  return { currentPlayerIndex, direction, phase };
}

export function initializeGame(
  playerData: readonly { id: string; name: string; avatarUrl?: string | null; role?: UserRole; isBot?: boolean | undefined }[],
  houseRules?: HouseRules,
): GameState {
  const deck = shuffleDeck(createDeck());

  const playerIds = playerData.map(p => p.id);
  const { hands, remainingDeck: deckAfterDeal } = dealCards(deck, playerIds, INITIAL_HAND_SIZE);
  const skipWild = houseRules ? !houseRules.wildFirstTurn : false;
  const { topCard, remainingDeck: deckAfterDiscard, effect } = handleFirstDiscard(deckAfterDeal, skipWild);

  const players: Player[] = playerData.map((p, i) => ({
    id: p.id,
    name: p.name,
    hand: hands[p.id]!,
    score: 0,
    roundWins: 0,
    connected: true,
    autopilot: false,
    calledUno: false,
    unoCaught: false,
    eliminated: false,
    teamId: (houseRules?.teamMode && playerData.length % 2 === 0) ? (i % 2) : undefined,
    avatarUrl: p.avatarUrl ?? null,
    role: p.role,
    isBot: p.isBot ?? false,
  }));

  const currentColor: Color | null = isColoredCard(topCard) ? topCard.color : null;
  const applied = applyFirstDiscardEffect(effect, players, 0, 'clockwise', deckAfterDiscard);

  return {
    phase: applied.phase,
    players,
    currentPlayerIndex: applied.currentPlayerIndex,
    direction: applied.direction,
    ...splitDeck(deckAfterDiscard),
    discardPile: [topCard],
    currentColor,
    ...PENALTY_STATE_DEFAULTS,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    deckHash: '',
    settings: {
      turnTimeLimit: DEFAULT_TURN_TIME_LIMIT as 30,
      targetScore: DEFAULT_TARGET_SCORE as 500,
      houseRules: houseRules ?? DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden' as const,
    },
  };
}

export function initializeNextRound(prevState: GameState): GameState {
  const hr = prevState.settings.houseRules;
  const deck = shuffleDeck(createDeck());
  const playerIds = prevState.players.filter(p => !p.eliminated).map(p => p.id);
  const { hands, remainingDeck: deckAfterDeal } = dealCards(deck, playerIds, INITIAL_HAND_SIZE);
  const skipWild = !hr.wildFirstTurn;
  const { topCard, remainingDeck: deckAfterDiscard, effect } = handleFirstDiscard(deckAfterDeal, skipWild);

  let players: Player[] = prevState.players.map(p => ({
    ...p,
    hand: hands[p.id] ?? [],
    calledUno: false,
    unoCaught: false,
    roundWins: p.roundWins ?? 0,
    connected: p.connected,
    autopilot: p.autopilot,
  }));

  if (hr.shuffleSeats) {
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j]!, players[i]!];
    }
  }

  const currentColor: Color | null = isColoredCard(topCard) ? topCard.color : null;
  const applied = applyFirstDiscardEffect(effect, players, prevState.currentPlayerIndex, 'clockwise', deckAfterDiscard);

  return {
    phase: applied.phase,
    players,
    currentPlayerIndex: applied.currentPlayerIndex,
    direction: applied.direction,
    ...splitDeck(deckAfterDiscard),
    discardPile: [topCard],
    currentColor,
    ...PENALTY_STATE_DEFAULTS,
    lastAction: null,
    roundNumber: prevState.roundNumber + 1,
    winnerId: null,
    deckHash: '',
    settings: prevState.settings,
  };
}
