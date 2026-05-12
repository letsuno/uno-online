import type { N, Song } from './common';
import { _, T, F, rep, harm, bassHalf,
  C2, F2, G2, A2, Bb2, D3,
  A3, Bb3, C4, D4, E4, F4,
  A4, Bb4, C5, D5, E5, F5, G5, A5,
} from './common';


const mA: N[] = [ // F – Dm – Bb – C
  A5, _, _,F5, _, _,C5, _,  D5, _, _,F5, _, _,A4, _,
  Bb4, _, _,D5, _, _,F5, _,  _, _, _, _, _, _, _, _,
];
const mB: N[] = [ // Dm – Bb – F – C
  F5, _, _,D5, _, _,A4, _,  Bb4, _, _, _,D5, _, _, _,
  A4, _, _,C5, _, _,F5, _,  E5, _, _, _, _, _, _, _,
];
const mC: N[] = [ // F – Gm – Bb – F
  F5, _, _,A5, _, _,C5, _,  _, _,Bb4, _, _,D5, _, _,
  Bb4, _, _,D5, _, _,F5, _,  _, _, _, _, _, _, _, _,
];
const mD: N[] = [ // Bb – C – Dm – F
  Bb4, _, _,D5, _, _,F5, _,  C5, _, _,E5, _, _,G5, _,
  D5, _, _,F5, _, _,A5, _,  _, _, _, _, _, _, _, _,
];
const mE: N[] = [ // Bb – C – F – F
  Bb4, _, _,D5, _, _,F5, _,  E5, _, _,C5, _, _,G5, _,
  F5, _, _,A5, _, _,C5, _,  F5, _, _, _, _, _, _, _,
];

const hA = harm([F4,null],[A3,null],[Bb3,null],[E4,null]);
const hB = harm([A3,null],[Bb3,null],[C4,null],[E4,null]);
const hC = harm([C4,null],[Bb3,null],[Bb3,null],[C4,null]);
const hD = harm([Bb3,null],[E4,null],[A3,null],[C4,null]);
const hE = harm([Bb3,null],[E4,null],[C4,null],[C4,null]);

const bA = bassHalf([F2,null],[D3,null],[Bb2,null],[C2,null]);
const bB = bassHalf([D3,null],[Bb2,null],[F2,null],[C2,null]);
const bC = bassHalf([F2,null],[G2,null],[Bb2,null],[F2,null]);
const bD = bassHalf([Bb2,null],[C2,null],[D3,null],[F2,null]);
const bE = bassHalf([Bb2,null],[C2,null],[F2,null],[F2,null]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Sunset', bpm: 78, stepsPerBeat: 2,
  tones: [
    { wave: 'triangle', gain: 0.12, dur: 0.3,
      notes: join(mA, mB, mC, mA, mD, mB, mC, mE) },
    { wave: 'sine', gain: 0.03, dur: 0.22,
      notes: join(hA, hB, hC, hA, hD, hB, hC, hE) },
    { wave: 'triangle', gain: 0.08, dur: 0.35,
      notes: join(bA, bB, bC, bA, bD, bB, bC, bE) },
  ],
  kick:  { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
  snare: { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
  hihat: { gain: 0.02, hits: rep([T,F,F,F,F,F,F,F], 32) },
};
export default song;
