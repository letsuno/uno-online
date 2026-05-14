import { getAudioContext } from './audio-context';
import { PLAYLISTS, type Song } from './songs/index';
import type { ToneCh, SongMeta } from './songs/common';

export interface SongInfo { name: string; meta: SongMeta }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  ch: ToneCh;
}

class BgmEngine {
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private playlist: Song[] = [];
  private songIdx = 0;
  private song!: Song;
  private step = 0;
  private nextTime = 0;
  private _playing = false;
  private _currentScene: string | null = null;
  private _onSongChange: ((info: SongInfo) => void) | null = null;

  get isPlaying() { return this._playing; }
  get currentSong(): SongInfo | null { return this._playing && this.song ? { name: this.song.name, meta: this.song.meta } : null; }
  set onSongChange(cb: ((info: SongInfo) => void) | null) { this._onSongChange = cb; }

  private getMaster(): GainNode {
    if (!this.master) {
      const ctx = getAudioContext();
      this.master = ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(ctx.destination);
    }
    return this.master;
  }

  private getNoise(): AudioBuffer {
    if (!this.noiseBuffer) {
      const ctx = getAudioContext();
      const len = Math.ceil(ctx.sampleRate * 0.05);
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  private buildVoices() {
    this.destroyVoices();
    const ctx = getAudioContext();
    const master = this.getMaster();
    for (const ch of this.song.tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = ch.wave;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.connect(gain).connect(master);
      osc.start();
      this.voices.push({ osc, gain, ch });
    }
  }

  private destroyVoices() {
    for (const v of this.voices) {
      try { v.osc.stop(); } catch { /* already stopped */ }
      v.osc.disconnect();
      v.gain.disconnect();
    }
    this.voices = [];
  }

  setVolume(v: number) {
    this.getMaster().gain.setTargetAtTime(v, getAudioContext().currentTime, 0.05);
  }

  start(scene: string) {
    // 同 scene 已在播放则不重启——让 BGM 跨组件 mount/unmount 续播
    if (this._playing && this._currentScene === scene) return;
    this.stop();
    const base = PLAYLISTS[scene] ?? PLAYLISTS.game!;
    this.playlist = shuffle(base);
    this.songIdx = 0;
    this.song = this.playlist[0]!;
    this._playing = true;
    this._currentScene = scene;
    this.launch();
  }

  playSingle(scene: string, index: number) {
    this.stop();
    const base = PLAYLISTS[scene] ?? PLAYLISTS.game!;
    const song = base[index];
    if (!song) return;
    this.playlist = [song];
    this.songIdx = 0;
    this.song = song;
    this._playing = true;
    // playSingle 不设 _currentScene——它是临时的"试听"，结束后下次 start 同 scene 应重启
    this._currentScene = null;
    this.launch();
  }

  private launch() {
    const ctx = getAudioContext();
    void ctx.resume();
    this.getMaster();
    if (ctx.state === 'running') {
      this.beginScheduler();
    } else {
      ctx.addEventListener('statechange', () => {
        if (this._playing && !this.timer) this.beginScheduler();
      }, { once: true });
    }
  }

  private beginScheduler() {
    const ctx = getAudioContext();
    this.buildVoices();
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this._onSongChange?.({ name: this.song.name, meta: this.song.meta });
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop() {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.destroyVoices();
    this._playing = false;
    this._currentScene = null;
  }

  private tick() {
    const now = getAudioContext().currentTime;
    if (this.nextTime < now - 0.5) this.nextTime = now + 0.05;
    const horizon = now + 0.1;
    while (this.nextTime < horizon) {
      this.playStep();
      this.nextTime += 60 / this.song.bpm / this.song.stepsPerBeat;
      this.step++;
    }
  }

  private playStep() {
    const s = this.song;
    const len = s.tones[0]!.notes.length;

    if (this.step >= len) {
      this.songIdx++;
      if (this.songIdx >= this.playlist.length) {
        this.playlist = shuffle(this.playlist);
        this.songIdx = 0;
      }
      this.song = this.playlist[this.songIdx]!;
      this.step = 0;
      this.buildVoices();
      this._onSongChange?.({ name: this.song.name, meta: this.song.meta });
    }

    const i = this.step;
    const t = this.nextTime;

    for (const v of this.voices) {
      const note = v.ch.notes[i];
      if (note != null) {
        v.osc.frequency.setValueAtTime(note, t);
        v.gain.gain.setValueAtTime(v.ch.gain, t);
        v.gain.gain.exponentialRampToValueAtTime(0.001, t + v.ch.dur);
      }
    }

    if (s.kick.hits[i])  this.kick(t, s.kick.gain);
    if (s.snare.hits[i]) this.snare(t, s.snare.gain);
    if (s.hihat.hits[i]) this.hihat(t, s.hihat.gain);
  }

  private kick(t: number, vol: number) {
    const ctx = getAudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.08);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.1);
  }

  private hihat(t: number, vol: number) {
    const ctx = getAudioContext();
    const s = ctx.createBufferSource();
    s.buffer = this.getNoise();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t);
    s.stop(t + 0.04);
  }

  private snare(t: number, vol: number) {
    const ctx = getAudioContext();
    const s = ctx.createBufferSource();
    s.buffer = this.getNoise();
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 3000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(bf).connect(ng).connect(this.master!);
    s.start(t);
    s.stop(t + 0.06);

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(vol * 0.5, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(tg).connect(this.master!);
    o.start(t);
    o.stop(t + 0.05);
  }
}

export const bgm = new BgmEngine();
