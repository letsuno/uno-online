import type { GameState, GameAction, DrawSide } from '../../types/game.js';
import type { Color, Card } from '../../types/card.js';
import type { BotConfig } from '../../types/bot.js';
import { getPlayableCards, canPlayCard, isExactJumpInMatch, isValidWildDrawFour } from '../validation.js';
import { isWildCard, isColoredCard, getEffectiveColor } from '../../types/card.js';
import { getNextPlayerIndex, reverseDirection } from '../turn.js';
import { DIFFICULTY_PARAMS } from './difficulty-params.js';
import { PERSONALITY_WEIGHTS } from './personality-weights.js';
import { evaluateCards, bestColorForHand, evaluateHandQuality, electLeadBot } from './card-evaluator.js';

function isFinishBlocked(card: Card, hand: Card[], hr: { noWildFinish: boolean; noFunctionCardFinish: boolean }): boolean {
  if (hand.length !== 1) return false;
  if (hr.noWildFinish && isWildCard(card)) return true;
  if (hr.noFunctionCardFinish && (card.type === 'draw_two' || card.type === 'wild_draw_four')) return true;
  return false;
}

// Default config when a bot doesn't have one set
const DEFAULT_BOT_CONFIG: BotConfig = { difficulty: 'normal', personality: 'balanced' };

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Emit PLAY_CARD (and optionally CHOOSE_COLOR) for the given card.
 * `chooseColorOnPlay` is used when stacking a WD4 on an existing draw stack.
 */
function playCardActions(
  playerId: string,
  card: Card,
  color: Color,
  chooseColorOnPlay = false,
): GameAction[] {
  const actions: GameAction[] = [{
    type: 'PLAY_CARD',
    playerId,
    cardId: card.id,
    ...(chooseColorOnPlay ? { chosenColor: color } : {}),
  }];
  if ((card.type === 'wild' || card.type === 'wild_draw_four') && !chooseColorOnPlay) {
    actions.push({ type: 'CHOOSE_COLOR', playerId, color });
  }
  return actions;
}

/**
 * Pick which deck side to draw from based on difficulty.
 */
function chooseDrawSide(state: GameState, config: BotConfig): DrawSide {
  const params = DIFFICULTY_PARAMS[config.difficulty];

  if (params.infoAccess.canSeeDeckTopCards > 0) {
    // Hard bot: peek at tops of both decks and pick the side with more playable cards
    const topCard = state.discardPile[state.discardPile.length - 1];
    const currentColor = state.currentColor;
    if (topCard && currentColor) {
      const n = params.infoAccess.canSeeDeckTopCards;
      const leftTop = state.deckLeft.slice(0, n);
      const rightTop = state.deckRight.slice(0, n);
      const leftScore = leftTop.filter(c => canPlayCard(c, topCard, currentColor)).length;
      const rightScore = rightTop.filter(c => canPlayCard(c, topCard, currentColor)).length;
      if (leftScore !== rightScore) {
        return leftScore > rightScore ? 'left' : 'right';
      }
    }
  }

  if (config.difficulty === 'novice') {
    // Novice: random
    return Math.random() < 0.5 ? 'left' : 'right';
  }

  // Others: pick the bigger deck
  return state.deckLeft.length >= state.deckRight.length ? 'left' : 'right';
}

/**
 * Choose the best color to declare after playing a wild card.
 */
