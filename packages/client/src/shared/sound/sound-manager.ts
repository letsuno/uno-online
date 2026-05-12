import { useSettingsStore } from '../stores/settings-store';
import { getAudioContext } from './audio-context';

type SoundName =
  | 'play_card'
  | 'draw_card'
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'wild'
  | 'uno_call'
  | 'uno_catch'
  | 'penalty'
  | 'throw_hit'
  | 'timer_tick'
  | 'win'
  | 'lose'
  | 'player_join'
  | 'player_leave'
  | 'voice_join'
  | 'voice_leave'
  | 'your_turn'
  | 'error'
  | 'click'
  | 'ready'
  | 'action'
  | 'danger';

export type ButtonSound = 'click' | 'ready' | 'action' | 'danger';

const FREQUENCIES: Record<SoundName, { freq: number; duration: number; type: OscillatorType }> = {
  play_card:    { freq: 800, duration: 0.08, type: 'square' },
  draw_card:    { freq: 400, duration: 0.1, type: 'triangle' },
  skip:         { freq: 300, duration: 0.15, type: 'sawtooth' },
  reverse:      { freq: 600, duration: 0.2, type: 'sine' },
  draw_two:     { freq: 500, duration: 0.12, type: 'square' },
  wild:         { freq: 1000, duration: 0.15, type: 'sine' },
  uno_call:     { freq: 1200, duration: 0.3, type: 'square' },
  uno_catch:    { freq: 200, duration: 0.25, type: 'sawtooth' },
  penalty:      { freq: 180, duration: 0.28, type: 'sawtooth' },
  throw_hit:    { freq: 160, duration: 0.12, type: 'square' },
  timer_tick:   { freq: 900, duration: 0.05, type: 'sine' },
  win:          { freq: 1400, duration: 0.5, type: 'sine' },
  lose:         { freq: 250, duration: 0.4, type: 'triangle' },
  player_join:  { freq: 700, duration: 0.1, type: 'sine' },
  player_leave: { freq: 350, duration: 0.15, type: 'sine' },
  voice_join:   { freq: 660, duration: 0.12, type: 'sine' },
  voice_leave:  { freq: 440, duration: 0.15, type: 'sine' },
  your_turn:    { freq: 880, duration: 0.15, type: 'sine' },
  error:        { freq: 200, duration: 0.2, type: 'square' },
  click:        { freq: 1100, duration: 0.04, type: 'sine' },
  ready:        { freq: 880, duration: 0.1, type: 'sine' },
  action:       { freq: 1000, duration: 0.06, type: 'square' },
  danger:       { freq: 280, duration: 0.1, type: 'sawtooth' },
};

const THROW_HIT_SOUND_BY_ITEM: Record<string, string> = {
  '🍅': '/sounds/throw-tomato-squish.mp3',
  '💩': '/sounds/throw-slime-impact.mp3',
  '🥚': '/sounds/throw-cartoon-hit.mp3',
  '🌹': '/sounds/throw-cartoon-hit.mp3',
  '👍': '/sounds/throw-boing.mp3',
  '💖': '/sounds/throw-boing.mp3',
};

export function playSound(name: SoundName): void {
  const { soundEnabled, soundVolume } = useSettingsStore.getState();
  if (!soundEnabled || soundVolume <= 0) return;

  const config = FREQUENCIES[name];
  const ctx = getAudioContext();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = config.type;
  osc.frequency.setValueAtTime(config.freq, ctx.currentTime);

  if (name === 'win') {
    osc.frequency.linearRampToValueAtTime(1800, ctx.currentTime + config.duration);
  } else if (name === 'lose') {
    osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + config.duration);
  } else if (name === 'penalty') {
    osc.frequency.linearRampToValueAtTime(90, ctx.currentTime + config.duration);
  } else if (name === 'throw_hit') {
    osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + config.duration);
  } else if (name === 'ready') {
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + config.duration);
  } else if (name === 'danger') {
    osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + config.duration);
  } else if (name === 'voice_join') {
    osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + config.duration);
  } else if (name === 'voice_leave') {
    osc.frequency.linearRampToValueAtTime(330, ctx.currentTime + config.duration);
  }

  gain.gain.setValueAtTime(soundVolume * 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + config.duration);
}

export function playThrowHitSound(item: string): void {
  const { soundEnabled, soundVolume } = useSettingsStore.getState();
  if (!soundEnabled || soundVolume <= 0) return;

  const src = THROW_HIT_SOUND_BY_ITEM[item];
  if (!src) {
    playSound('throw_hit');
    return;
  }

  const audio = new Audio(src);
  audio.volume = Math.min(1, Math.max(0, soundVolume * 0.9));
  void audio.play().catch(() => {
    playSound('throw_hit');
  });
}
