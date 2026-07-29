import type { Card, Color } from '../types/card.js';
import type { GameState, Direction, GameMode, Player } from '../types/game.js';
import type { HouseRules } from '../types/house-rules.js';
import type { UserRole } from '../types/role.js';
import type { BotConfig } from '../types/bot.js';
import { isColoredCard } from '../types/card.js';
import { createDeck, createFlipDeck, shuffleDeck } from './deck.js';
import { flipAll } from './flip.js';
import { getNextAliveIndex, reverseDirection } from './turn.js';
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
  | { type: 'draw_one' }
  | { type: 'draw_five' }
  | { type: 'skip_everyone' }
  | { type: 'flip' }
  | { type: 'choose_color' }
  | null;

/** 首张弃牌的效果。翻面后的新顶牌也走这里重新判定。 */
export function deriveFirstCardEffect(card: Card): FirstCardEffect {
  switch (card.type) {
    case 'skip': return { type: 'skip' };
    case 'reverse': return { type: 'reverse' };
    case 'draw_two': return { type: 'draw_two' };
    case 'draw_one': return { type: 'draw_one' };
    case 'draw_five': return { type: 'draw_five' };
    case 'skip_everyone': return { type: 'skip_everyone' };
    case 'flip': return { type: 'flip' };
    // 任何无色顶牌都必须先定色，否则会进入 currentColor=null 的非法 playing 状态。
    // 首张弃牌翻面后可能变成暗面的 Wild Draw Color——只判 'wild' 会漏掉它。
    case 'wild':
    case 'wild_draw_two':
    case 'wild_draw_color':
    case 'wild_draw_four': return { type: 'choose_color' };
    default: return null;
  }
}

export interface FirstDiscardResult {
  topCard: Card;
  remainingDeck: Card[];
  effect: FirstCardEffect;
}

export function handleFirstDiscard(deck: readonly Card[], skipWild?: boolean, mode: GameMode = 'classic'): FirstDiscardResult {
  const remaining = [...deck];
  // 官方：万能罚摸牌不能作为首张弃牌，放回牌堆重抽（经典是 +4，Flip 是万能 +2）
  const returnToDeck: Card['type'] = mode === 'flip' ? 'wild_draw_two' : 'wild_draw_four';

  while (remaining.length > 0) {
    const card = remaining.shift()!;

    if (card.type === returnToDeck) {
      remaining.push(card);
      continue;
    }

    if (skipWild && card.type === 'wild') {
      remaining.push(card);
      continue;
    }

    return { topCard: card, remainingDeck: remaining, effect: deriveFirstCardEffect(card) };
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
      currentPlayerIndex = getNextAliveIndex(players, currentPlayerIndex, direction);
      break;
    case 'reverse':
      direction = reverseDirection(direction);
      break;
    case 'draw_two':
    case 'draw_one':
    case 'draw_five': {
      const count = effect.type === 'draw_one' ? 1 : effect.type === 'draw_five' ? 5 : 2;
      const targetPlayer = players[currentPlayerIndex];
      if (targetPlayer) {
        const drawn = deckAfterDiscard.splice(0, count);
        targetPlayer.hand.push(...drawn);
      }
      currentPlayerIndex = getNextAliveIndex(players, currentPlayerIndex, direction);
      break;
    }
    case 'skip_everyone':
      // 本项目裁定：所有人被跳过一圈后轮次回到起点，等价于首家正常开局
      break;
    case 'flip':
      // 由 applyFirstFlip 在状态构建后处理——翻面需要整局状态
      break;
    case 'choose_color':
      phase = 'choosing_color';
      break;
  }

  return { currentPlayerIndex, direction, phase };
}

/**
 * 首张弃牌是 Flip 卡时立即生效：整局翻到暗面，然后按翻面后的新顶牌重新判定效果。
 *
 * 本项目裁定（设计文档 §4.6）：官方对首张功能牌统一「按功能牌规则处理」，
 * Flip 是功能牌，没有理由例外。
 *
 * 实物牌组中 Flip 卡的背面从来不是 Flip 卡（见附录 A 的配对表），因此只需翻一次；
 * 循环上限只是防御性保护。
 */