function chooseBestColor(state: GameState, botId: string, hand: Card[], playedCardId: string, config: BotConfig): Color {
  const params = DIFFICULTY_PARAMS[config.difficulty];

  if (config.difficulty === 'novice') {
    const colors: Color[] = ['red', 'blue', 'green', 'yellow'];
    return colors[Math.floor(Math.random() * colors.length)]!;
  }

  if (config.difficulty === 'hard') {
    const remaining = hand.filter(c => c.id !== playedCardId);
    const bot = state.players.find(p => p.id === botId);
    const botIndex = state.players.findIndex(p => p.id === botId);
    const colors: Color[] = ['red', 'blue', 'green', 'yellow'];

    const isAlly = (p: { id: string; isBot: boolean; eliminated?: boolean; teamId?: number }): boolean => {
      if (p.id === botId || p.eliminated) return false;
      if (params.botCoalition && p.isBot) return true;
      if (params.considerTeamStrategy && state.settings.houseRules.teamMode
        && bot?.teamId !== undefined && p.teamId === bot.teamId) return true;
      return false;
    };

    const scores = colors.map(color => {
      const ownMatch = remaining.filter(c => isColoredCard(c) && c.color === color).length;

      let allyBonus = 0;
      let oppPenalty = 0;
      let idx = getNextPlayerIndex(botIndex, state.players.length, state.direction);
      let weight = 1.0;
      for (let i = 0; i < state.players.length - 1; i++) {
        const p = state.players[idx]!;
        if (!p.eliminated && p.id !== botId) {
          const colorCount = p.hand.filter(c => isColoredCard(c) && c.color === color).length;
          if (isAlly(p)) {
            allyBonus += colorCount * weight;
          } else {
            oppPenalty += colorCount * weight;
          }
        }
        idx = getNextPlayerIndex(idx, state.players.length, state.direction);
        weight *= 0.5;
      }

      let leadBonus = 0;
      if (params.botCoalition) {
        const allyBots = state.players.filter(p => p.isBot && !p.eliminated);
        if (allyBots.length > 0) {
          const lead = electLeadBot(allyBots, state);
          if (lead.id !== botId) {
            leadBonus = lead.hand.filter(c => isColoredCard(c) && c.color === color).length * 2;
          }
        }
      }

      return { color, score: ownMatch * 3 + allyBonus * 1.5 + leadBonus - oppPenalty * 2 };
    });

    return scores.sort((a, b) => b.score - a.score)[0]!.color;
  }

  // Normal/easy: pick best color for own hand (excluding the played card)
  return bestColorForHand(hand, playedCardId);
}

/**
 * Optionally swap the best card for a random worse one, simulating mistakes.
 */
function applyMistake(scored: Array<{ card: Card; score: number }>, mistakeRate: number): Card {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  if (sorted.length === 0) throw new Error('applyMistake called with empty array');
  if (sorted.length === 1 || mistakeRate <= 0) return sorted[0]!.card;

  if (Math.random() < mistakeRate) {
    // Pick a random non-best card
    const nonBest = sorted.slice(1);
    return nonBest[Math.floor(Math.random() * nonBest.length)]!.card;
  }

  return sorted[0]!.card;
}

// ─── Phase handlers ───────────────────────────────────────────────────────────

