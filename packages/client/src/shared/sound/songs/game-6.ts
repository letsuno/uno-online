import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass,
  B2, D2, E2, G2, C3, D3, E3, G3,
  A3, B3, C4, D4, E4, Fs4, G4, A4,
  B4, C5, D5, E5, Fs5, G5, A5, B5, D6,
} from './common';

const mA: N[] = [
  G5,G5,B5,B5,D6,D6,B5, _,  Fs5, _,A5, _,D5, _,A5, _,
  E5,E5,G5,G5,B5,B5,G5, _,  C5, _,E5, _,G5, _, _, _,
];
const mB: N[] = [
  B5, _,G5, _,E5, _,G5,B5,  G5, _,E5, _,C5, _,E5, _,
  D5, _,G5, _,B5, _,G5,D5,  A5, _,Fs5, _,D5, _, _, _,
];
const mC: N[] = [
  G5, _,B5, _,D6, _, _, _,  Fs5, _,B5, _,D5, _,Fs5, _,
  E5, _,G5, _,C5,E5,G5, _,  D5, _,Fs5, _,A5, _, _, _,
];
const mD: N[] = [
  C5,E5,G5, _,E5,C5, _, _,  D5,Fs5,A5, _,Fs5,D5, _, _,
  E5,G5,B5, _,G5,E5, _, _,  G5, _,B5, _,D6, _, _, _,
];
const mE: N[] = [
  E5, _,G5, _,B5,G5,E5, _,  D5, _,Fs5, _,A5, _,D5, _,
  C5, _,E5, _,G5, _,E5,C5,  G5, _,B5, _,G5, _, _, _,
];

const hA = harm([B3,D4],[Fs4,A4],[G3,B3],[E4,G4]);
const hB = harmArp([G3,B3,E4],[E4,G4,C5],[B3,D4,G4],[Fs4,A4,D4]);
const hC = harm([B3,D4],[B3,Fs4],[E4,G4],[D4,Fs4]);
const hD = harmArp([E4,G4,C5],[Fs4,A4,D4],[G3,B3,E4],[B3,D4,G4]);
const hE = harm([G3,B3],[Fs4,A4],[E4,G4],[B3,D4]);

const bA = bass([G2,G3],[D2,D3],[E2,E3],[C3,C4]);
const bB = bass([E2,E3],[C3,C4],[G2,G3],[D2,D3]);
const bC = bass([G2,G3],[B2,B3],[C3,C4],[D2,D3]);
const bD = bass([C3,C4],[D2,D3],[E2,E3],[G2,G3]);
const bE = bass([E2,E3],[D2,D3],[C3,C4],[G2,G3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Blitz', bpm: 135, stepsPerBeat: 2,
  tones: [
    { wave: 'sawtooth', gain: 0.10, dur: 0.1,
      notes: join(mA, mB, mC, mA, mD, mA, mB, mE) },
    { wave: 'square', gain: 0.06, dur: 0.12,
      notes: join(hA, hB, hC, hA, hD, hA, hB, hE) },
    { wave: 'triangle', gain: 0.18, dur: 0.15,
      notes: join(bA, bB, bC, bA, bD, bA, bB, bE) },
  ],
  kick:  { gain: 0.20, hits: [
    ...rep([T,F,T,F,T,F,F,F], 8),
    ...rep([T,F,F,F,T,F,F,F], 16),
    ...rep([T,F,T,F,T,F,T,F], 7), T,F,T,T,T,F,T,T,
  ]},
  snare: { gain: 0.10, hits: [...rep([F,F,T,F,F,F,T,F], 31), F,F,T,T,F,T,T,T] },
  hihat: { gain: 0.04, hits: rep([T,T,T,T,T,T,T,T], 32) },
};
export default song;
