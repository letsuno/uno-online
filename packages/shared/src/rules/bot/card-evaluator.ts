import type { Card, Color } from '../../types/card.js';
import type { GameState, Player } from '../../types/game.js';
import type { DifficultyParams } from './difficulty-params.js';
import type { PersonalityWeights } from './personality-weights.js';
import { emptyColorCounts, isColoredCard, isWildCard } from '../../types/card.js';
import { getPlayableCards, isValidWildDrawFour } from '../validation.js';
import { getNextPlayerIndex, getNextAliveIndex, reverseDirection } from '../turn.js';

interface EvalContext {
  botIndex: number;
  nextPlayer: Player | undefined;
  bot: Player | undefined;
  alivePlayers: Player[];
  maxOpponentHand: number;
  avgHandSize: number;
  isAlly: (player: Player) => boolean;
  leadBot: Player | null;
}

export interface CardScoreFactors {
  colorMatch: number;
  actionValue: number;
  handReduction: number;
  finishSafety: number;
  specialTiming: number;
  teamAwareness: number;
  targetPressure: number;
  cardConservation: number;
  globalThreat: number;
  coalitionTactics: number;
  wildFourRisk: number;
}

export interface CardScore {
  card: Card;
  score: number;
  factors: CardScoreFactors;
}

/** 带色功能牌（非万能）。经典与 Flip 通用。 */
const ACTION_TYPES = new Set<Card['type']>([
  'draw_two', 'skip', 'reverse',
  'draw_one', 'draw_five', 'skip_everyone', 'flip',
]);

function countColorInHand(hand: Card[], color: Color, excludeId?: string): number {
  return hand.filter(c => c.id !== excludeId && isColoredCard(c) && c.color === color).length;
}

export function bestColorForHand(hand: Card[], excludeId?: string): Color {
  return bestColorsForHand(hand, excludeId)[0]!;
}

/**
 * All colors tied for the highest count in hand, in fixed color order.
 * Callers that pick randomly among these avoid a predictable red bias.
 *
 * 计数表覆盖全部 8 色（含 UNO Flip 暗面），最大值也在全部键上取——
 * 只对亮面四色取 max 的话，暗面手牌会算出一堆计数为 0 的亮色。
 */
export function bestColorsForHand(hand: Card[], excludeId?: string): Color[] {
  const counts: Record<Color, number> = emptyColorCounts();
  for (const c of hand) {
    if (c.id !== excludeId && isColoredCard(c)) counts[c.color]++;
  }
  const max = Math.max(...Object.values(counts));
  return (Object.keys(counts) as Color[]).filter(color => counts[color] === max);
}


function scoreColorMatch(card: Card, hand: Card[], currentColor: Color | null, params: DifficultyParams, ctx: EvalContext): number {
  if (!currentColor || isWildCard(card)) return 0;
  if (!isColoredCard(card)) return 0;
  let score: number;
  if (card.color === currentColor) {
    score = 5 + countColorInHand(hand, card.color, card.id);
  } else {
    score = countColorInHand(hand, card.color, card.id);
  }

  // Coalition: boost colors the lead bot can play
  const { leadBot } = ctx;
  if (params.botCoalition && leadBot && leadBot.id !== ctx.bot?.id) {
    score += countColorInHand(leadBot.hand, card.color) * 1.5;
  }

  return score;
}

function scoreActionValue(card: Card): number {
  switch (card.type) {
    case 'wild_draw_four': return 10;
    case 'draw_two': return 8;
    case 'skip': return 6;
    case 'reverse': return 5;
    case 'wild': return 4;
    case 'number': return 1;
    // UNO Flip：按罚则强度排序。Flip 卡本身价值由 scoreSpecialTiming 单独判断，
    // 这里只给一个中性底分，避免无脑翻面。
    case 'wild_draw_color': return 12;
    case 'draw_five': return 10;
    case 'wild_draw_two': return 9;
    case 'skip_everyone': return 8;
    case 'draw_one': return 4;
    case 'flip': return 3;
    default: return 0;
  }
}

