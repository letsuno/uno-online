import { useSettingsStore } from '../stores/settings-store';

type SoundName =
  | 'play_card'
  | 'draw_card'
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'wild'
  | 'uno_call'
  | 'uno_catch'
  | 'timer_tick'
  | 'win'
  | 'lose'
  | 'player_join'
  | 'player_leave'
  | 'your_turn'
  | 'error';

const FREQUENCIES: Record<SoundName, { freq: number; duration: number; type: OscillatorType }> = {
  play_card:    { freq: 800, duration: 0.08, type: 'square' },
  draw_card:    { freq: 400, duration: 0.1, type: 'triangle' },
  skip:         { freq: 300, duration: 0.15, type: 'sawtooth' },
  reverse:      { freq: 600, duration: 0.2, type: 'sine' },
  draw_two:     { freq: 500, duration: 0.12, type: 'square' },
  wild:         { freq: 1000, duration: 0.15, type: 'sine' },
  uno_call:     { freq: 1200, duration: 0.3, type: 'square' },
  uno_catch:    { freq: 200, duration: 0.25, type: 'sawtooth' },
  timer_tick:   { freq: 900, duration: 0.05, type: 'sine' },
  win:          { freq: 1400, duration: 0.5, type: 'sine' },
  lose:         { freq: 250, duration: 0.4, type: 'triangle' },
  player_join:  { freq: 700, duration: 0.1, type: 'sine' },
  player_leave: { freq: 350, duration: 0.15, type: 'sine' },
  your_turn:    { freq: 880, duration: 0.15, type: 'sine' },
  error:        { freq: 200, duration: 0.2, type: 'square' },
};

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function playSound(name: SoundName): void {
  const { soundEnabled, soundVolume } = useSettingsStore.getState();
  if (!soundEnabled || soundVolume <= 0) return;

  const config = FREQUENCIES[name];
  const ctx = getAudioCtx();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = config.type;
  osc.frequency.setValueAtTime(config.freq, ctx.currentTime);

  if (name === 'win') {
    osc.frequency.linearRampToValueAtTime(1800, ctx.currentTime + config.duration);
  } else if (name === 'lose') {
    osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + config.duration);
  }

  gain.gain.setValueAtTime(soundVolume * 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + config.duration);
}
