import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bassHalf,
  C2, D2, E2, F2, G2, A2,
  C3, D3, E3, F3, G3, A3, B3,
  C4, D4, E4, F4, G4, A4, B4,
  C5, D5, E5, F5, G5, A5, B5, C6,
} from './common';

const mA: N[] = [
  A4, _,C5, _,E5, _, _,D5,  E5, _,B4, _, _,G4, _, _,
  A4, _,C5, _,F5, _, _,E5,  D5, _, _, _, _, _, _, _,
];
const mB: N[] = [
  E5, _,A5, _, _,G5, _,E5,  F5, _, _,C5, _, _,A4, _,
  G5, _, _,E5, _,C5, _, _,  D5, _, _, _, _, _, _, _,
];
const mC: N[] = [
  C5, _,E5, _,G5, _, _,A5,  B5, _,G5, _, _,D5, _, _,
  A5, _, _,E5, _,C5, _, _,  F5, _, _,E5, _,D5, _,C5,
];
const mD: N[] = [
  D5, _,F5, _,A5, _, _,G5,  G5, _,B5, _, _,A5, _,G5,
  C5, _,E5, _,G5, _, _,C6,  A5, _, _,E5, _, _, _, _,
];
const mE: N[] = [
  F5, _, _,A5, _, _,C6, _,  G5, _, _,B5, _, _,D5, _,
  A5, _, _,E5, _, _,C5, _,  A4, _, _, _, _, _, _, _,
];

const hA = harmArp([C4,E4,A4],[B3,E4,G4],[A3,C4,F4],[B3,D4,G4]);
const hB = harmArp([C4,E4,A4],[A3,C4,F4],[E4,G4,C5],[B3,D4,G4]);
const hC = harmArp([E4,G4,C5],[D4,G4,B4],[C4,E4,A4],[A3,C4,F4]);
const hD = harmArp([A3,D4,F4],[B3,D4,G4],[E4,G4,C5],[C4,E4,A4]);
const hE = harmArp([A3,C4,F4],[B3,D4,G4],[C4,E4,A4],[C4,E4,A4]);

const bA = bassHalf([A2,A3],[E2,E3],[F2,F3],[G2,G3]);
const bB = bassHalf([A2,A3],[F2,F3],[C2,C3],[G2,G3]);
const bC = bassHalf([C2,C3],[G2,G3],[A2,A3],[F2,F3]);
const bD = bassHalf([D2,D3],[G2,G3],[C2,C3],[A2,A3]);
const bE = bassHalf([F2,F3],[G2,G3],[A2,A3],[A2,A3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Nocturne', meta: { 'author':'Claude', 'key':'Am/C', 'style':'浪漫夜曲', 'wave':'正弦波' }, bpm: 72, stepsPerBeat: 2,
  tones: [
    { wave: 'sine', gain: 0.14, dur: 0.3,
      notes: join(mA, mB, mC, mA, mD, mB, mC, mE) },
    { wave: 'sine', gain: 0.05, dur: 0.35,
      notes: join(hA, hB, hC, hA, hD, hB, hC, hE) },
    { wave: 'triangle', gain: 0.10, dur: 0.4,
      notes: join(bA, bB, bC, bA, bD, bB, bC, bE) },
  ],
  kick:  { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
  snare: { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
  hihat: { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
};
export default song;