/**
 * 该不该翻面。
 *
 * ⚠️ 公平性红线：机器人**不能**读自己手牌的背面（`card.back`）——人类玩家看不到自己的背面，
 * 机器人也不许看。所以这里只用两类合法信息：
 *   1. 自己手牌的**张数**和当前面的可打性
 *   2. **对手手牌的背面**（handBacks 对所有人可见，人类高手同样靠这个判断）
 */
function scoreFlipDesirability(
  hand: Card[],
  state: GameState,
  params: DifficultyParams,
  ctx: EvalContext,
): number {
  const goingToDark = state.flipSide === 'light';
  let score = 0;

  // 对手接近 UNO → 翻到暗面（+5 / 摸到指定色）压制力更强
  const minOpponentHand = ctx.alivePlayers.length > 0
    ? Math.min(...ctx.alivePlayers.map(p => p.hand.length))
    : 99;
  if (goingToDark && minOpponentHand <= 2) score += 6;
  if (!goingToDark && minOpponentHand <= 2) score -= 3;

  // 自己手牌多 → 暗面被罚一次损失更大；手牌少则相反
  if (hand.length >= 8) score += goingToDark ? -5 : 4;
  else if (hand.length <= 3) score += goingToDark ? 3 : -2;

  // 读对手背面：翻面后他们手上会变成什么
  const tier = params.infoAccess.flipBackReading;
  if (tier !== 'none') {
    const backs = ctx.alivePlayers.flatMap(p => p.hand.map(c => c.back).filter(Boolean));
    if (backs.length > 0) {
      if (tier === 'full') {
        // 翻面后对手能拿到的重罚牌越多，翻过去越亏
        const heavy = backs.filter(b =>
          b!.type === 'draw_five' || b!.type === 'wild_draw_color'
          || b!.type === 'wild_draw_two' || b!.type === 'draw_one').length;
        score -= heavy * 1.2;
      } else {
        // 'color' 档：看不出卡型，只按「对手翻面后有多少张同色可打牌」粗判
        const colorCounts = emptyColorCounts();
        for (const b of backs) { if (b!.color) colorCounts[b!.color]++; }
        const maxColor = Math.max(...Object.values(colorCounts));
        score -= maxColor * 0.4;
      }
    }
  }

  return score;
}

function scoreHandReduction(card: Card, hand: Card[], state: GameState, params: DifficultyParams, ctx: EvalContext): number {
  const remaining = hand.filter(c => c.id !== card.id);
  if (remaining.length === 0) return 20;
  let colorAfter: Color;
  if (isColoredCard(card)) {
    colorAfter = card.color;
  } else if (params.botCoalition && ctx.leadBot && ctx.leadBot.id !== ctx.bot?.id) {
    // Predict coalition color choice: blend own best color with lead bot's needs
    const ownBest = bestColorForHand(remaining);
    const leadBest = bestColorForHand(ctx.leadBot.hand);
    colorAfter = countColorInHand(remaining, leadBest) > 0 ? leadBest : ownBest;
  } else {
    colorAfter = bestColorForHand(remaining);
  }
  const playableAfter = getPlayableCards(remaining, card, colorAfter);
  let score = playableAfter.length * 2;

  // Elimination mode: urgency boost when at risk of being eliminated
  if (state.settings.houseRules.elimination && params.considerOpponentHandSize) {
    const { maxOpponentHand, avgHandSize, isAlly } = ctx;

    if (hand.length >= maxOpponentHand) {
      score += 15;
    } else if (hand.length > avgHandSize) {
      score += 8;
    }

    // Coalition: relax urgency when a human has the most cards (they'll be eliminated first)
    if (params.botCoalition && hand.length < maxOpponentHand) {
      const humanMaxHolder = state.players.some(p => !p.eliminated && !isAlly(p) && p.hand.length >= maxOpponentHand);
      if (humanMaxHolder) score -= 5;
    }
  }

  // Hand limit: urgency when approaching cap
  const handLimit = state.settings.houseRules.handLimit;
  if (handLimit !== null && hand.length >= handLimit - 2) {
    if (hand.length >= handLimit) {
      // At limit — can't draw more, must play something
      score += 12;
    } else if (hand.length === handLimit - 1) {
      // One card from limit
      score += 8;
    } else {
      // Two cards from limit
      score += 4;
    }
  }

  return score;
}

