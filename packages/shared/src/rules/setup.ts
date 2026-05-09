import type { Card, Color } from '../types/card';
import type { GameState, Player } from '../types/game';
import type { HouseRules } from '../types/house-rules';
import type { UserRole } from '../types/role';
import { isColoredCard } from '../types/card';
import { createDeck, shuffleDeck } from './deck';
import { getNextPlayerIndex, reverseDirection } from './turn';
import { INITIAL_HAND_SIZE } from '../constants/deck';
import { DEFAULT_TARGET_SCORE, DEFAULT_TURN_TIME_LIMIT } from '../constants/scoring';
import { DEFAULT_HOUSE_RULES } from '../types/house-rules';

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

export function initializeGame(
  playerData: readonly { id: string; name: string; avatarUrl?: string | null; role?: UserRole }[],
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
    connected: true,
    autopilot: false,
    calledUno: false,
    unoCaught: false,
    eliminated: false,
    teamId: (houseRules?.teamMode && playerData.length % 2 === 0) ? (i % 2) : undefined,
    avatarUrl: p.avatarUrl ?? null,
    role: p.role,
  }));

  let direction: GameState['direction'] = 'clockwise';
  let currentPlayerIndex = 0;
  let currentColor: Color | null = isColoredCard(topCard) ? topCard.color : null;
  let phase: GameState['phase'] = 'playing';

  if (effect) {
    switch (effect.type) {
      case 'skip':
        currentPlayerIndex = getNextPlayerIndex(0, players.length, direction);
        break;
      case 'reverse':
        direction = reverseDirection(direction);
        break;
      case 'draw_two': {
        const targetPlayer = players[0]!;
        const drawCards = deckAfterDiscard.splice(0, 2);
        targetPlayer.hand.push(...drawCards);
        currentPlayerIndex = getNextPlayerIndex(0, players.length, direction);
        break;
      }
      case 'choose_color':
        phase = 'choosing_color';
        break;
    }
  }

  return {
    phase,
    players,
    currentPlayerIndex,
    direction,
    deck: deckAfterDiscard,
    discardPile: [topCard],
    currentColor,
    drawStack: 0,
    pendingDrawPlayerId: null,
    pendingPenaltyDraws: 0,
    pendingPenaltyNextPlayerIndex: null,
    pendingPenaltySourcePlayerId: null,
    pendingPenaltyQueue: [],
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

  const players: Player[] = prevState.players.map(p => ({
    ...p,
    hand: hands[p.id] ?? [],
    calledUno: false,
    unoCaught: false,
    connected: p.connected,
    autopilot: p.autopilot,
  }));

  let direction: GameState['direction'] = 'clockwise';
  let currentPlayerIndex = prevState.currentPlayerIndex;
  let currentColor: Color | null = isColoredCard(topCard) ? topCard.color : null;
  let phase: GameState['phase'] = 'playing';

  if (effect) {
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
          const drawCards = deckAfterDiscard.splice(0, 2);
          targetPlayer.hand.push(...drawCards);
        }
        currentPlayerIndex = getNextPlayerIndex(currentPlayerIndex, players.length, direction);
        break;
      }
      case 'choose_color':
        phase = 'choosing_color';
        break;
    }
  }

  return {
    phase,
    players,
    currentPlayerIndex,
    direction,
    deck: deckAfterDiscard,
    discardPile: [topCard],
    currentColor,
    drawStack: 0,
    pendingDrawPlayerId: null,
    pendingPenaltyDraws: 0,
    pendingPenaltyNextPlayerIndex: null,
    pendingPenaltySourcePlayerId: null,
    pendingPenaltyQueue: [],
    lastAction: null,
    roundNumber: prevState.roundNumber + 1,
    winnerId: null,
    deckHash: '',
    settings: prevState.settings,
  };
}
