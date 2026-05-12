import type { HouseRulePlugin } from '../house-rule-types.js';
import { finishRestrictions } from './finish-restrictions.js';
import { silentUno } from './silent-uno.js';
import { noChallengeWildFour } from './no-challenge-wild-four.js';
import { unoPenalty } from './uno-penalty.js';
import { handLimit } from './hand-limit.js';
import { forcedPlay } from './forced-play.js';
import { deathDrawPass, deathDrawDraw } from './death-draw.js';
import { multiPlayPass, multiPlayPost } from './multi-play.js';
import { misplayPenalty } from './misplay-penalty.js';
import { deflection } from './deflection.js';
import { stacking } from './stacking.js';
import { drawUntilPlayable } from './draw-until-playable.js';
import { jumpIn } from './jump-in.js';
import { sevenSwapPost, sevenSwapTarget } from './seven-swap.js';
import { zeroRotate } from './zero-rotate.js';
import { revengeMode } from './revenge-mode.js';
import { forcedPlayAfterDraw } from './forced-play-after-draw.js';
import { doubleScore } from './double-score.js';
import { teamMode } from './team-mode.js';
import { elimination } from './elimination.js';

export const PRE_CHECK_PLUGINS: HouseRulePlugin[] = [
  finishRestrictions,
  silentUno,
  noChallengeWildFour,
  unoPenalty,
  handLimit,
  forcedPlay,
  deathDrawPass,
  multiPlayPass,
  misplayPenalty,
  deflection,
  stacking,
  drawUntilPlayable,
  deathDrawDraw,
  jumpIn,
  sevenSwapTarget,
];

export const POST_PROCESS_PLUGINS: HouseRulePlugin[] = [
  zeroRotate,
  sevenSwapPost,
  revengeMode,
  multiPlayPost,
  forcedPlayAfterDraw,
  doubleScore,
  teamMode,
  elimination,
];

export {
  finishRestrictions,
  silentUno,
  noChallengeWildFour,
  unoPenalty,
  handLimit,
  forcedPlay,
  deathDrawPass,
  deathDrawDraw,
  multiPlayPass,
  multiPlayPost,
  misplayPenalty,
  deflection,
  stacking,
  drawUntilPlayable,
  jumpIn,
  sevenSwapPost,
  sevenSwapTarget,
  zeroRotate,
  revengeMode,
  forcedPlayAfterDraw,
  doubleScore,
  teamMode,
  elimination,
};