function isCardFinishBlocked(c: Card, hr: GameState['settings']['houseRules']): boolean {
  return (hr.noWildFinish && isWildCard(c)) ||
    (hr.noFunctionCardFinish && (c.type === 'draw_two' || c.type === 'wild_draw_four'));
}

function scoreFinishSafety(card: Card, hand: Card[], state: GameState, params: DifficultyParams): number {
  if (!params.finishRestrictionAwareness) return 0;

  const hr = state.settings.houseRules;

  // Multi-card play: playing a number card may also remove all same-value cards
  if (hr.multiplePlaySameNumber && card.type === 'number' && params.specialCardAwareness > 0) {
    const pickValue = (card as { value: number }).value;
    const afterChain = hand.filter(c =>
      c.id !== card.id && !(c.type === 'number' && (c as { value: number }).value === pickValue));
    if (afterChain.length === 1 && isCardFinishBlocked(afterChain[0]!, hr)) {
      return -15;
    }
  }

  if (hand.length > 2) return 0;

  const remaining = hand.filter(c => c.id !== card.id);
  if (remaining.length !== 1) return 0;
  const lastCard = remaining[0]!;

  return isCardFinishBlocked(lastCard, hr) ? -15 : 5;
}

export function evaluateHandQuality(hand: Card[], state: GameState): number {
  let quality = 0;
  quality -= hand.length * 2;
  quality += hand.filter(c => isWildCard(c)).length * 4;
  const colorSet = new Set<string>();
  for (const c of hand) { if (isColoredCard(c)) colorSet.add(c.color); }
  quality += colorSet.size * 1.5;
  quality += hand.filter(c => ACTION_TYPES.has(c.type)).length * 1;
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (topCard && state.currentColor) {
    quality += getPlayableCards(hand, topCard, state.currentColor).length * 2;
  }
  return quality;
}

/**
 * Win-proximity metric for coalition lead selection.
 * Heavily weights low card count (the primary win condition)
 * with a smaller quality bonus to break ties.
 */
export function evaluateWinProximity(hand: Card[], state: GameState): number {
  let score = -hand.length * 5;
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (topCard && state.currentColor) {
    score += getPlayableCards(hand, topCard, state.currentColor).length * 2;
  }
  score += hand.filter(c => isWildCard(c)).length * 2;
  return score;
}

/**
 * Elect the lead bot from a list of ally bots. Earlier-seated bots keep
 * leadership unless a later bot's proximity score beats theirs by more
 * than HYSTERESIS — a deterministic rule so every bot independently
 * elects the same lead without shared state.
 */
export function electLeadBot(allyBots: Player[], state: GameState): Player {
  const HYSTERESIS = 3;
  let bestScore = -Infinity;
  let bestBot = allyBots[0]!;
  for (const ab of allyBots) {
    const prox = evaluateWinProximity(ab.hand, state);
    if (prox > bestScore + HYSTERESIS) {
      bestScore = prox;
      bestBot = ab;
    }
  }
  return bestBot;
}

/**
 * Penalty for playing a WD4 that is challengeable (bot still holds the
 * current color). Uses only the bot's own hand — no cheating involved.
 * Applies only to normal plays: stacked WD4s never open a challenge window.
 */
function scoreWildFourRisk(card: Card, hand: Card[], state: GameState, params: DifficultyParams): number {
  if (!params.wildFourLegalityAwareness) return 0;
  if (card.type !== 'wild_draw_four') return 0;
  if (state.phase !== 'playing' || state.drawStack > 0) return 0;
  if (state.settings.houseRules.noChallengeWildFour) return 0;
  if (!state.currentColor) return 0;
  const handAfterPlay = hand.filter(c => c.id !== card.id);
  if (isValidWildDrawFour(handAfterPlay, state.currentColor)) return 0;
  // A successful challenge costs the bot 4 draws plus the wasted WD4
  return -20;
}

