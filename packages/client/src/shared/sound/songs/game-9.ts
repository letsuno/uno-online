import type { N, Song } from './common';
import { _, T, F, rep, bass,
  C2, C3, F2, F3, G2, G3, A2, A3,
  C4, E4, G4, A4, C5, E5,
} from './common';


// 旋律：极度稀疏的 stab，每段只有几个音
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

// 无和声
const silent: N[] = Array.from({ length: 32 }, () => null);

// 贝斯：短促有力的根音脉冲
const bA = bass([A2,A3],[F2,F3],[C2,C3],[G2,G3]);
const bB: N[] = [
  A2, _,A2, _, _,A3, _, _,  F2, _,F2, _, _,F3, _, _,
  C3, _,C2, _, _,C3, _, _,  G2, _,G2, _, _,G3, _, _,
];
const bC: N[] = [
  A2,A2, _,A3, _,A2, _,A3,  F2,F2, _,F3, _,F2, _,F3,
  C2,C2, _,C3, _,C2, _,C3,  G2,G2, _,G3, _,G2, _,G3,
];
const bD: N[] = [ // breakdown — 只有根音长音
  A2, _, _, _, _, _, _, _,  F2, _, _, _, _, _, _, _,
  C2, _, _, _, _, _, _, _,  G2, _, _, _, _, _, _, _,
];

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Pulse', bpm: 140, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.12, dur: 0.05,
      notes: join(mA, mB, mC, mD, mA, mB, mC, mE) },
    { wave: 'square', gain: 0.00, dur: 0.1,
      notes: join(silent, silent, silent, silent, silent, silent, silent, silent) },
    { wave: 'triangle', gain: 0.22, dur: 0.1,
      notes: join(bA, bB, bC, bD, bA, bB, bC, bA) },
  ],
  // ── 鼓组：段落间差异极大 ──
  kick: { gain: 0.25, hits: [
    ...rep([T,F,F,F,T,F,F,F], 8),              // A: four-on-the-floor
    ...rep([T,F,F,T,F,F,T,F], 8),              // B: syncopated
    ...rep([T,F,T,F,T,F,T,F], 8),              // C: double-time
    ...[F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,      // D: breakdown (no kick)
        F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
    ...rep([T,F,F,F,T,F,F,F], 8),              // A
    ...rep([T,F,F,T,F,F,T,F], 8),              // B
    ...rep([T,F,T,F,T,F,T,F], 8),              // C
    ...rep([T,F,F,F,T,F,F,F], 7),              // E: standard + fill
    ...[T,T,F,T,T,F,T,T],
  ]},
  snare: { gain: 0.12, hits: [
    ...rep([F,F,T,F,F,F,T,F], 8),              // A
    ...rep([F,F,T,F,F,T,F,F], 8),              // B: off-beat
    ...rep([F,T,F,T,F,T,F,T], 8),              // C: every off-beat
    ...rep([F,F,T,F,F,F,T,F], 8),              // D: standard over silence
    ...rep([F,F,T,F,F,F,T,F], 8),              // A
    ...rep([F,F,T,F,F,T,F,F], 8),              // B
    ...rep([F,T,F,T,F,T,F,T], 8),              // C
    ...rep([F,F,T,F,F,F,T,F], 7),              // E + fill
    ...[T,F,T,T,F,T,T,T],
  ]},
  hihat: { gain: 0.05, hits: [
    ...rep([T,T,T,T,T,T,T,T], 8),              // A: 8ths
    ...rep([T,T,T,T,T,T,T,T], 8),              // B
    ...rep([T,T,T,T,T,T,T,T], 8),              // C
    ...rep([T,F,T,F,T,F,T,F], 8),              // D: quarter (sparse)
    ...rep([T,T,T,T,T,T,T,T], 8),              // A
    ...rep([T,T,T,T,T,T,T,T], 8),              // B
    ...rep([T,T,T,T,T,T,T,T], 8),              // C
    ...rep([T,T,T,T,T,T,T,T], 8),              // E
  ]},
};
export default song;
