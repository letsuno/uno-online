import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass, bassHalf,
  C2, C3, F2, F3, G2, G3, A2, A3, D3,
  B3, C4, D4, E4, F4, G4,
  A4, B4, C5, D5, E5, F5, G5, A5, B5,
} from './common';

const mA: N[] = [
  E5, _,G5, _,E5, _,C5,D5,  E5, _,C5, _,A4, _, _, _,
  A4, _,C5, _,F5, _,E5,D5,  D5, _, _, _,B4, _, _, _,
];
const mB: N[] = [
  G5, _,E5, _,C5, _,D5,E5,  A4, _,C5, _,E5, _, _, _,
  F5, _,E5, _,D5, _,C5, _,  B4, _, _, _, _, _, _, _,
];
const mC: N[] = [
  E5, _,G5, _,E5, _,C5,D5,  C5, _,A4, _,E4, _, _, _,
  A4, _,C5, _,F5, _,E5,D5,  G4, _, _, _, _, _, _, _,
];
const mD: N[] = [
  D5, _,F5, _,A5, _,F5, _,  G5, _,D5, _,B4, _, _, _,
  C5, _,E5, _,G5, _,E5, _,  C5, _, _, _, _, _, _, _,
];
const mE: N[] = [
  A4, _,C5, _,E5, _,A5, _,  F5, _,A5, _,C5, _, _, _,
  D5, _,G5, _,B5, _,G5, _,  E5, _,C5, _, _, _, _, _,
];
const mF: N[] = [
  F5, _,E5, _,D5, _,C5, _,  D5, _,G5, _, _, _, _, _,
  A4, _,C5, _,E5, _, _, _,  C5, _, _, _, _, _, _, _,
];

const hA = harm([C4,G4],[A3,E4],[F3,C4],[G3,D4]);
const hB = harmArp([C4,E4,G4],[A3,C4,E4],[F3,A3,C4],[B3,D4,G4]);
const hD = harm([D4,F4],[B3,D4],[C4,E4],[C4,E4]);
const hE = harmArp([A3,C4,E4],[F3,A3,C4],[G3,B3,D4],[C4,E4,G4]);
const hF = harm([A3,C4],[B3,D4],[C4,E4],[C4,G4]);

const bA = bassHalf([C2,C3],[A2,A3],[F2,F3],[G2,G3]);
const bB = bass([C2,C3],[A2,A3],[F2,F3],[G2,G3]);
const bD = bassHalf([D3,F3],[G2,G3],[C2,C3],[C2,C3]);
const bE = bass([A2,A3],[F2,F3],[G2,G3],[C2,C3]);
const bF = bassHalf([F2,F3],[G2,G3],[A2,A3],[C2,C3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Shuffle', meta: { 'author':'Claude', 'key':'C 大调', 'style':'轻快摇曳', 'wave':'方波' }, bpm: 96, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.10, dur: 0.18,
      notes: join(mA, mB, mC, mD, mE, mA, mB, mF) },
    { wave: 'square', gain: 0.04, dur: 0.15,
      notes: join(hA, hB, hA, hD, hE, hA, hB, hF) },
    { wave: 'triangle', gain: 0.15, dur: 0.2,
      notes: join(bA, bB, bA, bD, bE, bA, bB, bF) },
  ],
  kick:  { gain: 0.15, hits: rep([T,F,F,F,T,F,F,F], 32) },
  snare: { gain: 0.04, hits: rep([F,F,T,F,F,F,T,F], 32) },
  hihat: { gain: 0.03, hits: rep([T,F,T,F,T,F,T,F], 32) },
};
export default song;