function handleChallenging(state: GameState, playerId: string, config: BotConfig): GameAction[] {
  if (state.pendingDrawPlayerId !== playerId) return [];

  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard) return [{ type: 'ACCEPT', playerId }];

  const hr = state.settings.houseRules;
  const params = DIFFICULTY_PARAMS[config.difficulty];
  const weights = PERSONALITY_WEIGHTS[config.personality];

  // Collect all stackable and deflectable candidates, then let evaluator choose
  const candidates: Card[] = [];

  if (hr.stackDrawFour || hr.crossStack) {
    const stackable = player.hand.filter(c =>
      (hr.stackDrawFour && c.type === 'wild_draw_four' && topCard.type === 'wild_draw_four') ||
      (hr.crossStack && (
        (c.type === 'draw_two' && topCard.type === 'wild_draw_four') ||
        (c.type === 'wild_draw_four' && topCard.type === 'draw_two')
      )),
    );
    candidates.push(...stackable);
  }

  if (topCard.type === 'wild_draw_four') {
    if (hr.reverseDeflectDrawFour) {
      for (const c of player.hand) {
        if (c.type === 'reverse' && !candidates.some(e => e.id === c.id)) candidates.push(c);
      }
    }
    if (hr.skipDeflect) {
      for (const c of player.hand) {
        if (c.type === 'skip' && !candidates.some(e => e.id === c.id)) candidates.push(c);
      }
    }
  }

  if (candidates.length > 0) {
    const scored = evaluateCards(player.hand, candidates, state, playerId, params, weights);
    const pick = applyMistake(scored, params.mistakeRate);

    // Weigh accepting the draw vs. consuming a valuable card.
    // For bots with card conservation awareness, compare the best play score
    // against the cost of accepting a (small) draw stack.
    if (params.conserveSpecialCards && state.drawStack > 0) {
      const bestScore = Math.max(...scored.map(s => s.score));
      const drawCost = state.drawStack * 3;
      const onlyWilds = candidates.every(c => isWildCard(c));
      // Accept if the draw stack is cheap and we'd only burn wild cards
      if (onlyWilds && drawCost < bestScore * 0.4 && state.drawStack <= 4) {
        return [{ type: 'ACCEPT', playerId }];
      }
    }

    const chosenColor = pick.type === 'wild_draw_four'
      ? chooseBestColor(state, playerId, player.hand, pick.id, config)
      : undefined;
    return [{ type: 'PLAY_CARD', playerId, cardId: pick.id, ...(chosenColor ? { chosenColor } : {}) }];
  }

  // Challenge logic only applies to WD4
  if (topCard.type !== 'wild_draw_four') {
    return [{ type: 'ACCEPT', playerId }];
  }

  // noChallengeWildFour rule → always accept
  if (hr.noChallengeWildFour) {
    return [{ type: 'ACCEPT', playerId }];
  }

  // Hard bot: peek at previous player's hand to determine if WD4 was valid
  if (config.difficulty === 'hard' && params.infoAccess.canSeeOpponentHands) {
    // Find the player who played the WD4 (the one before the current player in turn order)
    const botIndex = state.players.findIndex(p => p.id === playerId);
    const prevIndex = getNextPlayerIndex(botIndex, state.players.length, reverseDirection(state.direction));
    const prevPlayer = state.players[prevIndex];

    // Determine what color was active before the WD4 was played.
    // The second-to-last card in the discard pile tells us the color.
    // If the previous card was also a wild, its effective color is unknown
    // from the card alone — accept conservatively rather than guess wrong.
    const prevDiscardCard = state.discardPile[state.discardPile.length - 2];
    const colorBeforeWD4: Color | null = prevDiscardCard
      ? (getEffectiveColor(prevDiscardCard) ?? null)
      : null;

    if (prevPlayer && colorBeforeWD4) {
      // Check if the previous player had a playable colored card matching colorBeforeWD4
      const hadMatchingColor = !isValidWildDrawFour(prevPlayer.hand, colorBeforeWD4);
      if (hadMatchingColor) {
        // WD4 was invalid → challenge!
        return [{ type: 'CHALLENGE', playerId }];
      }
    }
    // Hard bot determined WD4 was valid → accept
    return [{ type: 'ACCEPT', playerId }];
  }

  // Other difficulties: use challengeRate probability
  const challengeRate = params.challengeRate;
  if (challengeRate > 0 && Math.random() < challengeRate) {
    return [{ type: 'CHALLENGE', playerId }];
  }

  return [{ type: 'ACCEPT', playerId }];
}

function handleChoosingColor(state: GameState, playerId: string, config: BotConfig): GameAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const color = chooseBestColor(state, playerId, player.hand, '', config);
  return [{ type: 'CHOOSE_COLOR', playerId, color }];
}

