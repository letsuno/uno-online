import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass, bassHalf,
  C2, C3, D2, D3, F2, F3, G2, G3, A2, A3, Bb2, Bb3,
  Bb4, C4, D4, E4, F4, G4,
  A4, C5, D5, E5, F5, G5, A5, Bb5,
} from './common';


const mA: N[] = [ // Dm – Am – Bb – C
  D5, _,F5, _,A5, _,F5,D5,  E5, _,A5, _,C5, _,E5, _,
  Bb4, _,D5, _,F5, _,Bb4, _,  C5, _,E5, _,G5, _, _, _,
];
const mB: N[] = [ // Dm – Gm – Am – Dm
  A5, _,G5, _,F5, _,D5, _,  G5, _,Bb4, _,D5, _,G5, _,
  A5, _,E5, _,C5, _,A4, _,  D5, _,F5, _,A5, _, _, _,
];
const mC: N[] = [ // Bb – C – Dm – Am
  Bb4,Bb4,D5,D5,F5, _, _, _,  C5,C5,E5,E5,G5, _, _, _,
  D5, _,F5, _,A5,F5,D5, _,  E5, _,C5, _,A4, _, _, _,
];
const mD: N[] = [ // Dm – Bb – C – Dm
  D5,F5,A5,D5,F5,A5, _, _,  Bb4, _,D5, _,F5, _,D5,Bb4,
  C5, _,E5, _,G5, _,E5,C5,  D5, _,F5, _,D5, _, _, _,
];
const mE: N[] = [ // Gm – Am – Bb – C
  G5, _,Bb4, _,D5, _,G5, _,  A5, _,C5, _,E5, _,A5, _,
  Bb4, _,D5, _,F5,D5, _,Bb4,  C5, _,G5, _,E5, _, _, _,
];

const hA = harm([F3,A3],[C4,E4],[Bb3,D4],[E4,G4]);
const hB = harmArp([F3,A3,D4],[Bb3,D4,G4],[C4,E4,A3],[F3,A3,D4]);
const hC = harm([Bb3,D4],[E4,G4],[F3,A3],[C4,E4]);
const hD = harmArp([F3,A3,D4],[Bb3,D4,F4],[E4,G4,C4],[F3,A3,D4]);
const hE = harm([Bb3,D4],[C4,E4],[Bb3,D4],[E4,G4]);

const bA = bassHalf([D2,D3],[A2,A3],[Bb2,Bb3],[C2,C3]);
const bB = bass([D2,D3],[G2,G3],[A2,A3],[D2,D3]);
const bC = bassHalf([Bb2,Bb3],[C2,C3],[D2,D3],[A2,A3]);
const bD = bass([D2,D3],[Bb2,Bb3],[C2,C3],[D2,D3]);
const bE = bassHalf([G2,G3],[A2,A3],[Bb2,Bb3],[C2,C3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Midnight', bpm: 116, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.13, dur: 0.14,
      notes: join(mA, mB, mC, mA, mD, mE, mB, mD) },
    { wave: 'square', gain: 0.05, dur: 0.14,
      notes: join(hA, hB, hC, hA, hD, hE, hB, hD) },
    { wave: 'triangle', gain: 0.16, dur: 0.18,
      notes: join(bA, bB, bC, bA, bD, bE, bB, bD) },
  ],
  kick:  { gain: 0.16, hits: rep([T,F,F,F,F,F,F,F], 32) },
  snare: { gain: 0.06, hits: rep([F,F,F,F,T,F,F,F], 32) },
  hihat: { gain: 0.03, hits: rep([T,F,T,F,T,F,T,F], 32) },
};
export default song;
