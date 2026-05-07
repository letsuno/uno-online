import type { HouseRulePlugin } from '../house-rule-types';
import { finishRestrictions } from './finish-restrictions';
import { silentUno } from './silent-uno';
import { noChallengeWildFour } from './no-challenge-wild-four';
import { unoPenalty } from './uno-penalty';
import { handLimit } from './hand-limit';
import { forcedPlay } from './forced-play';
import { deathDrawPass, deathDrawDraw } from './death-draw';
import { multiPlayPass, multiPlayPost } from './multi-play';
import { misplayPenalty } from './misplay-penalty';
import { deflection } from './deflection';
import { stacking } from './stacking';
import { drawUntilPlayable } from './draw-until-playable';
import { jumpIn } from './jump-in';
import { sevenSwapPost, sevenSwapTarget } from './seven-swap';
import { zeroRotate } from './zero-rotate';
import { revengeMode } from './revenge-mode';
import { forcedPlayAfterDraw } from './forced-play-after-draw';
import { doubleScore } from './double-score';
import { teamMode } from './team-mode';
import { elimination } from './elimination';

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