function scoreCardConservation(card: Card, hand: Card[], playable: Card[], params: DifficultyParams, state: GameState): number {
  if (!params.conserveSpecialCards) return 0;
  if (!isWildCard(card)) return 0;

  const nonWildPlayable = playable.filter(c => !isWildCard(c));
  if (nonWildPlayable.length === 0) return 3;

  let penalty = -Math.min(hand.length / 4, 2) * 2;
  if (card.type === 'wild_draw_four') {
    penalty *= state.settings.houseRules.noChallengeWildFour ? 0.8 : 1.5;
  }
  return penalty;
}

/**
 * Number of turns until `toIndex` gets to act, counting only alive seats
 * (eliminated seats are skipped by the engine and cost no turn).
 */
function turnsUntilPlayer(players: readonly Player[], fromIndex: number, toIndex: number, direction: GameState['direction']): number {
  if (fromIndex === toIndex) return 0;
  const count = players.length;
  const step = direction === 'clockwise' ? 1 : -1;
  let turns = 0;
  let idx = fromIndex;
  for (let s = 0; s < count; s++) {
    idx = ((idx + step) % count + count) % count;
    if (!players[idx]!.eliminated) turns++;
    if (idx === toIndex) return turns;
  }
  return count;
}

function scoreGlobalThreat(card: Card, state: GameState, botId: string, params: DifficultyParams, ctx: EvalContext): number {
  if (!params.globalThreatAwareness) return 0;

  const { botIndex, isAlly, leadBot } = ctx;
  let score = 0;

  const threats = state.players
    .map((p, i) => ({ player: p, index: i }))
    .filter(({ player }) => !player.eliminated && player.id !== botId && player.hand.length <= 3
      && !isAlly(player));

  if (threats.length === 0) return 0;

  // Coalition lead protection: identify threats that are positioned to attack the lead bot
  const leadIndex = leadBot ? state.players.findIndex(p => p.id === leadBot.id) : -1;
  const leadNearWin = leadBot && leadBot.id !== botId && leadBot.hand.length <= 2;

  for (const { player: threat, index: threatIndex } of threats) {
    const dist = turnsUntilPlayer(state.players, botIndex, threatIndex, state.direction);
    const urgency = (4 - threat.hand.length) * Math.max(1, 3 - dist);

    // Shield bonus: threat is right before the lead bot → extra urgency to neutralize
    let shieldMultiplier = 1.0;
    if (params.botCoalition && leadNearWin && leadIndex >= 0) {
      const threatToLead = turnsUntilPlayer(state.players, threatIndex, leadIndex, state.direction);
      if (threatToLead === 1) {
        shieldMultiplier = 2.0;
      } else if (threatToLead === 2) {
        shieldMultiplier = 1.5;
      }
    }

    if (card.type === 'skip' && dist === 1) {
      score += urgency * 2 * shieldMultiplier;
    }

    if (card.type === 'reverse') {
      const reversedDir = reverseDirection(state.direction);
      const newDist = turnsUntilPlayer(state.players, botIndex, threatIndex, reversedDir);
      let reverseDelta = (newDist - dist) * urgency * 0.6;
      // Reversing to push a threat away from the lead bot is extra valuable
      if (params.botCoalition && leadNearWin && leadIndex >= 0) {
        const threatToLeadBefore = turnsUntilPlayer(state.players, threatIndex, leadIndex, state.direction);
        const threatToLeadAfter = turnsUntilPlayer(state.players, threatIndex, leadIndex, reversedDir);
        if (threatToLeadAfter > threatToLeadBefore) reverseDelta += urgency * 0.8;
      }
      score += reverseDelta;
    }

    if ((card.type === 'draw_two' || card.type === 'wild_draw_four') && dist === 1) {
      score += urgency * 2.5 * shieldMultiplier;
      if (params.infoAccess.canSeeOpponentHands) {
        const canStack = threat.hand.some(c => c.type === 'draw_two' || c.type === 'wild_draw_four');
        if (canStack) score -= urgency * 0.5;
      }
    }
  }

  return score;
}

