import type { N, Song } from './common';
import { _, T, F, rep, harm, bassHalf,
  C2, F2, G2, A2, D3,
  A3, B3, C4, D4, E4,
  A4, C5, D5, E5, F5, G5, A5,
} from './common';

const mA: N[] = [
  G5, _, _,E5, _, _,C5, _,   _, _,A4, _, _,C5, _, _,
  F5, _, _,E5, _, _,D5, _,   _, _, _, _, _, _, _, _,
];
const mB: N[] = [
  A4, _, _,C5, _, _,E5, _,  F5, _, _, _,C5, _, _, _,
  E5, _, _,G5, _, _,C5, _,  D5, _, _, _, _, _, _, _,
];
const mAp: N[] = [
  G5, _, _,E5, _, _,D5,E5,   _, _,C5, _, _,A4, _, _,
  F5, _, _,A5, _, _,G5, _,   _, _, _, _, _, _, _, _,
];
const mC: N[] = [
  D5, _, _,F5, _, _,A5, _,  E5, _, _, _,C5, _, _, _,
  A4, _, _,C5, _, _,F5, _,  E5, _, _, _, _, _, _, _,
];
const mD: N[] = [
  F5, _, _,E5, _, _,D5, _,  D5, _, _,G5, _, _, _, _,
  E5, _, _,G5, _, _,C5, _,  C5, _, _, _, _, _, _, _,
];

const hA = harm([E4,null],[C4,null],[A3,null],[B3,null]);
const hB = harm([C4,null],[A3,null],[E4,null],[B3,null]);
const hC = harm([D4,null],[C4,null],[A3,null],[C4,null]);
const hD = harm([A3,null],[B3,null],[E4,null],[C4,null]);

const bA = bassHalf([C2,null],[A2,null],[F2,null],[G2,null]);
const bB = bassHalf([A2,null],[F2,null],[C2,null],[G2,null]);
const bC = bassHalf([D3,null],[A2,null],[F2,null],[C2,null]);
const bD = bassHalf([F2,null],[G2,null],[C2,null],[C2,null]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Daydream', bpm: 88, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.10, dur: 0.22,
      notes: join(mA, mB, mAp, mC, mA, mB, mAp, mD) },
    { wave: 'square', gain: 0.03, dur: 0.18,
      notes: join(hA, hB, hA, hC, hA, hB, hA, hD) },
    { wave: 'triangle', gain: 0.12, dur: 0.25,
      notes: join(bA, bB, bA, bC, bA, bB, bA, bD) },
  ],
  kick:  { gain: 0.12, hits: rep([T,F,F,F,F,F,F,F], 32) },
  snare: { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
  hihat: { gain: 0.02, hits: rep([T,F,F,F,T,F,F,F], 32) },
};
export default song;
