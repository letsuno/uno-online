import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass, bassHalf,
  C2, C3, F2, F3, G2, G3, A2, A3, D3,
  B3, C4, D4, E4, F4, G4,
  A4, B4, C5, D5, E5, F5, G5, A5,
} from './common';

const mA: N[] = [
  C5, _,E5, _,G5, _,E5, _,  A4, _,C5, _,E5, _, _, _,
  F5, _,E5, _,D5, _,C5, _,  D5, _, _, _,B4, _, _, _,
];
const mB: N[] = [
  E5, _,C5, _,A4, _, _,C5,  F5, _,E5, _,C5, _, _, _,
  G5, _,E5, _,C5, _,E5, _,  D5, _, _, _, _, _, _, _,
];
const mC: N[] = [
  A4, _,C5, _,F5, _,E5,D5,  B4, _,D5, _,G5, _,F5,E5,
  E5, _,G5, _,C5, _, _, _,  A4, _,C5, _, _, _, _, _,
];
const mD: N[] = [
  D5, _,F5, _,A5, _,F5,D5,  G5, _,D5, _,B4, _, _, _,
  C5, _,E5, _,G5, _, _, _,  C5, _, _, _, _, _, _, _,
];

const hA = harm([E4,G4],[C4,E4],[A3,C4],[B3,D4]);
const hB = harmArp([A3,C4,E4],[F3,A3,C4],[C4,E4,G4],[B3,D4,G4]);
const hC = harm([A3,F4],[B3,G4],[C4,E4],[C4,E4]);
const hD = harm([D4,F4],[B3,D4],[C4,E4],[C4,G4]);

const bA = bassHalf([C2,C3],[A2,A3],[F2,F3],[G2,G3]);
const bB = bass([A2,A3],[F2,F3],[C2,C3],[G2,G3]);
const bC = bassHalf([F2,F3],[G2,G3],[C2,C3],[A2,A3]);
const bD = bassHalf([D3,F3],[G2,G3],[C2,C3],[C2,C3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Waiting Room', bpm: 92, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.10, dur: 0.18,
      notes: join(mA, mB, mC, mB, mA, mB, mC, mD) },
    { wave: 'square', gain: 0.04, dur: 0.15,
      notes: join(hA, hB, hC, hB, hA, hB, hC, hD) },
    { wave: 'triangle', gain: 0.15, dur: 0.2,
      notes: join(bA, bB, bC, bB, bA, bB, bC, bD) },
  ],
  kick:  { gain: 0.14, hits: rep([T,F,F,F,T,F,F,F], 32) },
  snare: { gain: 0.04, hits: rep([F,F,T,F,F,F,T,F], 32) },
  hihat: { gain: 0.03, hits: [
    ...rep([T,F,T,F,T,F,T,F], 16),
    ...rep([T,F,T,F,T,T,T,F], 16),
  ]},
};
export default song;