function handleChoosingSwapTarget(state: GameState, playerId: string, config: BotConfig): GameAction[] {
  const params = DIFFICULTY_PARAMS[config.difficulty];
  const player = state.players.find(p => p.id === playerId)!;
  const targets = state.players.filter(p => p.id !== playerId && !p.eliminated);
  if (targets.length === 0) return [];

  // Novice/easy: random
  if (config.difficulty === 'novice' || config.difficulty === 'easy') {
    return [{ type: 'CHOOSE_SWAP_TARGET', playerId, targetId: targets[Math.floor(Math.random() * targets.length)]!.id }];
  }

  // Team mode: help struggling teammate
  if (params.considerTeamStrategy && state.settings.houseRules.teamMode && player.teamId !== undefined) {
    const teammates = targets.filter(t => t.teamId === player.teamId && t.hand.length > player.hand.length);
    if (teammates.length > 0) {
      const worst = teammates.reduce((a, b) => a.hand.length > b.hand.length ? a : b, teammates[0]!);
      return [{ type: 'CHOOSE_SWAP_TARGET', playerId, targetId: worst.id }];
    }
  }

  // Hard with transparency: pick target whose hand improves our position the most
  if (params.infoAccess.canSeeOpponentHands) {
    const isAlly = (t: typeof targets[number]): boolean => {
      if (params.botCoalition && t.isBot) return true;
      if (state.settings.houseRules.teamMode && player.teamId !== undefined && t.teamId === player.teamId) return true;
      return false;
    };

    const myQuality = evaluateHandQuality(player.hand, state);
    const allyBots = state.players.filter(p => p.isBot && !p.eliminated);
    const lead = allyBots.length > 0 ? electLeadBot(allyBots, state) : null;

    let bestTarget: typeof targets[number] | null = null;
    let bestDelta = -Infinity;
    for (const t of targets) {
      let delta = evaluateHandQuality(t.hand, state) - myQuality;
      if (isAlly(t) && t.hand.length > player.hand.length) {
        delta += (t.hand.length - player.hand.length) * 1.5;
      }
      if (!isAlly(t)) {
        // Bonus for swapping with humans — they get our (possibly bad) hand
        delta += 3;
        // Extra bonus if our hand is large (dumping junk on human)
        if (player.hand.length > t.hand.length + 2) delta += 4;
      }
      // Bonus if this bot is the lead — swap to get even closer to winning
      if (lead && lead.id === player.id) delta += 5;
      if (delta > bestDelta) { bestDelta = delta; bestTarget = t; }
    }
    if (bestTarget) {
      return [{ type: 'CHOOSE_SWAP_TARGET', playerId, targetId: bestTarget.id }];
    }
  }

  // Normal: pick fewest cards (exclude teammates in team mode)
  const candidates = (state.settings.houseRules.teamMode && player.teamId !== undefined)
    ? targets.filter(t => t.teamId !== player.teamId)
    : targets;
  const fallback = candidates.length > 0 ? candidates : targets;
  const target = fallback.reduce((a, b) => a.hand.length < b.hand.length ? a : b, fallback[0]!);
  return [{ type: 'CHOOSE_SWAP_TARGET', playerId, targetId: target.id }];
}

const ALL_COLORS: Color[] = ['red', 'blue', 'green', 'yellow'];

function solveEndgame(hand: Card[], topCard: Card, currentColor: Color, hr: { noWildFinish: boolean; noFunctionCardFinish: boolean }): Card | null {
  if (hand.length > 3 || hand.length === 0) return null;

  function canWin(remaining: Card[], top: Card, color: Color): boolean {
    if (remaining.length === 0) return true;
    for (let i = 0; i < remaining.length; i++) {
      const card = remaining[i]!;
      if (!canPlayCard(card, top, color)) continue;
      if (remaining.length === 1 && isFinishBlocked(card, remaining, hr)) continue;
      const rest = remaining.filter((_, j) => j !== i);
      if (isWildCard(card)) {
        for (const c of ALL_COLORS) {
          if (canWin(rest, card, c)) return true;
        }
      } else {
        const nextColor = isColoredCard(card) ? card.color : color;
        if (canWin(rest, card, nextColor)) return true;
      }
    }
    return false;
  }

  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]!;
    if (!canPlayCard(card, topCard, currentColor)) continue;
    const rest = hand.filter((_, j) => j !== i);
    if (rest.length === 0) {
      if (isFinishBlocked(card, hand, hr)) continue;
      return card;
    }
    if (isWildCard(card)) {
      for (const c of ALL_COLORS) {
        if (canWin(rest, card, c)) return card;
      }
    } else {
      const nextColor = isColoredCard(card) ? card.color : currentColor;
      if (canWin(rest, card, nextColor)) return card;
    }
  }
  return null;
}