function scoreSpecialTiming(card: Card, hand: Card[], state: GameState, botId: string, params: DifficultyParams, ctx: EvalContext): number {
  if (params.specialCardAwareness === 0) return 0;
  const hr = state.settings.houseRules;
  let score = 0;

  if (card.type === 'flip') {
    score += scoreFlipDesirability(hand, state, params, ctx);
  }

  if (card.type === 'number' && (card as { value: number }).value === 0 && hr.zeroRotateHands) {
    if (params.infoAccess.canSeeOpponentHands) {
      const botIdx = state.players.findIndex(p => p.id === botId);
      const giverIndex = getNextAliveIndex(state.players, botIdx, reverseDirection(state.direction));
      const giver = state.players[giverIndex];
      if (giver && !giver.eliminated) {
        const delta = evaluateHandQuality(giver.hand, state) - evaluateHandQuality(hand, state);
        score += delta * 2;
      }

      // Coalition: evaluate the full rotation's net effect on bots vs humans
      if (params.botCoalition) {
        const dir = state.direction;
        let coalitionDelta = 0;
        for (let i = 0; i < state.players.length; i++) {
          const receiver = state.players[i]!;
          if (receiver.eliminated) continue;
          const gvrIdx = getNextAliveIndex(state.players, i, reverseDirection(dir));
          const gvr = state.players[gvrIdx];
          if (!gvr || gvr.eliminated) continue;
          const qBefore = evaluateHandQuality(receiver.hand, state);
          const qAfter = evaluateHandQuality(gvr.hand, state);
          const change = qAfter - qBefore;
          if (receiver.isBot) coalitionDelta += change;
          else coalitionDelta -= change;
        }
        score += coalitionDelta * 0.8;
      }
    } else {
      const myHandSize = hand.length;
      score += myHandSize > 5 ? 8 : myHandSize <= 3 ? -5 : 0;
    }
  }

  if (card.type === 'number' && (card as { value: number }).value === 7 && hr.sevenSwapHands) {
    if (params.infoAccess.canSeeOpponentHands) {
      const myQuality = evaluateHandQuality(hand, state);
      const opponents = state.players.filter(p => p.id !== botId && !p.eliminated);
      if (opponents.length > 0) {
        const bestSwapDelta = Math.max(...opponents.map(p => evaluateHandQuality(p.hand, state) - myQuality));
        score += bestSwapDelta > 0 ? bestSwapDelta * 1.5 : bestSwapDelta * 0.5;
      }
    } else {
      const myHandSize = hand.length;
      const minOpponent = Math.min(...state.players.filter(p => p.id !== botId && !p.eliminated).map(p => p.hand.length));
      score += myHandSize > minOpponent + 2 ? 8 : myHandSize <= 2 ? -5 : 3;
    }
  }

  if (card.type === 'number' && hr.multiplePlaySameNumber) {
    const sameValue = hand.filter(c => c.type === 'number' && c.id !== card.id && (c as { value: number }).value === (card as { value: number }).value);
    if (sameValue.length > 0) {
      score += sameValue.length * 3;
      if (hr.bombCard && sameValue.length >= 2) {
        score += 10;
      }
    }
  }

  if (hr.bombCard && card.type === 'number') {
    const topCards = state.discardPile.slice(-2);
    const consecutiveSame = topCards.filter(tc => tc.type === 'number' && (tc as { value: number }).value === (card as { value: number }).value).length;
    if (consecutiveSame >= 2) {
      score += 15;
    }
  }

  return score * params.specialCardAwareness;
}

