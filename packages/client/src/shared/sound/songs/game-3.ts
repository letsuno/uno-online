import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass,
  C2, C3, F2, F3, G2, G3, A2, A3, B2, E3,
  B3, C4, D4, E4, F4, G4,
  A4, B4, C5, D5, E5, F5, G5, A5, B5, D6,
} from './common';

const mA: N[] = [
  A4, _,C5, _,E5, _,A5, _,  G5, _,E5, _,C5, _,A4, _,
  F5, _,A5, _,F5, _,C5, _,  G5, _,D5, _,B4, _,G4, _,
];
const mB: N[] = [
  A4,C5,E5,A5,G5,E5,C5,A4,  A4,C5,F5,A5,G5,F5,C5,A4,
  G4,C5,E5,G5,E5,C5,G4,E4,  G4,B4,D5,G5,D5,B4,G4, _,
];
const mC: N[] = [
  E5, _,E5, _,A5,A5,G5, _,  D5, _,D5, _,G5,G5,B5, _,
  C5, _,C5, _,F5,F5,A5, _,  E5, _,E5, _,A5, _, _, _,
];
const mD: N[] = [
  A5, _,G5,E5, _,C5, _,A4,  A4, _,C5, _,F5, _,E5,D5,
  D5, _,G5, _,B5, _,D6, _,  A5, _, _, _, _, _, _, _,
];
const mE: N[] = [
  A4,A5,A4,A5, _,E5, _,C5,  F5, _,F4,F5, _,C5, _,A4,
  G5, _,G4,G5, _,D5, _,B4,  C5,E5,G5, _,C5, _, _, _,
];
const mF: N[] = [
  E5,A5,E5,C5,A4,C5,E5,A5,  D5,G5,D5,B4,G4,B4,D5,G5,
  C5,F5,C5,A4,F4,A4,C5,F5,  A5, _,E5, _,A4, _, _, _,
];

const hA = harm([C4,E4],[C4,E4],[A3,C4],[B3,D4]);
const hB: N[] = [
   _, _, _, _,C4, _, _, _,   _, _, _, _,A3, _, _, _,
   _, _, _, _,E4, _, _, _,   _, _, _, _,D4, _, _, _,
];
const hC = harm([C4,E4],[B3,G4],[A3,C4],[C4,E4]);
const hD = harm([A3,C4],[G3,B3],[C4,E4],[A3,E4]);
const hE = harm([C4,E4],[A3,C4],[B3,D4],[C4,E4]);
const hF: N[] = [
  C4, _,E4, _,C4, _,E4, _,  B3, _,D4, _,B3, _,D4, _,
  A3, _,C4, _,A3, _,C4, _,  A3, _, _, _, _, _, _, _,
];

const bA = bass([A2,A3],[A2,A3],[F2,F3],[G2,G3]);
const bB = bass([A2,A3],[F2,F3],[C2,C3],[G2,G3]);
const bC = bass([A2,A3],[G2,G3],[F2,F3],[A2,A3]);
const bD = bass([F2,F3],[G2,G3],[A2,A3],[A2,A3]);
const bE = bass([A2,A3],[F2,F3],[G2,G3],[C2,C3]);
const bF = bass([A2,A3],[G2,G3],[F2,F3],[A2,A3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Draw Four!', bpm: 144, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.15, dur: 0.1,
      notes: join(mA, mB, mA, mC, mD, mE, mB, mF) },
    { wave: 'square', gain: 0.07, dur: 0.12,
      notes: join(hA, hB, hA, hC, hD, hE, hB, hF) },
    { wave: 'triangle', gain: 0.18, dur: 0.15,
      notes: join(bA, bB, bA, bC, bD, bE, bB, bF) },
  ],
  kick:  { gain: 0.22, hits: [
    ...rep([T,F,F,F,T,F,F,F], 8), ...rep([T,F,T,F,T,F,T,F], 8),
    ...rep([T,F,F,F,T,F,F,F], 8), ...rep([T,F,T,F,T,F,T,F], 7), T,F,T,T,T,F,T,T,
  ]},
  snare: { gain: 0.10, hits: [...rep([F,F,T,F,F,F,T,F], 31), F,T,F,T,T,F,T,T] },
  hihat: { gain: 0.04, hits: [
    ...rep([T,F,T,F,T,F,T,F], 8), ...rep([T,T,T,T,T,T,T,T], 8),
    ...rep([T,F,T,F,T,F,T,F], 8), ...rep([T,T,T,T,T,T,T,T], 8),
  ]},
};
export default song;