function handlePlaying(state: GameState, playerId: string, config: BotConfig): GameAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return [];

  const params = DIFFICULTY_PARAMS[config.difficulty];
  const weights = PERSONALITY_WEIGHTS[config.personality];
  const hr = state.settings.houseRules;
  const drawSide = chooseDrawSide(state, config);

  const noCards =
    state.deckLeft.length === 0 &&
    state.deckRight.length === 0 &&
    state.discardPile.length <= 1;

  // Pending penalty draws (from misplay or uno catch)
  if ((state.pendingPenaltyDraws ?? 0) > 0) {
    if (noCards) return [{ type: 'PASS', playerId }];
    return [{ type: 'DRAW_CARD', playerId, side: drawSide }];
  }

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard || !state.currentColor) {
    if (noCards) return [{ type: 'PASS', playerId }];
    return [{ type: 'DRAW_CARD', playerId, side: drawSide }];
  }

  // After drawing this turn (not a draw stack response)
  const hasDrawnThisTurn =
    state.lastAction?.type === 'DRAW_CARD' &&
    state.lastAction.playerId === playerId;

  if (hasDrawnThisTurn && state.drawStack === 0) {
    let playableAfterDraw = getPlayableCards(player.hand, topCard, state.currentColor);
    if (hr.noWildFinish || hr.noFunctionCardFinish) {
      playableAfterDraw = playableAfterDraw.filter(c => !isFinishBlocked(c, player.hand, hr));
    }
    if (playableAfterDraw.length === 0) {
      // drawUntilPlayable / deathDraw: keep drawing if deck has cards
      if (!noCards && (hr.drawUntilPlayable || hr.deathDraw)) {
        return [{ type: 'DRAW_CARD', playerId, side: drawSide }];
      }
      return [{ type: 'PASS', playerId }];
    }
    // Novice: purely random card selection after drawing
    if (config.difficulty === 'novice') {
      const pick = playableAfterDraw[Math.floor(Math.random() * playableAfterDraw.length)]!;
      const color = chooseBestColor(state, playerId, player.hand, pick.id, config);
      return playCardActions(playerId, pick, color, false);
    }
    // Play the best drawn card
    const scored = evaluateCards(player.hand, playableAfterDraw, state, playerId, params, weights);
    const pick = applyMistake(scored, params.mistakeRate);
    const color = chooseBestColor(state, playerId, player.hand, pick.id, config);
    return playCardActions(playerId, pick, color, false);
  }

  // Draw stack active: collect ALL possible responses (stacking AND deflection) and let evaluator choose
  if (state.drawStack > 0) {
    const candidates: Card[] = [];

    const stackingEnabled = hr.stackDrawTwo || hr.stackDrawFour || hr.crossStack;
    if (stackingEnabled) {
      const stackable = player.hand.filter(c => {
        if (hr.stackDrawTwo && c.type === 'draw_two' && topCard.type === 'draw_two') return true;
        if (hr.stackDrawFour && c.type === 'wild_draw_four' && topCard.type === 'wild_draw_four') return true;
        if (hr.crossStack && (
          (c.type === 'draw_two' && topCard.type === 'wild_draw_four') ||
          (c.type === 'wild_draw_four' && topCard.type === 'draw_two')
        )) return true;
        return false;
      });
      candidates.push(...stackable);
    }

    const deflectionEnabled = hr.reverseDeflectDrawTwo || hr.reverseDeflectDrawFour || hr.skipDeflect;
    if (deflectionEnabled) {
      const deflectable = player.hand.filter(c => {
        if (c.type === 'reverse' && hr.reverseDeflectDrawTwo && topCard.type === 'draw_two') return true;
        if (c.type === 'reverse' && hr.reverseDeflectDrawFour && topCard.type === 'wild_draw_four') return true;
        if (c.type === 'skip' && hr.skipDeflect) return true;
        return false;
      });
      // Avoid duplicates (a card could theoretically be in both sets)
      for (const c of deflectable) {
        if (!candidates.some(existing => existing.id === c.id)) {
          candidates.push(c);
        }
      }
    }

    if (candidates.length > 0) {
      const scored = evaluateCards(player.hand, candidates, state, playerId, params, weights);
      const pick = applyMistake(scored, params.mistakeRate);
      const color = chooseBestColor(state, playerId, player.hand, pick.id, config);
      const needsColorOnPlay = pick.type === 'wild_draw_four';
      return playCardActions(playerId, pick, color, needsColorOnPlay);
    }

    if (noCards) return [{ type: 'PASS', playerId }];
    return [{ type: 'DRAW_CARD', playerId, side: drawSide }];
  }

  // Normal play: evaluate all playable cards
  let playable = getPlayableCards(player.hand, topCard, state.currentColor);
  // Filter out cards blocked by finish restrictions (prevents livelock)
  if (player.hand.length <= playable.length && (hr.noWildFinish || hr.noFunctionCardFinish)) {
    playable = playable.filter(c => !isFinishBlocked(c, player.hand, hr));
  }
  if (playable.length === 0) {
    if (noCards) return [{ type: 'PASS', playerId }];
    return [{ type: 'DRAW_CARD', playerId, side: drawSide }];
  }

  // Novice: purely random card selection
  if (config.difficulty === 'novice') {
    const pick = playable[Math.floor(Math.random() * playable.length)]!;
    const color = chooseBestColor(state, playerId, player.hand, pick.id, config);
    return playCardActions(playerId, pick, color, false);
  }

  // Hard bot endgame solver: enumerate winning sequences when hand is small
  if (config.difficulty === 'hard' && player.hand.length <= 3 && topCard && state.currentColor) {
    const winCard = solveEndgame(player.hand, topCard, state.currentColor, hr);
    if (winCard) {
      const color = chooseBestColor(state, playerId, player.hand, winCard.id, config);
      return playCardActions(playerId, winCard, color, false);
    }
  }

  const scored = evaluateCards(player.hand, playable, state, playerId, params, weights);
  const pick = applyMistake(scored, params.mistakeRate);
  const color = chooseBestColor(state, playerId, player.hand, pick.id, config);
  const actions = playCardActions(playerId, pick, color);

  // Multi-card play: chain same-number cards if rule enabled
  if (hr.multiplePlaySameNumber && pick.type === 'number') {
    const pickValue = (pick as { value: number }).value;
    const sameValue = player.hand.filter(c =>
      c.id !== pick.id && c.type === 'number' && (c as { value: number }).value === pickValue,
    );
    if (sameValue.length > 0 && params.specialCardAwareness > 0) {
      let chainCount: number;
      if (hr.bombCard) {
        // Coalition: only bomb if net damage to humans > allies
        if (params.botCoalition && sameValue.length >= 2) {
          const humanCount = state.players.filter(p => !p.eliminated && !p.isBot && p.id !== playerId).length;
          const allyCount = state.players.filter(p => !p.eliminated && p.isBot && p.id !== playerId).length;
          chainCount = humanCount > allyCount ? sameValue.length : Math.min(1, sameValue.length);
        } else {
          chainCount = sameValue.length;
        }
      } else {
        chainCount = Math.ceil(sameValue.length * params.specialCardAwareness);
      }
      // Cap chain to avoid leaving a single finish-blocked card
      if (params.finishRestrictionAwareness && (hr.noWildFinish || hr.noFunctionCardFinish)) {
        const playedIds = new Set([pick.id, ...sameValue.slice(0, chainCount).map(c => c.id)]);
        const afterChain = player.hand.filter(c => !playedIds.has(c.id));
        if (afterChain.length === 1 && isFinishBlocked(afterChain[0]!, afterChain, hr)) {
          chainCount = Math.max(0, chainCount - 1);
        }
      }
      if (chainCount > 0) {
        for (let i = 0; i < chainCount; i++) {
          actions.push({ type: 'PLAY_CARD', playerId, cardId: sameValue[i]!.id });
        }
        actions.push({ type: 'PASS', playerId });
      }
    }
  }

  return actions;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main bot action chooser. Dispatches to the appropriate phase handler.
 * Returns an array of actions to be applied sequentially.
 */
