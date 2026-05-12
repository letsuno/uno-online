import type { N, Song } from './common';
import { _, T, F, rep, harm, harmArp, bass,
  C2, C3, F2, F3, G2, G3, A2, A3, B2, D3,
  B3, C4, D4, E4, F4, G4,
  A4, B4, C5, D5, E5, F5, G5, A5, B5, D6,
} from './common';


// ── Melody sections (4 bars = 32 steps) ──

const mA: N[] = [ // C – G – Am – F  (bouncy arpeggios)
  C5,C5,E5,E5,G5,G5,E5, _,  B4,B4,D5,D5,G5, _,D5, _,
  A4,A4,C5,C5,E5,E5,C5, _,  F4,F4,A4,A4,C5, _, _, _,
];
const mB: N[] = [ // C – G – F – G  (flowing)
  E5, _,G5, _,C5, _,G5,E5,  D5, _,G5, _,B5, _,A5,G5,
  F5, _,A5, _,G5,F5, _,E5,  G5, _,B5, _,D6, _, _, _,
];
const mC: N[] = [ // C – G – Am – F  (A' variation)
  C5,C5,E5,E5,G5,G5,E5, _,  B4,B4,D5,D5,G5, _,D5, _,
  A4,A4,C5,C5,E5,E5,C5, _,  A4, _,C5, _,F5, _,E5,D5,
];
const mD: N[] = [ // Am – F – G – C  (bridge)
  E5, _,A5, _,E5,C5, _,A4,  F5, _,C5, _,A4, _,C5,F5,
  G5, _,D5, _,B4,D5,G5, _,  C5, _,E5, _,G5, _, _, _,
];
const mE: N[] = [ // Dm – G – C – Am  (new: descending stepwise)
  D5, _,F5, _,E5,D5, _,C5,  B4, _,D5, _,G5, _,F5,E5,
  E5, _,G5, _,C5, _,E5,G5,  A5, _,G5, _,E5, _,C5, _,
];
const mF: N[] = [ // F – G – Am – C  (new: syncopated climax)
   _,F5, _,A5,C5, _,F5, _,   _,G5, _,B5,D5, _,G5, _,
  A5, _,E5, _,C5,E5,A5, _,  G5, _,E5, _,C5, _, _, _,
];

// ── Harmony ──
const hA  = harm([E4,G4],[D4,G4],[C4,E4],[C4,A3]);
const hB  = harmArp([C4,E4,G4],[B3,D4,G4],[A3,C4,F4],[B3,D4,G4]);
const hD  = harmArp([A3,C4,E4],[F3,A3,C4],[G3,B3,D4],[C4,E4,G4]);
const hE  = harm([D4,F4],[B3,D4],[C4,E4],[C4,A3]);
const hF  = harm([A3,F4],[B3,G4],[C4,E4],[C4,G4]);

// ── Bass ──
const bA = bass([C3,C2],[G2,G3],[A2,A3],[F2,F3]);
const bB = bass([C2,C3],[G2,G3],[F2,F3],[G2,G3]);
const bD = bass([A2,A3],[F2,F3],[G2,G3],[C2,C3]);
const bE = bass([D3,F3],[G2,G3],[C2,C3],[A2,A3]);
const bF = bass([F2,F3],[G2,G3],[A2,A3],[C2,C3]);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'UNO Bounce', bpm: 138, stepsPerBeat: 2,
  tones: [
    { wave: 'square', gain: 0.15, dur: 0.1,
      notes: join(mA, mC, mB, mD, mE, mA, mB, mF) },
    { wave: 'square', gain: 0.07, dur: 0.12,
      notes: join(hA, hA, hB, hD, hE, hA, hB, hF) },
    { wave: 'triangle', gain: 0.18, dur: 0.15,
      notes: join(bA, bA, bB, bD, bE, bA, bB, bF) },
  ],
  kick:  { gain: 0.20, hits: [...rep([T,F,F,F,T,F,F,F], 31), T,F,F,T,T,F,T,F] },
  snare: { gain: 0.10, hits: [...rep([F,F,T,F,F,F,T,F], 31), F,F,T,F,T,F,T,T] },
  hihat: { gain: 0.04, hits: [
    ...rep([T,F,T,F,T,F,T,F], 8), ...rep([T,T,T,T,T,T,T,T], 8),
    ...rep([T,F,T,F,T,F,T,F], 8), ...rep([T,T,T,T,T,T,T,T], 8),
  ]},
};
export default song;
