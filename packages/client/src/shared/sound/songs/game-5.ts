import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass,
  C2, C3, F2, F3, G2, G3, A2, A3, B2, E3,
  B3, C4, D4, E4, F4, G4,
  A4, B4, C5, D5, E5, F5, G5, A5, B5, D6,
} from './common';

const mA: N[] = [
  E5, _,E5, _,A5, _, _, _,  D5, _,D5, _,G5, _, _, _,
  C5, _,C5, _,F5, _, _, _,  D5, _,D5, _,G5, _, _, _,
];
const mB: N[] = [
  A4,B4,C5,D5,E5, _,C5, _,  F5,E5,D5,C5,A4, _, _, _,
  C5,D5,E5,G5,E5, _,C5, _,  G5, _,D5, _,B4, _, _, _,
];
const mC: N[] = [
  F5, _,A5, _,F5,C5, _,A4,  A5, _,E5, _,A4,C5,E5, _,
  G5, _,B5, _,G5,D5, _,B4,  C5,E5,G5, _,C5, _, _, _,
];
const mD: N[] = [
  A5,G5,E5,C5,A4,C5,E5,G5,  F5,E5,C5,A4,F4,A4,C5,F5,
  G5, _,B5, _,D6, _,B5,G5,  A5, _, _, _, _, _, _, _,
];

const hA = harm([C4,E4],[B3,D4],[A3,C4],[B3,D4]);
const hB = harmArp([A3,C4,E4],[F3,A3,C4],[C4,E4,G4],[B3,D4,G4]);
const hC = harm([A3,F4],[C4,E4],[B3,G4],[C4,E4]);
const hD: N[] = [
  C4, _,E4, _,C4, _,E4, _,  A3, _,C4, _,A3, _,C4, _,
  B3, _,D4, _,B3, _,D4, _,  A3, _, _, _, _, _, _, _,
];

const bA = bass([A2,A3],[G2,G3],[F2,F3],[G2,G3]);
const bB = bass([A2,A3],[F2,F3],[C2,C3],[G2,G3]);
const bC = bass([F2,F3],[A2,A3],[G2,G3],[C2,C3]);
const bD = bass([A2,A3],[F2,F3],[G2,G3],[A2,A3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Wild Card', bpm: 148, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.15, dur: 0.09,
      notes: join(mA, mA, mB, mB, mC, mC, mD, mD) },
    { wave: 'square', gain: 0.07, dur: 0.11,
      notes: join(hA, hA, hB, hB, hC, hC, hD, hD) },
    { wave: 'triangle', gain: 0.18, dur: 0.13,
      notes: join(bA, bA, bB, bB, bC, bC, bD, bD) },
  ],
  kick:  { gain: 0.22, hits: [
    ...rep([T,F,F,F,T,F,F,F], 8),
    ...rep([T,F,T,F,T,F,F,F], 8),
    ...rep([T,F,F,F,T,F,T,F], 8),
    ...rep([T,F,T,F,T,F,T,F], 7), T,F,T,T,T,T,T,T,
  ]},
  snare: { gain: 0.10, hits: [...rep([F,F,T,F,F,F,T,F], 31), F,T,T,F,T,T,F,T] },
  hihat: { gain: 0.04, hits: rep([T,T,T,T,T,T,T,T], 32) },
};
export default song;