export function chooseBotAction(state: GameState, playerId: string): GameAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const config: BotConfig = player.botConfig ?? DEFAULT_BOT_CONFIG;

  switch (state.phase) {
    case 'challenging':
      return handleChallenging(state, playerId, config);
    case 'choosing_color':
      return handleChoosingColor(state, playerId, config);
    case 'choosing_swap_target':
      return handleChoosingSwapTarget(state, playerId, config);
    case 'playing':
      return handlePlaying(state, playerId, config);
    default:
      return [];
  }
}

/**
 * Bot jump-in check. Called asynchronously while it's another player's turn.
 * Uses `specialCardAwareness` as the probability to attempt a jump-in.
 */
export function chooseBotJumpInAction(state: GameState, playerId: string): GameAction[] {
  if (!state.settings.houseRules.jumpIn) return [];
  if (state.phase !== 'playing') return [];

  // Don't jump in during a draw stack
  if ((state.pendingPenaltyDraws ?? 0) > 0 || state.drawStack > 0) return [];

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id === playerId) return [];

  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard) return [];

  const config: BotConfig = player.botConfig ?? DEFAULT_BOT_CONFIG;
  const params = DIFFICULTY_PARAMS[config.difficulty];

  // specialCardAwareness controls jump-in probability
  if (Math.random() >= params.specialCardAwareness) return [];

  const card = player.hand.find(c => isExactJumpInMatch(c, topCard));
  if (!card) return [];

  // Coalition: evaluate whether jumping in is worth it on ally's turn
  if (params.botCoalition && currentPlayer.isBot) {
    const afterCount = player.hand.length - 1;
    // Close to winning — always worth it
    if (afterCount > 1) {
      const botIndex = state.players.findIndex(p => p.id === playerId);
      const nextIdx = getNextPlayerIndex(botIndex, state.players.length, state.direction);
      const nextAfterJump = state.players[nextIdx];
      const hitsHuman = nextAfterJump && !nextAfterJump.isBot && !nextAfterJump.eliminated;
      const isOffensive = (card.type === 'draw_two' || card.type === 'skip') && hitsHuman;
      // Hard bot: check if ally was going to draw anyway (can't play)
      let allyWouldDraw = false;
      if (params.infoAccess.canSeeOpponentHands && topCard && state.currentColor) {
        allyWouldDraw = getPlayableCards(currentPlayer.hand, topCard, state.currentColor).length === 0;
      }
      if (!isOffensive && !allyWouldDraw) return [];
    }
  }

  // When jumping in against a human: prefer it — but also check it doesn't give a
  // worse position (for hard bot, avoid if next player after jump is a close-to-win human
  // and the card is just a number)
  if (params.botCoalition && !currentPlayer.isBot && card.type === 'number') {
    const botIndex = state.players.findIndex(p => p.id === playerId);
    const nextIdx = getNextPlayerIndex(botIndex, state.players.length, state.direction);
    const nextAfterJump = state.players[nextIdx];
    if (nextAfterJump && !nextAfterJump.isBot && !nextAfterJump.eliminated && nextAfterJump.hand.length <= 2) {
      if (player.hand.length > 3) return [];
    }
  }

  const color = chooseBestColor(state, playerId, player.hand, card.id, config);
  return playCardActions(playerId, card, color);
}
