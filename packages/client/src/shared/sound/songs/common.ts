export const _ = null;
export const T = true, F = false;

export const C2 = 65.41, D2 = 73.42, E2 = 82.41, F2 = 87.31, G2 = 98.00, A2 = 110.00, B2 = 123.47;
export const C3 = 130.81, D3 = 146.83, E3 = 164.81, F3 = 174.61, G3 = 196.00, A3 = 220.00, B3 = 246.94;
export const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.00, A4 = 440.00, B4 = 493.88;
export const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880.00, B5 = 987.77;
export const C6 = 1046.50, D6 = 1174.66;

export const Fs3 = 185.00, Fs4 = 369.99, Fs5 = 739.99;
export const Bb2 = 116.54, Bb3 = 233.08, Bb4 = 466.16, Bb5 = 932.33;

export type N = number | null;
export interface ToneCh { wave: OscillatorType; gain: number; dur: number; notes: N[] }
export interface DrumCh { gain: number; hits: boolean[] }
export interface Song { name: string; bpm: number; stepsPerBeat: number; tones: ToneCh[]; kick: DrumCh; snare: DrumCh; hihat: DrumCh }

export function rep(p: boolean[], n: number): boolean[] {
  const r: boolean[] = [];
  for (let i = 0; i < n; i++) r.push(...p);
  return r;
}

export function harm(...bars: [N, N][]): N[] {
  return bars.flatMap(([a, b]) => [a, _, _, _, b, _, _, _]);
}

export function harmArp(...bars: [N, N, N][]): N[] {
  return bars.flatMap(([a, b, c]) => [a, _, b, _, c, _, b, _]);
}

export function bass(...bars: [N, N][]): N[] {
  return bars.flatMap(([lo, hi]) => [lo, _, hi, _, lo, _, hi, _]);
}

export function bassHalf(...bars: [N, N][]): N[] {
  return bars.flatMap(([lo, hi]) => [lo, _, _, _, hi, _, _, _]);
}
