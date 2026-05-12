import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass,
  C2, C3, D3, F2, F3, G2, G3, A2, A3, Bb2, Bb3,
  Bb4, C4, D4, E4, F4, G4,
  A4, C5, D5, E5, F5, G5, A5, Bb5,
} from './common';

const mA: N[] = [
  F5, _,A5, _,C5, _,A5,F5,  E5, _,G5, _,C5, _,E5, _,
  D5, _,F5, _,A5, _,F5,D5,  Bb4, _,D5, _,F5, _, _, _,
];
const mB: N[] = [
  A5, _,F5, _,D5, _,F5,A5,  F5, _,D5, _,Bb4, _,D5, _,
  F5, _,A5, _,C5,A5, _,F5,  G5, _,E5, _,C5, _, _, _,
];
const mC: N[] = [
  F5,F5, _, _,A5, _, _, _,  G5,G5, _, _,Bb5, _, _, _,
  Bb4, _,D5, _,F5,Bb4, _, _,  C5, _,E5, _,G5, _, _, _,
];
const mD: N[] = [
  Bb4,D5,F5, _,D5,Bb4, _, _,  C5,E5,G5, _,E5,C5, _, _,
  D5,F5,A5, _,F5,D5, _, _,  F5, _,A5, _,C5, _, _, _,
];
const mE: N[] = [
  D5, _,A5, _,F5, _,D5, _,  C5, _,G5, _,E5, _,C5, _,
  Bb4, _,F5, _,D5, _,Bb4, _,  F5, _,A5, _,F5, _, _, _,
];

const hA = harm([A3,C4],[E4,G4],[F3,A3],[Bb3,D4]);
const hB = harmArp([F3,A3,D4],[Bb3,D4,F4],[A3,C4,F4],[E4,G4,C4]);
const hC = harm([A3,C4],[Bb3,D4],[Bb3,D4],[E4,G4]);
const hD = harmArp([Bb3,D4,F4],[E4,G4,C4],[F3,A3,D4],[A3,C4,F4]);
const hE = harm([F3,A3],[E4,G4],[Bb3,D4],[A3,C4]);

const bA = bass([F2,F3],[C2,C3],[D3,A3],[Bb2,Bb3]);
const bB = bass([D3,A3],[Bb2,Bb3],[F2,F3],[C2,C3]);
const bC = bass([F2,F3],[G2,G3],[Bb2,Bb3],[C2,C3]);
const bD = bass([Bb2,Bb3],[C2,C3],[D3,A3],[F2,F3]);
const bE = bass([D3,A3],[C2,C3],[Bb2,Bb3],[F2,F3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Carnival', meta: { 'author':'Claude', 'key':'F 大调', 'style':'拉丁嘉年华', 'wave':'正弦波' }, bpm: 132, stepsPerBeat: 2,
  tones: [
    { wave: 'sine', gain: 0.18, dur: 0.12,
      notes: join(mA, mB, mA, mC, mD, mA, mB, mE) },
    { wave: 'square', gain: 0.06, dur: 0.12,
      notes: join(hA, hB, hA, hC, hD, hA, hB, hE) },
    { wave: 'triangle', gain: 0.17, dur: 0.15,
      notes: join(bA, bB, bA, bC, bD, bA, bB, bE) },
  ],
  kick:  { gain: 0.20, hits: [
    ...rep([T,F,F,T,F,F,T,F], 16),
    ...rep([T,F,F,F,T,F,F,F], 16),
  ]},
  snare: { gain: 0.09, hits: [
    ...rep([F,F,F,T,F,F,T,F], 16),
    ...rep([F,F,T,F,F,F,T,F], 16),
  ]},
  hihat: { gain: 0.04, hits: rep([T,T,T,T,T,T,T,T], 32) },
};
export default song;