function scoreCoalitionTactics(card: Card, _hand: Card[], state: GameState, botId: string, params: DifficultyParams, ctx: EvalContext): number {
  if (!params.botCoalition) return 0;
  const { botIndex, nextPlayer, isAlly, leadBot } = ctx;
  const hr = state.settings.houseRules;
  let score = 0;

  const humans = state.players.filter(p => !p.eliminated && !p.isBot && p.id !== botId);
  if (humans.length === 0) return 0;

  // --- 1. Color starvation: play cards that leave humans unable to respond ---
  // Weight by turn-order distance: blocking the next human matters more.
  if (params.infoAccess.canSeeOpponentHands && isColoredCard(card)) {
    let starvationScore = 0;
    let humansBlocked = 0;
    for (const h of humans) {
      if (getPlayableCards(h.hand, card, card.color).length === 0) {
        humansBlocked++;
        const hIdx = state.players.findIndex(p => p.id === h.id);
        const dist = turnsUntilPlayer(state.players, botIndex, hIdx, state.direction);
        starvationScore += Math.max(1, 4 - dist) * 2;
      }
    }
    if (humansBlocked === humans.length) starvationScore += 4;
    score += starvationScore;
  }

  // --- 2. Draw stack relay: stack through allies to hit humans (active stack only) ---
  const isDrawCard = card.type === 'draw_two' || card.type === 'wild_draw_four';
  const stackingEnabled = hr.stackDrawTwo || hr.stackDrawFour || hr.crossStack;

  if (isDrawCard && stackingEnabled && state.drawStack > 0 && nextPlayer && !nextPlayer.eliminated && isAlly(nextPlayer)) {
    let searchIdx = state.players.findIndex(p => p.id === nextPlayer.id);
    let chainLength = 0;
    for (let step = 0; step < state.players.length - 1; step++) {
      const p = state.players[searchIdx]!;
      if (p.eliminated) { searchIdx = getNextPlayerIndex(searchIdx, state.players.length, state.direction); continue; }
      if (!isAlly(p)) {
        const cardPenalty = card.type === 'wild_draw_four' ? 4 : 2;
        let relayScore = (state.drawStack + cardPenalty + chainLength * 2) * 1.5;
        // Hard bot: check if human can deflect the stack back to an ally
        if (params.infoAccess.canSeeOpponentHands) {
          const canDeflect = p.hand.some(c =>
            (c.type === 'reverse' && (hr.reverseDeflectDrawTwo || hr.reverseDeflectDrawFour)) ||
            (c.type === 'skip' && hr.skipDeflect) ||
            (c.type === 'draw_two' && (hr.stackDrawTwo || hr.crossStack)) ||
            (c.type === 'wild_draw_four' && (hr.stackDrawFour || hr.crossStack)));
          if (canDeflect) relayScore *= 0.4;
        }
        score += relayScore;
        break;
      }
      if (params.infoAccess.canSeeOpponentHands) {
        const canChain = p.hand.some(c =>
          (c.type === 'draw_two' && (hr.stackDrawTwo || hr.crossStack)) ||
          (c.type === 'wild_draw_four' && (hr.stackDrawFour || hr.crossStack)));
        if (canChain) chainLength++;
        else break;
      } else {
        // Can't verify — use decaying probability (each hop ~50% likely)
        chainLength += 0.5;
      }
      searchIdx = getNextPlayerIndex(searchIdx, state.players.length, state.direction);
    }
  }

  // --- 3. Start a draw chain through allies toward humans ---
  if (isDrawCard && stackingEnabled && state.drawStack === 0 && nextPlayer && !nextPlayer.eliminated && isAlly(nextPlayer)) {
    let idx = state.players.findIndex(p => p.id === nextPlayer.id);
    let chainHops = 0;
    for (let step = 0; step < state.players.length - 1; step++) {
      const p = state.players[idx]!;
      if (p.eliminated) { idx = getNextPlayerIndex(idx, state.players.length, state.direction); continue; }
      if (!isAlly(p)) {
        let startScore = 8;
        if (params.infoAccess.canSeeOpponentHands) {
          const canDeflect = p.hand.some(c =>
            (c.type === 'reverse' && (hr.reverseDeflectDrawTwo || hr.reverseDeflectDrawFour)) ||
            (c.type === 'skip' && hr.skipDeflect) ||
            (c.type === 'draw_two' && (hr.stackDrawTwo || hr.crossStack)) ||
            (c.type === 'wild_draw_four' && (hr.stackDrawFour || hr.crossStack)));
          if (canDeflect) startScore *= 0.4;
        }
        // Discount by unverified chain hops
        if (!params.infoAccess.canSeeOpponentHands && chainHops > 0) {
          startScore *= Math.pow(0.5, chainHops);
        }
        score += startScore;
        break;
      }
      if (params.infoAccess.canSeeOpponentHands) {
        const canChain = p.hand.some(c => c.type === 'draw_two' || c.type === 'wild_draw_four');
        if (!canChain) break;
      } else {
        chainHops++;
      }
      idx = getNextPlayerIndex(idx, state.players.length, state.direction);
    }
  }

  // --- 4. Reverse to redirect draw stack toward humans ---
  if (card.type === 'reverse' && state.drawStack > 0) {
    const reversedDir = reverseDirection(state.direction);
    const afterReverseIdx = getNextAliveIndex(state.players, botIndex, reversedDir);
    const afterReversePlayer = state.players[afterReverseIdx];
    if (afterReversePlayer && !afterReversePlayer.eliminated) {
      if (!isAlly(afterReversePlayer)) score += 10;
      else score -= 8;
    }
  }

  // --- 5. Skip human → give ally the next turn (extra if it's the lead bot) ---
  if (card.type === 'skip' && nextPlayer && !nextPlayer.eliminated && !isAlly(nextPlayer)) {
    const afterSkipIdx = getNextAliveIndex(
      state.players,
      state.players.findIndex(p => p.id === nextPlayer.id),
      state.direction);
    const afterSkipPlayer = state.players[afterSkipIdx];
    if (afterSkipPlayer && !afterSkipPlayer.eliminated && isAlly(afterSkipPlayer)) {
      score += (leadBot && afterSkipPlayer.id === leadBot.id) ? 10 : 5;
    }
  }

  // --- 6. Reverse to position human as next player (extra if lead bot follows) ---
  if (card.type === 'reverse' && state.drawStack === 0) {
    const reversedDir = reverseDirection(state.direction);
    const afterReverseIdx = getNextAliveIndex(state.players, botIndex, reversedDir);
    const afterReversePlayer = state.players[afterReverseIdx];
    if (afterReversePlayer && !afterReversePlayer.eliminated && !isAlly(afterReversePlayer)) {
      if (nextPlayer && isAlly(nextPlayer)) {
        score += (leadBot && nextPlayer.id === leadBot.id) ? 3 : 5;
      }
    }
    // Reverse puts lead bot as next player (even if current next is human)
    if (leadBot && afterReversePlayer && afterReversePlayer.id === leadBot.id) {
      score += 6;
    }
  }

  return score;
}

