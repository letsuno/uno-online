export interface HouseRules {
  stackDrawTwo: boolean;
  stackDrawFour: boolean;
  crossStack: boolean;
  reverseDeflectDrawTwo: boolean;
  reverseDeflectDrawFour: boolean;
  skipDeflect: boolean;
  zeroRotateHands: boolean;
  sevenSwapHands: boolean;
  jumpIn: boolean;
  multiplePlaySameNumber: boolean;
  wildFirstTurn: boolean;
  drawUntilPlayable: boolean;
  forcedPlayAfterDraw: boolean;
  handLimit: number | null;
  forcedPlay: boolean;
  handRevealThreshold: number | null;
  unoPenaltyCount: 2 | 4 | 6;
  strictUnoCall: boolean;
  misplayPenalty: boolean;
  deathDraw: boolean;
  fastMode: boolean;
  noHints: boolean;
  elimination: boolean;
  blitzTimeLimit: number | null;
  revengeMode: boolean;
  silentUno: boolean;
  teamMode: boolean;
  noFunctionCardFinish: boolean;
  noWildFinish: boolean;
  doubleScore: boolean;
  noChallengeWildFour: boolean;
  blindDraw: boolean;
  bombCard: boolean;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  stackDrawTwo: false,
  stackDrawFour: false,
  crossStack: false,
  reverseDeflectDrawTwo: false,
  reverseDeflectDrawFour: false,
  skipDeflect: false,
  zeroRotateHands: false,
  sevenSwapHands: false,
  jumpIn: false,
  multiplePlaySameNumber: false,
  wildFirstTurn: false,
  drawUntilPlayable: false,
  forcedPlayAfterDraw: false,
  handLimit: null,
  forcedPlay: false,
  handRevealThreshold: null,
  unoPenaltyCount: 2,
  strictUnoCall: false,
  misplayPenalty: false,
  deathDraw: false,
  fastMode: false,
  noHints: false,
  elimination: false,
  blitzTimeLimit: null,
  revengeMode: false,
  silentUno: false,
  teamMode: false,
  noFunctionCardFinish: false,
  noWildFinish: false,
  doubleScore: false,
  noChallengeWildFour: false,
  blindDraw: false,
  bombCard: false,
};

export const HOUSE_RULES_PRESETS: Record<string, Partial<HouseRules>> = {
  classic: {},
  party: {
    stackDrawTwo: true,
    stackDrawFour: true,
    zeroRotateHands: true,
    sevenSwapHands: true,
    jumpIn: true,
    drawUntilPlayable: true,
  },
  crazy: {
    stackDrawTwo: true,
    stackDrawFour: true,
    crossStack: true,
    reverseDeflectDrawTwo: true,
    reverseDeflectDrawFour: true,
    skipDeflect: true,
    zeroRotateHands: true,
    sevenSwapHands: true,
    jumpIn: true,
    multiplePlaySameNumber: true,
    drawUntilPlayable: true,
    forcedPlayAfterDraw: true,
    doubleScore: true,
    noChallengeWildFour: true,
  },
};
