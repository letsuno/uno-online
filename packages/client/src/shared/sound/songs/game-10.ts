import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass, bassHalf,
  C2, C3, D2, D3, E2, E3, F2, F3, G2, G3, A2, A3, B2, B3,
  C4, D4, E4, F4, G4, A4, B4,
  C5, D5, E5, F5, G5, A5, B5, C6,
} from './common';


const mA: N[] = [ // C – G – Am – Em  (古典乐句：上行-下行弧线)
  C5, _,D5, _,E5, _,G5, _,  G5, _,A5, _,B5, _,C6, _,
  B5, _,A5, _,G5, _,E5, _,  D5, _,C5, _, _, _, _, _,
];
const mB: N[] = [ // Am – Em – F – C  (对位应答)
  A5, _,G5, _,E5, _,C5, _,  E5, _,G5, _,B5, _,G5, _,
  F5, _,A5, _,C5, _,A5, _,  G5, _,E5, _,C5, _, _, _,
];
const mC: N[] = [ // G – D – Em – C  (属调离调)
  B5, _,A5, _,G5, _,D5, _,  A5, _,G5, _,F5, _,D5, _,
  E5, _,G5, _,B5, _,G5,E5,  C5, _,E5, _,G5, _, _, _,
];
const mD: N[] = [ // F – G – Am – G  (三度音程双声部)
  F5,A5, _,E5,G5, _,D5,F5,  G5,B5, _,F5,A5, _,E5,G5,
  A5,C6, _,G5,B5, _,A5,C6,  B5, _,G5, _,D5, _, _, _,
];
const mE: N[] = [ // F – G – C – C  (古典终止式)
  F5, _,A5, _,C6,A5,F5, _,  G5, _,B5, _,D5,B5,G5, _,
  E5, _,G5, _,C6, _,E5, _,  C5, _, _, _, _, _, _, _,
];

const hA = harmArp([E4,G4,C5],[D4,G4,B4],[C4,E4,A4],[B3,E4,G4]);
const hB = harmArp([C4,E4,A4],[B3,E4,G4],[A3,C4,F4],[E4,G4,C5]);
const hC = harmArp([D4,G4,B4],[A3,D4,F4],[B3,E4,G4],[E4,G4,C5]);
const hD = harm([A3,C4],[B3,D4],[C4,E4],[B3,D4]);
const hE = harmArp([A3,C4,F4],[B3,D4,G4],[E4,G4,C5],[E4,G4,C5]);

const bA = bassHalf([C2,C3],[G2,G3],[A2,A3],[E2,E3]);
const bB = bassHalf([A2,A3],[E2,E3],[F2,F3],[C2,C3]);
const bC = bassHalf([G2,G3],[D2,D3],[E2,E3],[C2,C3]);
const bD = bassHalf([F2,F3],[G2,G3],[A2,A3],[G2,G3]);
const bE = bassHalf([F2,F3],[G2,G3],[C2,C3],[C2,C3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Minuet', bpm: 108, stepsPerBeat: 2,
  tones: [
    { wave: 'triangle', gain: 0.14, dur: 0.16,
      notes: join(mA, mB, mA, mC, mD, mA, mB, mE) },
    { wave: 'sine', gain: 0.06, dur: 0.2,
      notes: join(hA, hB, hA, hC, hD, hA, hB, hE) },
    { wave: 'triangle', gain: 0.14, dur: 0.2,
      notes: join(bA, bB, bA, bC, bD, bA, bB, bE) },
  ],
  kick:  { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
  snare: { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
  hihat: { gain: 0.03, hits: rep([T,F,T,F,T,F,T,F], 32) },
};
export default song;