function scoreTeamAwareness(card: Card, state: GameState, params: DifficultyParams, ctx: EvalContext): number {
  const { nextPlayer, isAlly, leadBot, bot } = ctx;
  if (!nextPlayer) return 0;

  const hasTeamLogic = (params.considerTeamStrategy && state.settings.houseRules.teamMode) || params.botCoalition;
  if (!hasTeamLogic) return 0;

  const ally = isAlly(nextPlayer);

  if (card.type === 'draw_two' || card.type === 'wild_draw_four' || card.type === 'skip') {
    if (!ally) return 5;

    if (params.botCoalition) {
      // If THIS bot is the lead bot (closest to winning), skip penalty is minimal
      if (leadBot && bot && leadBot.id === bot.id && bot.hand.length <= 3) return -2;

      if (card.type === 'draw_two' || card.type === 'wild_draw_four') {
        const hr = state.settings.houseRules;
        if (hr.stackDrawTwo || hr.stackDrawFour || hr.crossStack) return -3;
      }
    }
    return -10;
  }

  return 0;
}

function scoreTargetPressure(card: Card, state: GameState, params: DifficultyParams, ctx: EvalContext): number {
  let score = 0;
  const { nextPlayer, isAlly } = ctx;
  const hr = state.settings.houseRules;

  if (params.considerOpponentHandSize) {
    if (nextPlayer && !nextPlayer.eliminated) {
      const ally = isAlly(nextPlayer);
      if (ally) {
        if (card.type === 'draw_two' || card.type === 'wild_draw_four' || card.type === 'skip') score -= 3;
      } else {
        if (card.type === 'draw_two' || card.type === 'wild_draw_four') {
          score += nextPlayer.hand.length <= 2 ? 10 : 3;
        }
        if (card.type === 'skip' && nextPlayer.hand.length <= 2) score += 6;
      }
    }
  }

  // noChallengeWildFour: WD4 is risk-free — boost its value against humans
  if (hr.noChallengeWildFour && card.type === 'wild_draw_four' && nextPlayer && !isAlly(nextPlayer)) {
    score += 6;
  }

  // Revenge mode: doubled penalties
  if (hr.revengeMode && params.specialCardAwareness > 0) {
    if (nextPlayer && !nextPlayer.eliminated && !isAlly(nextPlayer)) {
      if (state.drawStack > 0) {
        if (card.type === 'draw_two' || card.type === 'wild_draw_four') {
          score += 8 * params.specialCardAwareness;
          if (params.infoAccess.canSeeOpponentHands) {
            const canRetaliate = nextPlayer.hand.some(c => c.type === 'draw_two' || c.type === 'wild_draw_four');
            if (canRetaliate) score -= 5;
          }
        }
        if (card.type === 'reverse' || card.type === 'skip') {
          score += 4 * params.specialCardAwareness;
        }
      } else if (card.type === 'draw_two' || card.type === 'wild_draw_four') {
        score += 5 * params.specialCardAwareness;
      }
    }
  }

  return score;
}

