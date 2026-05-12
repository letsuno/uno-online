import type { N, Song } from './common';
import { _, T, F, rep, harm, bassHalf,
  D2, E2, G2, C3, D3, G3,
  A3, B3, C4, D4, E4, Fs4, G4,
  B4, C5, D5, E5, Fs5, G5, A5, B5,
} from './common';

const mA: N[] = [
  B5, _, _,G5, _, _,D5, _,  E5, _, _,G5, _, _,B4, _,
  C5, _, _,E5, _, _,G5, _,  Fs5, _, _, _, _, _, _, _,
];
const mB: N[] = [
  G5, _, _,E5, _, _,B4, _,  C5, _, _,E5, _, _,G5, _,
  D5, _, _,G5, _, _,B5, _,  A5, _, _, _, _, _, _, _,
];
const mC: N[] = [
  G5, _,B5, _,G5, _,D5, _,  Fs5, _,B5, _,Fs5, _,D5, _,
  E5, _,G5, _,C5, _,E5, _,  D5, _,Fs5, _, _, _, _, _,
];
const mD: N[] = [
  C5, _, _,E5, _, _,G5, _,  D5, _, _,Fs5, _, _,A5, _,
  G5, _, _,B5, _, _,D5, _,  G5, _, _, _, _, _, _, _,
];

const hA = harm([D4,null],[B3,null],[E4,null],[A3,null]);
const hB = harm([B3,null],[E4,null],[D4,null],[Fs4,null]);
const hC = harm([D4,null],[Fs4,null],[E4,null],[Fs4,null]);
const hD = harm([E4,null],[Fs4,null],[D4,null],[D4,null]);

const bA = bassHalf([G2,null],[E2,null],[C3,null],[D2,null]);
const bB = bassHalf([E2,null],[C3,null],[G2,null],[D2,null]);
const bC = bassHalf([G2,null],[B3,null],[C3,null],[D2,null]);
const bD = bassHalf([C3,null],[D2,null],[G2,null],[G2,null]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Breeze', meta: { 'author':'Claude', 'key':'G 大调', 'style':'田园清风', 'wave':'正弦波' }, bpm: 84, stepsPerBeat: 2,
  tones: [
    { wave: 'sine', gain: 0.12, dur: 0.25,
      notes: join(mA, mB, mA, mC, mA, mB, mA, mD) },
    { wave: 'sine', gain: 0.04, dur: 0.2,
      notes: join(hA, hB, hA, hC, hA, hB, hA, hD) },
    { wave: 'triangle', gain: 0.10, dur: 0.3,
      notes: join(bA, bB, bA, bC, bA, bB, bA, bD) },
  ],
  kick:  { gain: 0.10, hits: rep([T,F,F,F,F,F,F,F], 32) },
  snare: { gain: 0.00, hits: rep([F,F,F,F,F,F,F,F], 32) },
  hihat: { gain: 0.02, hits: rep([T,F,F,F,T,F,F,F], 32) },
};
export default song;
