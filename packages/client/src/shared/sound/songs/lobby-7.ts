import type { N, Song } from './common';
import { _, T, F, rep,
  E2, G2, A2, C3, D3,
  B3, C4, D4, E4, Fs4, G4,
  A4, B4, C5, D5, E5, Fs5, G5, A5, B5, C6,
} from './common';

// 3/4 拍：每小节 6 步（oom 踩第 1 拍，pah 弹第 2、3 拍）
function oom(...roots: N[]): N[] { return roots.flatMap((r) => [r, _, _, _, _, _]); }
function pah(...bars: [N, N][]): N[] { return bars.flatMap(([a, b]) => [_, _, a, _, b, _]); }

const mA: N[] = [
  G4, _,B4, _,D5, _,  G5, _, _, _, _, _,  Fs5, _,E5, _,D5, _,  B4, _, _, _, _, _,
  A4, _,C5, _,E5, _,  A5, _, _, _, _, _,  G5, _,Fs5, _,E5, _,  D5, _, _, _, _, _,
];
const mB: N[] = [
  B4, _,D5, _,G5, _,  B5, _, _, _,A5, _,  G5, _,E5, _,C5, _,  E5, _, _, _, _, _,
  D5, _,Fs5, _,A5, _,  C6, _, _, _,B5, _,  A5, _,Fs5, _,C5, _,  G5, _, _, _, _, _,
];
const mC: N[] = [
  B4, _,E5, _,G5, _,  Fs5, _, _, _,D5, _,  C5, _,E5, _,A5, _,  G5, _, _, _,E5, _,
  D5, _,G5, _,B5, _,  A5, _, _, _,Fs5, _,  G5, _,D5, _,B4, _,  A4, _, _, _, _, _,
];
const mE: N[] = [
  G4, _,B4, _,D5, _,  G5, _, _, _,E5, _,  D5, _,C5, _,A4, _,  B4, _, _, _, _, _,
  A4, _,C5, _,E5, _,  Fs5, _,E5, _,C5, _,  G5, _, _, _, _, _,   _, _, _, _, _, _,
];

const hA = pah([B3,D4],[B3,D4],[D4,Fs4],[D4,Fs4],[C4,E4],[C4,E4],[D4,Fs4],[D4,Fs4]);
const hB = pah([B3,D4],[B3,D4],[E4,G4],[E4,G4],[D4,Fs4],[D4,Fs4],[C4,Fs4],[B3,D4]);
const hC = pah([B3,E4],[D4,Fs4],[C4,E4],[E4,G4],[B3,D4],[D4,Fs4],[B3,D4],[D4,Fs4]);
const hE = pah([B3,D4],[E4,G4],[C4,Fs4],[B3,D4],[C4,E4],[C4,Fs4],[B3,D4],[_,_]);

const bA = oom(G2, G2, D3, D3, A2, A2, D3, D3);
const bB = oom(G2, G2, C3, C3, D3, D3, D3, G2);
const bC = oom(E2, D3, A2, C3, G2, D3, G2, D3);
const bE = oom(G2, C3, D3, G2, A2, D3, G2, G2);

function join(...s: N[][]): N[] { return s.flat(); }

const song: Song = {
  name: 'Carousel', meta: { 'author':'Claude Fable 5', 'key':'G 大调', 'style':'旋转木马圆舞曲', 'wave':'三角波' }, bpm: 96, stepsPerBeat: 2,
  tones: [
    { wave: 'triangle', gain: 0.13, dur: 0.28,
      notes: join(mA, mB, mA, mC, mA, mE) },
    { wave: 'square', gain: 0.035, dur: 0.14,
      notes: join(hA, hB, hA, hC, hA, hE) },
    { wave: 'triangle', gain: 0.16, dur: 0.3,
      notes: join(bA, bB, bA, bC, bA, bE) },
  ],
  kick:  { gain: 0.07, hits: rep([T,F,F,F,F,F], 48) },
  snare: { gain: 0.00, hits: rep([F,F,F,F,F,F], 48) },
  hihat: { gain: 0.02, hits: rep([F,F,T,F,T,F], 48) },
};
export default song;