export function evaluateCards(
  hand: Card[],
  playable: Card[],
  state: GameState,
  botId: string,
  params: DifficultyParams,
  weights: PersonalityWeights,
): CardScore[] {
  const botIndex = state.players.findIndex(p => p.id === botId);
  const nextIndex = getNextAliveIndex(state.players, botIndex, state.direction);
  const nextPlayer = state.players[nextIndex];
  const bot = state.players[botIndex];

  const alivePlayers = state.players.filter(p => !p.eliminated && p.id !== botId);
  const maxOpponentHand = alivePlayers.length > 0 ? Math.max(...alivePlayers.map(p => p.hand.length)) : 0;
  const avgHandSize = alivePlayers.length > 0 ? alivePlayers.reduce((sum, p) => sum + p.hand.length, 0) / alivePlayers.length : 0;

  const isAlly = (player: Player): boolean => {
    if (player.eliminated) return false;
    if (params.botCoalition && player.isBot) return true;
    if (params.considerTeamStrategy && state.settings.houseRules.teamMode
      && bot?.teamId !== undefined && player.teamId === bot.teamId) return true;
    return false;
  };

  const allyBots = params.botCoalition ? state.players.filter(p => p.isBot && !p.eliminated) : [];
  const leadBot = allyBots.length > 0 ? electLeadBot(allyBots, state) : null;

  const ctx: EvalContext = { botIndex, nextPlayer, bot, alivePlayers, maxOpponentHand, avgHandSize, isAlly, leadBot };

  return playable.map(card => {
    const factors: CardScoreFactors = {
      colorMatch: scoreColorMatch(card, hand, state.currentColor, params, ctx),
      actionValue: scoreActionValue(card),
      handReduction: scoreHandReduction(card, hand, state, params, ctx),
      finishSafety: scoreFinishSafety(card, hand, state, params),
      specialTiming: scoreSpecialTiming(card, hand, state, botId, params, ctx),
      teamAwareness: scoreTeamAwareness(card, state, params, ctx),
      targetPressure: scoreTargetPressure(card, state, params, ctx),
      cardConservation: scoreCardConservation(card, hand, playable, params, state),
      globalThreat: scoreGlobalThreat(card, state, botId, params, ctx),
      coalitionTactics: scoreCoalitionTactics(card, hand, state, botId, params, ctx),
      wildFourRisk: scoreWildFourRisk(card, hand, state, params),
    };

    let score =
      factors.colorMatch * weights.colorMatch +
      factors.actionValue * weights.actionValue +
      factors.handReduction * weights.handReduction +
      factors.finishSafety * weights.finishSafety +
      factors.specialTiming * weights.specialTiming +
      factors.teamAwareness * weights.teamAwareness +
      factors.targetPressure * weights.targetPressure +
      factors.cardConservation * weights.cardConservation +
      factors.globalThreat * weights.globalThreat +
      factors.coalitionTactics * weights.coalitionTactics +
      factors.wildFourRisk * weights.wildFourRisk;

    if (params.scoreNoise > 0) {
      score += (Math.random() * 2 - 1) * params.scoreNoise;
    }

    return { card, score, factors };
  });
}