function applyFirstFlip(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 4; guard++) {
    next = flipAll(next);
    const topCard = next.discardPile[next.discardPile.length - 1]!;
    const effect = deriveFirstCardEffect(topCard);
    if (effect?.type === 'flip') continue;

    const players = next.players.map(p => ({ ...p, hand: [...p.hand] }));
    const deckAfterDiscard = [...next.deckLeft, ...next.deckRight];
    const applied = applyFirstDiscardEffect(effect, players, next.currentPlayerIndex, next.direction, deckAfterDiscard);
    const half = Math.ceil(deckAfterDiscard.length / 2);

    return {
      ...next,
      players,
      deckLeft: deckAfterDiscard.slice(0, half),
      deckRight: deckAfterDiscard.slice(half),
      currentPlayerIndex: applied.currentPlayerIndex,
      direction: applied.direction,
      phase: applied.phase,
    };
  }
  return next;
}

export function initializeGame(
  playerData: readonly { id: string; name: string; avatarUrl?: string | null; role?: UserRole; isBot?: boolean | undefined; botConfig?: BotConfig }[],
  houseRules?: HouseRules,
  gameMode: GameMode = 'classic',
): GameState {
  const deck = shuffleDeck(gameMode === 'flip' ? createFlipDeck() : createDeck());

  const playerIds = playerData.map(p => p.id);
  const { hands, remainingDeck: deckAfterDeal } = dealCards(deck, playerIds, INITIAL_HAND_SIZE);
  const skipWild = houseRules ? !houseRules.wildFirstTurn : false;
  const { topCard, remainingDeck: deckAfterDiscard, effect } = handleFirstDiscard(deckAfterDeal, skipWild, gameMode);

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
    botConfig: p.botConfig,
  }));

  const currentColor: Color | null = isColoredCard(topCard) ? topCard.color : null;
  const applied = applyFirstDiscardEffect(effect, players, 0, 'clockwise', deckAfterDiscard);

  const state: GameState = {
    phase: applied.phase,
    players,
    currentPlayerIndex: applied.currentPlayerIndex,
    direction: applied.direction,
    ...splitDeck(deckAfterDiscard),
    discardPile: [topCard],
    currentColor,
    flipSide: 'light',
    ...PENALTY_STATE_DEFAULTS,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    deckHash: '',
    settings: {
      turnTimeLimit: DEFAULT_TURN_TIME_LIMIT as 30,
      targetScore: DEFAULT_TARGET_SCORE as 1000,
      gameMode,
      houseRules: houseRules ?? DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden' as const,
    },
  };

  return effect?.type === 'flip' ? applyFirstFlip(state) : state;
}

export function initializeNextRound(prevState: GameState): GameState {
  const hr = prevState.settings.houseRules;
  const gameMode = prevState.settings.gameMode ?? 'classic';
  const deck = shuffleDeck(gameMode === 'flip' ? createFlipDeck() : createDeck());
  const playerIds = prevState.players.filter(p => !p.eliminated).map(p => p.id);
  const { hands, remainingDeck: deckAfterDeal } = dealCards(deck, playerIds, INITIAL_HAND_SIZE);
  const skipWild = !hr.wildFirstTurn;
  const { topCard, remainingDeck: deckAfterDiscard, effect } = handleFirstDiscard(deckAfterDeal, skipWild, gameMode);

  let players: Player[] = prevState.players.map(p => ({
    ...p,
    hand: hands[p.id] ?? [],
    calledUno: false,
    unoCaught: false,
    roundWins: p.roundWins ?? 0,
    connected: p.connected,
    autopilot: p.autopilot,
    botConfig: p.botConfig,
  }));

  if (hr.shuffleSeats) {
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j]!, players[i]!];
    }
  }

  const currentColor: Color | null = isColoredCard(topCard) ? topCard.color : null;
  let startIdx = players.length > 0 ? prevState.currentPlayerIndex % players.length : 0;
  if (players[startIdx]?.eliminated) {
    startIdx = getNextAliveIndex(players, startIdx, 'clockwise');
  }
  const applied = applyFirstDiscardEffect(effect, players, startIdx, 'clockwise', deckAfterDiscard);

  const state: GameState = {
    phase: applied.phase,
    players,
    currentPlayerIndex: applied.currentPlayerIndex,
    direction: applied.direction,
    ...splitDeck(deckAfterDiscard),
    discardPile: [topCard],
    currentColor,
    flipSide: 'light',
    ...PENALTY_STATE_DEFAULTS,
    lastAction: null,
    roundNumber: prevState.roundNumber + 1,
    winnerId: null,
    deckHash: '',
    settings: prevState.settings,
  };

  return effect?.type === 'flip' ? applyFirstFlip(state) : state;
}
