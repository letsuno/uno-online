import type { N, Song } from './common';
import { _, T, F, rep,
  D2, E2, F2, G2, A2, Bb2, C3, Cs3, D3, E3, F3, G3,
  Bb3, C4, D4, E4, F4, G4, A4, Cs4,
  Bb4, C5, D5, E5, F5, G5, A5, Cs5, Bb5,
} from './common';

// 摇摆三连音网格（stepsPerBeat 3）：每拍 [正拍, _, 反拍] 即 swing 八分
function sw(...beats: [N, N][]): N[] { return beats.flatMap(([a, b]) => [a, _, b]); }
// 走路低音：每小节四个四分音符
function walk(...bars: [N, N, N, N][]): N[] { return bars.flatMap(([a, b, c, d]) => [a, _, _, b, _, _, c, _, _, d, _, _]); }
// 伴奏切分：只在第 2、4 拍的反拍上点和弦内音
function comp(...bars: [N, N][]): N[] { return bars.flatMap(([a, b]) => [_, _, _, _, _, a, _, _, _, _, _, b]); }

const mA = sw(
  [A4,D5],[F5,E5],[D5,_],[A4,_],
  [G4,Bb4],[D5,Bb4],[G5,F5],[D5,_],
  [Cs5,E5],[G5,E5],[A5,_],[E5,Cs5],
  [D5,_],[F5,E5],[D5,_],[_,_],
);
const mB = sw(
  [D5,E5],[F5,G5],[A5,_],[F5,D5],
  [F5,D5],[Bb4,D5],[F5,_],[D5,Bb4],
  [G4,Bb4],[D5,Bb4],[G5,_],[F5,D5],
  [E5,Cs5],[A4,_],[E5,G5],[_,_],
);
const mC = sw(
  [A4,C5],[F5,E5],[C5,A4],[F4,_],
  [G4,C5],[E5,D5],[C5,G4],[C5,_],
  [Bb4,D5],[F5,_],[Bb5,A5],[F5,D5],
  [E5,Cs5],[E5,G5],[A5,_],[_,_],
);
const mD = sw(
  [D5,_],[_,_],[_,_],[A4,_],
  [_,_],[F5,_],[_,_],[D5,_],
  [_,_],[_,_],[G5,_],[_,_],
  [_,_],[E5,_],[Cs5,_],[A4,_],
);
const mE = sw(
  [A4,D5],[F5,E5],[D5,_],[A4,_],
  [G4,Bb4],[D5,F5],[G5,_],[_,_],
  [A5,G5],[E5,Cs5],[A4,_],[Cs5,E5],
  [D5,_],[A4,F4],[D4,_],[_,_],
);

const hA = comp([F4,A4],[Bb3,D4],[Cs4,G4],[F4,A4]);
const hB = comp([F4,A4],[D4,F4],[Bb3,D4],[Cs4,G4]);
const hC = comp([C4,F4],[E4,G4],[D4,F4],[Cs4,G4]);
const hD = comp([F4,_],[_,D4],[Bb3,_],[Cs4,G4]);
const hE = comp([F4,A4],[Bb3,D4],[Cs4,G4],[D4,_]);

const bA = walk([D2,F2,A2,C3],[G2,Bb2,D3,Bb2],[A2,Cs3,E3,G3],[D3,A2,F2,A2]);
const bB = walk([D2,F2,A2,F2],[Bb2,D3,F3,D3],[G2,Bb2,D3,Bb2],[A2,Cs3,E3,Cs3]);
const bC = walk([F2,A2,C3,A2],[C3,G2,E2,G2],[Bb2,D3,F3,D3],[A2,Cs3,E3,Cs3]);
const bD = walk([D2,_,A2,_],[D2,_,F2,_],[G2,_,Bb2,_],[A2,Cs3,E3,G3]);
const bE = walk([D2,F2,A2,C3],[G2,Bb2,D3,Bb2],[A2,Cs3,E3,Cs3],[D2,A2,D2,_]);

function join(...s: N[][]): N[] { return s.flat(); }

const kMain = [T,F,F,F,F,F,T,F,F,F,F,F];
const sMain = [F,F,F,T,F,F,F,F,F,T,F,F];
const hhSwing = [T,F,F,T,F,T,T,F,F,T,F,T];

const song: Song = {
  name: 'Cardsharp', meta: { 'author':'Claude Fable 5', 'key':'D 小调', 'style':'摇摆爵士', 'wave':'方波' }, bpm: 112, stepsPerBeat: 3,
  tones: [
    { wave: 'square', gain: 0.09, dur: 0.13,
      notes: join(mA, mB, mA, mC, mD, mA, mB, mE) },
    { wave: 'square', gain: 0.04, dur: 0.1,
      notes: join(hA, hB, hA, hC, hD, hA, hB, hE) },
    { wave: 'triangle', gain: 0.20, dur: 0.16,
      notes: join(bA, bB, bA, bC, bD, bA, bB, bE) },
  ],
  kick: { gain: 0.13, hits: [
    ...rep(kMain, 16),
    ...rep([T,F,F,F,F,F,F,F,F,F,F,F], 4),
    ...rep(kMain, 11),
    T,F,F,T,F,F,T,F,F,T,T,F,
  ]},
  snare: { gain: 0.05, hits: [
    ...rep(sMain, 16),
    ...rep([F,F,F,T,F,T,F,F,F,T,F,T], 4),
    ...rep(sMain, 11),
    F,F,F,T,F,F,T,F,T,T,F,T,
  ]},
  hihat: { gain: 0.045, hits: rep(hhSwing, 32) },
};
export default song;
