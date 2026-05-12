import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass, bassHalf,
  C2, C3, F2, F3, G2, G3, A2, A3, D3,
  B3, C4, D4, E4, F4, G4,
  A4, B4, C5, D5, E5, F5, G5, A5, B5,
} from './common';

const mA: N[] = [
  C5, _,D5, _,E5, _,G5, _,  A4, _,C5, _,E5, _, _, _,
  F5, _,E5, _,D5, _,C5, _,  B4, _,D5, _, _, _, _, _,
];
const mB: N[] = [
  A5, _,G5, _,E5, _,D5,C5,  F5, _,E5, _,C5, _,A4, _,
  G5, _,E5, _,C5, _,E5, _,  D5, _, _, _, _, _, _, _,
];
const mC: N[] = [
  F5, _,A5, _, _, _,G5, _,  G5, _,B5, _, _, _,A5, _,
  A5, _,E5, _,C5, _,A4, _,  A4, _,C5, _,F5, _, _, _,
];
const mD: N[] = [
  D5, _,F5, _,A5, _,G5,F5,  G5, _,B5, _,D5, _,B4, _,
  C5, _,E5, _,G5,E5,C5, _,  C5, _, _, _, _, _, _, _,
];

const hA = harm([E4,G4],[C4,E4],[A3,C4],[B3,D4]);
const hB = harmArp([A3,C4,E4],[F3,A3,C4],[C4,E4,G4],[B3,D4,G4]);
const hC = harm([A3,F4],[B3,G4],[C4,E4],[A3,C4]);
const hD = harmArp([D4,F4,A3],[B3,D4,G4],[C4,E4,G4],[C4,E4,G4]);

const bA = bass([C2,C3],[A2,A3],[F2,F3],[G2,G3]);
const bB = bass([A2,A3],[F2,F3],[C2,C3],[G2,G3]);
const bC = bassHalf([F2,F3],[G2,G3],[A2,A3],[F2,F3]);
const bD = bass([D3,F3],[G2,G3],[C2,C3],[C2,C3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Color Wheel', bpm: 120, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.14, dur: 0.12,
      notes: join(mA, mB, mA, mC, mA, mB, mA, mD) },
    { wave: 'square', gain: 0.06, dur: 0.14,
      notes: join(hA, hB, hA, hC, hA, hB, hA, hD) },
    { wave: 'triangle', gain: 0.17, dur: 0.16,
      notes: join(bA, bB, bA, bC, bA, bB, bA, bD) },
  ],
  kick:  { gain: 0.18, hits: rep([T,F,F,F,T,F,F,F], 32) },
  snare: { gain: 0.09, hits: rep([F,F,T,F,F,F,T,F], 32) },
  hihat: { gain: 0.04, hits: [
    ...rep([T,F,T,F,T,F,T,F], 16),
    ...rep([T,T,T,T,T,T,T,T], 16),
  ]},
};
export default song;
