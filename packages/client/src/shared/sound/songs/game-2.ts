import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass,
  C2, C3, F2, F3, G2, G3, A2, A3, B2, D3, E3,
  B3, C4, D4, E4, F4, G4,
  A4, B4, C5, D5, E5, F5, G5, A5, B5, D6,
} from './common';

const mA: N[] = [
   _,E5, _,E5,A5, _,E5, _,   _,C5, _,C5,F5, _,C5, _,
   _,G5, _,G5,C5, _,G5, _,   _,D5, _,D5,G5, _, _, _,
];
const mB: N[] = [
  A5,G5,E5, _,C5, _, _, _,  F5,E5,C5, _,A4, _, _, _,
  G5,E5,C5, _,E5, _, _, _,  G5, _, _, _,D5, _, _, _,
];
const mC: N[] = [
  F5,F5, _, _,A5, _, _, _,  G5,G5, _, _,B5, _, _, _,
  A5,A5, _, _,E5, _, _, _,  E5,E5, _, _,G5, _, _, _,
];
const mD: N[] = [
  A5, _,G5, _,E5, _,C5, _,  A4,C5,E5, _,F5, _,E5,C5,
  D5, _,G5, _,B5, _,A5,G5,  C5, _,E5, _,G5, _, _, _,
];
const mE: N[] = [
  D5, _,E5,F5, _,A5, _,F5,  A4, _,C5, _,E5, _,C5,A4,
  F5, _,E5, _,D5, _,C5,A4,  B4, _,D5, _,G5, _, _, _,
];
const mF: N[] = [
  C5, _,E5, _,G5, _,C5,E5,  A5, _,E5, _,C5, _,A4, _,
  F5, _,A5, _,C5,A5, _,F5,  G5, _,B5, _,D6, _, _, _,
];

const hA = harm([A3,E4],[F3,C4],[E4,G4],[B3,D4]);
const hB = harmArp([A3,C4,E4],[F3,A3,C4],[C4,E4,G4],[B3,D4,G4]);
const hC = harm([A3,F4],[B3,G4],[C4,E4],[C4,G4]);
const hD = harmArp([A3,C4,E4],[F3,A3,C4],[G3,B3,D4],[C4,E4,G4]);
const hE = harm([D4,F4],[C4,E4],[A3,C4],[B3,D4]);
const hF = harmArp([C4,E4,G4],[A3,C4,E4],[F3,A3,C4],[B3,D4,G4]);

const bA = bass([A2,A3],[F2,F3],[C2,C3],[G2,G3]);
const bB = bA;
const bC = bass([F2,F3],[G2,G3],[A2,A3],[C2,C3]);
const bD = bass([A2,A3],[F2,F3],[G2,G3],[C2,C3]);
const bE = bass([D3,F3],[A2,A3],[F2,F3],[G2,G3]);
const bF = bass([C2,C3],[A2,A3],[F2,F3],[G2,G3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Reverse!', meta: { 'author':'Claude', 'key':'A 小调', 'style':'切分律动', 'wave':'方波' }, bpm: 128, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.15, dur: 0.1,
      notes: join(mA, mB, mC, mD, mE, mA, mF, mD) },
    { wave: 'square', gain: 0.07, dur: 0.12,
      notes: join(hA, hB, hC, hD, hE, hA, hF, hD) },
    { wave: 'triangle', gain: 0.18, dur: 0.15,
      notes: join(bA, bB, bC, bD, bE, bA, bF, bD) },
  ],
  kick:  { gain: 0.20, hits: [
    ...rep([T,T,F,F,T,F,F,T], 8), ...rep([T,F,F,F,T,F,F,F], 8),
    ...rep([T,F,F,F,F,F,F,F], 8), ...rep([T,F,F,F,T,F,F,F], 7), T,F,T,F,T,F,T,F,
  ]},
  snare: { gain: 0.10, hits: [
    ...rep([F,F,T,F,F,T,F,F], 8), ...rep([F,F,T,F,F,F,T,F], 8),
    ...rep([F,F,F,F,T,F,F,F], 8), ...rep([F,F,T,F,F,F,T,F], 7), F,F,T,T,F,T,T,T,
  ]},
  hihat: { gain: 0.04, hits: [
    ...rep([T,T,T,T,T,T,T,T], 8), ...rep([T,F,T,F,T,F,T,F], 8),
    ...rep([T,F,T,F,T,F,T,F], 8), ...rep([T,T,T,T,T,T,T,T], 8),
  ]},
};
export default song;
