import type { Card, Color } from '../../types/card.js';
import type { GameAction, GameState } from '../../types/game.js';
import { applyActionWithHouseRules } from '../house-rules-engine.js';

const COLORS: readonly Color[] = ['red', 'blue', 'green', 'yellow'];

export type AutomatedDecisionContext = { kind: 'turn' } | { kind: 'jumpin'; card: Card };

export interface LegalActionPlans {
  plans: GameAction[][];
}

function isLegalPlan(state: GameState, plan: readonly GameAction[]): boolean {
  let current = state;
  for (const action of plan) {
    const next = applyActionWithHouseRules(current, action);
    if (next === current) return false;
    current = next;
  }
  return plan.length > 0;
}

function validationStateForPlay(state: GameState): GameState {
  const houseRules = state.settings.houseRules;
  if (!houseRules.misplayPenalty) return state;
  return {
    ...state,
    settings: {
      ...state.settings,
      houseRules: { ...houseRules, misplayPenalty: false },
    },
  };
}

function cardPlans(state: GameState, playerId: string, card: Card, options: { jumpIn: boolean }): GameAction[][] {
  const { jumpIn } = options;
  if (card.type !== 'wild' && card.type !== 'wild_draw_four') {
    return [
      [
        {
          type: 'PLAY_CARD',
          playerId,
          cardId: card.id,
          ...(jumpIn ? { isJumpIn: true } : {}),
        },
      ],
    ];
  }

  const inlineOnly =
    jumpIn || (card.type === 'wild_draw_four' && (state.phase === 'challenging' || state.drawStack > 0));
  return COLORS.flatMap(color => {
    const inline: GameAction[] = [
      {
        type: 'PLAY_CARD',
        playerId,
        cardId: card.id,
        chosenColor: color,
        ...(jumpIn ? { isJumpIn: true } : {}),
      },
    ];
    if (inlineOnly) return [inline];
    return [
      [
        { type: 'PLAY_CARD', playerId, cardId: card.id },
        { type: 'CHOOSE_COLOR', playerId, color },
      ],
      inline,
    ];
  });
}

function addLegal(output: GameAction[][], state: GameState, candidates: readonly GameAction[][]): void {
  for (const candidate of candidates) {
    if (isLegalPlan(state, candidate)) output.push(candidate);
  }
}

/**
 * Enumerate concrete engine-legal plans for automated cycle recovery.
 *
 * This deliberately has no model action indices, masks, observations, or
 * training metadata. Product automation only needs alternative rule-engine
 * transitions when its preferred deterministic plan is known to repeat.
 */
export function enumerateLegalActionPlans(
  state: GameState,
  playerId: string,
  context: AutomatedDecisionContext = { kind: 'turn' },
): LegalActionPlans {
  const output: GameAction[][] = [];
  const player = state.players.find(candidate => candidate.id === playerId);
  if (!player) return { plans: output };

  if (context.kind === 'jumpin') {
    addLegal(output, validationStateForPlay(state), cardPlans(state, playerId, context.card, { jumpIn: true }));
    return { plans: output };
  }

  const actorId =
    state.phase === 'challenging' ? state.pendingDrawPlayerId : state.players[state.currentPlayerIndex]?.id;
  if (actorId !== playerId) return { plans: output };

  if (state.phase === 'choosing_color') {
    addLegal(
      output,
      state,
      COLORS.map(color => [{ type: 'CHOOSE_COLOR', playerId, color }]),
    );
    return { plans: output };
  }

  if (state.phase === 'choosing_swap_target') {
    addLegal(
      output,
      state,
      state.players
        .filter(target => target.id !== playerId && !target.eliminated)
        .map(target => [
          {
            type: 'CHOOSE_SWAP_TARGET' as const,
            playerId,
            targetId: target.id,
          },
        ]),
    );
    return { plans: output };
  }

  if (state.phase === 'challenging') {
    addLegal(output, state, [[{ type: 'CHALLENGE', playerId }], [{ type: 'ACCEPT', playerId }]]);
  } else if (state.phase !== 'playing') {
    return { plans: output };
  }

  const playState = validationStateForPlay(state);
  for (const card of player.hand) {
    addLegal(output, playState, cardPlans(state, playerId, card, { jumpIn: false }));
  }

  if (state.phase === 'playing') {
    addLegal(output, state, [
      [{ type: 'DRAW_CARD', playerId, side: 'left' }],
      [{ type: 'DRAW_CARD', playerId, side: 'right' }],
      [{ type: 'PASS', playerId }],
    ]);
  }
  return { plans: output };
}
