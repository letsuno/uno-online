import type { N, Song } from './common';
import { _, T, F, rep, bass,
  C2, C3, F2, F3, G2, G3, A2, A3,
  C4, E4, G4, A4, C5, E5,
} from './common';

const mA: N[] = [
   _, _, _, _, _, _, _, _,   _, _, _, _,E5, _, _, _,
   _, _, _, _, _, _, _, _,   _, _, _, _,C5, _, _, _,
];
const mB: N[] = [
   _, _, _, _, _, _,A4, _,   _, _, _, _, _, _, _, _,
   _, _, _, _, _, _,E5, _,   _, _, _, _, _, _, _, _,
];
const mC: N[] = [
  E5, _, _, _, _, _, _, _,   _, _, _, _, _, _, _, _,
   _, _, _, _, _, _, _, _,  C5, _, _, _, _, _, _, _,
];
const mD: N[] = [
   _, _, _, _, _, _, _, _,   _, _, _, _, _, _, _, _,
   _, _, _, _, _, _, _, _,   _, _, _, _, _, _, _, _,
];
const mE: N[] = [
  E5, _,C5, _, _, _, _, _,  A4, _, _, _, _, _, _, _,
   _, _, _, _, _, _, _, _,   _, _, _, _, _, _, _, _,
];
const silent: N[] = Array.from({ length: 32 }, () => null);

const bA = bass([A2,A3],[F2,F3],[C2,C3],[G2,G3]);
const bB: N[] = [
  A2, _,A2, _, _,A3, _, _,  F2, _,F2, _, _,F3, _, _,
  C3, _,C2, _, _,C3, _, _,  G2, _,G2, _, _,G3, _, _,
];
const bC: N[] = [
  A2,A2, _,A3, _,A2, _,A3,  F2,F2, _,F3, _,F2, _,F3,
  C2,C2, _,C3, _,C2, _,C3,  G2,G2, _,G3, _,G2, _,G3,
];
const bD: N[] = [
  A2, _, _, _, _, _, _, _,  F2, _, _, _, _, _, _, _,
  C2, _, _, _, _, _, _, _,  G2, _, _, _, _, _, _, _,
];

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Pulse', meta: { 'author':'Claude', 'key':'A 小调', 'style':'纯节奏', 'wave':'方波' }, bpm: 140, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.12, dur: 0.05,
      notes: join(mA, mB, mC, mD, mA, mB, mC, mE) },
    { wave: 'square', gain: 0.00, dur: 0.1,
      notes: join(silent, silent, silent, silent, silent, silent, silent, silent) },
    { wave: 'triangle', gain: 0.22, dur: 0.1,
      notes: join(bA, bB, bC, bD, bA, bB, bC, bA) },
  ],
  kick: { gain: 0.25, hits: [
    ...rep([T,F,F,F,T,F,F,F], 8),
    ...rep([T,F,F,T,F,F,T,F], 8),
    ...rep([T,F,T,F,T,F,T,F], 8),
    ...[F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,
        F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
    ...rep([T,F,F,F,T,F,F,F], 8),
    ...rep([T,F,F,T,F,F,T,F], 8),
    ...rep([T,F,T,F,T,F,T,F], 8),
    ...rep([T,F,F,F,T,F,F,F], 7),
    ...[T,T,F,T,T,F,T,T],
  ]},
  snare: { gain: 0.12, hits: [
    ...rep([F,F,T,F,F,F,T,F], 8),
    ...rep([F,F,T,F,F,T,F,F], 8),
    ...rep([F,T,F,T,F,T,F,T], 8),
    ...rep([F,F,T,F,F,F,T,F], 8),
    ...rep([F,F,T,F,F,F,T,F], 8),
    ...rep([F,F,T,F,F,T,F,F], 8),
    ...rep([F,T,F,T,F,T,F,T], 8),
    ...rep([F,F,T,F,F,F,T,F], 7),
    ...[T,F,T,T,F,T,T,T],
  ]},
  hihat: { gain: 0.05, hits: [
    ...rep([T,T,T,T,T,T,T,T], 8),
    ...rep([T,T,T,T,T,T,T,T], 8),
    ...rep([T,T,T,T,T,T,T,T], 8),
    ...rep([T,F,T,F,T,F,T,F], 8),
    ...rep([T,T,T,T,T,T,T,T], 8),
    ...rep([T,T,T,T,T,T,T,T], 8),
    ...rep([T,T,T,T,T,T,T,T], 8),
    ...rep([T,T,T,T,T,T,T,T], 8),
  ]},
};
export default song;
