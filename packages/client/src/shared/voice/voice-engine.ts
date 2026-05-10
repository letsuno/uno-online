type VoiceEngineConfig = {
  onMicPcm: (pcm: Float32Array, sampleRate: number) => void
  onMicEnd: () => void
  onPlaybackStats?: (stats: { totalQueuedMs: number; maxQueuedMs: number; streams: number }) => void
  onCaptureStats?: (stats: { rms: number; sending: boolean }) => void
}

export type VoicePcmFrame = {
  userId: number
  channels: number
  sampleRate: number
  pcm: Float32Array
}

export class VoiceEngine {
  private _config: VoiceEngineConfig

  private _audioContext: AudioContext | null = null
  private _playbackNode: AudioWorkletNode | null = null
  private _playbackGain: GainNode | null = null
  private _captureNode: AudioWorkletNode | null = null
  private _captureGain: GainNode | null = null
  private _muted = false

  private _micStream: MediaStream | null = null
  private _micSource: MediaStreamAudioSourceNode | null = null

  private _micEnabled = false
  private _mode: 'vad' | 'ptt' = 'vad'
  private _pttActive = false
  private _vadThreshold = 0.02
  private _vadHoldTimeMs = 200

  constructor(config: VoiceEngineConfig) {
    this._config = config
  }

  get audioReady() {
    return Boolean(this._audioContext && this._playbackNode)
  }

  get micEnabled() {
    return this._micEnabled
  }

  get muted() {
    return this._muted
  }

  setMuted(muted: boolean) {
    this._muted = muted
    if (this._playbackGain) {
      this._playbackGain.gain.value = muted ? 0 : 1
    }
  }

  async enableAudio(): Promise<void> {
    if (this._audioContext && this._playbackNode) {
      await this._audioContext.resume()
      return
    }

    const ctx = new AudioContext({ sampleRate: 48000 })
    await ctx.resume()

    const playbackCode = `
class MumblePlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._streams = new Map();
    this._lastStatsTime = 0;
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'pcm') return;
      const userId = Number(msg.userId) >>> 0;
      const channels = Number(msg.channels) || 1;
      if (!(msg.pcm instanceof ArrayBuffer)) return;
      const pcm = new Float32Array(msg.pcm);
      let stream = this._streams.get(userId);
      if (!stream) {
        stream = { queue: [], current: null, lastActive: currentTime };
        this._streams.set(userId, stream);
      }
      stream.queue.push({ pcm, channels, offsetFrames: 0 });
      stream.lastActive = currentTime;
      if (stream.queue.length > 200) stream.queue.splice(0, stream.queue.length - 200);
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outChannels = output.length;
    const frames = output[0].length;
    for (let ch = 0; ch < outChannels; ch++) output[ch].fill(0);
    for (const [userId, stream] of this._streams) {
      if (!stream.current && stream.queue.length > 0) stream.current = stream.queue.shift();
      let item = stream.current;
      if (!item) { if (currentTime - stream.lastActive > 10) this._streams.delete(userId); continue; }
      let writeIndex = 0;
      while (writeIndex < frames) {
        if (!item) break;
        const inChannels = item.channels || 1;
        const totalFrames = Math.floor(item.pcm.length / inChannels);
        const remainingFrames = totalFrames - item.offsetFrames;
        if (remainingFrames <= 0) { item = stream.queue.shift() || null; stream.current = item; continue; }
        const toCopy = Math.min(remainingFrames, frames - writeIndex);
        for (let i = 0; i < toCopy; i++) {
          const srcBase = (item.offsetFrames + i) * inChannels;
          const left = item.pcm[srcBase] ?? 0;
          const right = inChannels >= 2 ? (item.pcm[srcBase + 1] ?? left) : left;
          output[0][writeIndex + i] += left;
          if (outChannels >= 2) output[1][writeIndex + i] += right;
        }
        item.offsetFrames += toCopy;
        writeIndex += toCopy;
      }
    }
    for (let ch = 0; ch < outChannels; ch++) { const arr = output[ch]; for (let i = 0; i < frames; i++) { const v = arr[i]; arr[i] = v > 1 ? 1 : v < -1 ? -1 : v; } }
    if (currentTime - this._lastStatsTime >= 0.5) {
      let totalQueuedFrames = 0, maxQueuedFrames = 0, activeStreams = 0;
      for (const stream of this._streams.values()) {
        let qf = 0;
        if (stream.current) { const ic = stream.current.channels || 1; qf += Math.max(0, Math.floor(stream.current.pcm.length / ic) - stream.current.offsetFrames); }
        for (const item of stream.queue) { qf += Math.floor(item.pcm.length / (item.channels || 1)); }
        if (qf > 0) activeStreams += 1;
        totalQueuedFrames += qf;
        if (qf > maxQueuedFrames) maxQueuedFrames = qf;
      }
      this.port.postMessage({ type: 'stats', totalQueuedMs: (totalQueuedFrames / sampleRate) * 1000, maxQueuedMs: (maxQueuedFrames / sampleRate) * 1000, streams: activeStreams });
      this._lastStatsTime = currentTime;
    }
    return true;
  }
}
registerProcessor('mumble-playback', MumblePlaybackProcessor);
`;

    const captureCode = `
class MumbleCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._enabled = false; this._mode = 'vad'; this._pttActive = false;
    this._vadThreshold = 0.02; this._hangoverFrames = 5; this._frameSize = 960;
    this._frameBuffer = new Float32Array(this._frameSize); this._frameWrite = 0;
    this._sending = false; this._hangoverLeft = 0; this._lastStatsTime = 0; this._lastSending = false;
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'config') return;
      if (typeof msg.enabled === 'boolean') this._enabled = msg.enabled;
      if (msg.mode === 'vad' || msg.mode === 'ptt') this._mode = msg.mode;
      if (typeof msg.pttActive === 'boolean') this._pttActive = msg.pttActive;
      if (typeof msg.vadThreshold === 'number') this._vadThreshold = msg.vadThreshold;
      if (typeof msg.hangoverFrames === 'number') this._hangoverFrames = msg.hangoverFrames;
      if (typeof msg.frameSize === 'number' && msg.frameSize > 0 && msg.frameSize <= 2880) {
        this._frameSize = msg.frameSize | 0;
        this._frameBuffer = new Float32Array(this._frameSize);
        this._frameWrite = 0;
      }
    };
  }
  _emitFrame(frame) { const copy = new Float32Array(frame.length); copy.set(frame); this.port.postMessage({ type: 'pcm', pcm: copy.buffer }, [copy.buffer]); }
  _emitEnd() { this.port.postMessage({ type: 'end' }); }
  process(inputs, outputs) {
    const output = outputs[0];
    if (output) { for (let ch = 0; ch < output.length; ch++) output[ch].fill(0); }
    if (!this._enabled) { if (this._sending) { this._sending = false; this._hangoverLeft = 0; this._emitEnd(); } return true; }
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channels = input.length; const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let s = 0; for (let ch = 0; ch < channels; ch++) s += input[ch][i] ?? 0; s /= channels;
      this._frameBuffer[this._frameWrite++] = s;
      if (this._frameWrite === this._frameSize) {
        let sumSq = 0; for (let j = 0; j < this._frameSize; j++) { const v = this._frameBuffer[j]; sumSq += v * v; }
        const rms = Math.sqrt(sumSq / this._frameSize);
        let shouldSend = false;
        if (this._mode === 'ptt') { shouldSend = this._pttActive; }
        else { if (rms >= this._vadThreshold) { shouldSend = true; this._hangoverLeft = this._hangoverFrames; } else if (this._hangoverLeft > 0) { shouldSend = true; this._hangoverLeft -= 1; } }
        if (shouldSend) { this._sending = true; this._emitFrame(this._frameBuffer); }
        else if (this._sending) { this._sending = false; this._hangoverLeft = 0; this._emitEnd(); }
        if (currentTime - this._lastStatsTime >= 0.2 || this._sending !== this._lastSending) {
          this.port.postMessage({ type: 'stats', rms, sending: this._sending });
          this._lastStatsTime = currentTime; this._lastSending = this._sending;
        }
        this._frameWrite = 0;
      }
    }
    return true;
  }
}
registerProcessor('mumble-capture', MumbleCaptureProcessor);
`;

    function workletBlobUrl(code: string): string {
      const blob = new Blob([code], { type: 'text/javascript' });
      return URL.createObjectURL(blob);
    }

    const playbackUrl = workletBlobUrl(playbackCode);
    const captureUrl = workletBlobUrl(captureCode);
    await ctx.audioWorklet.addModule(playbackUrl);
    await ctx.audioWorklet.addModule(captureUrl);

    const playback = new AudioWorkletNode(ctx, 'mumble-playback', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    })

    const playbackGain = ctx.createGain()
    playbackGain.gain.value = this._muted ? 0 : 1
    playback.connect(playbackGain).connect(ctx.destination)

    playback.port.onmessage = (event) => {
      const msg = event.data
      if (!msg || msg.type !== 'stats') return
      this._config.onPlaybackStats?.({
        totalQueuedMs: typeof msg.totalQueuedMs === 'number' ? msg.totalQueuedMs : 0,
        maxQueuedMs: typeof msg.maxQueuedMs === 'number' ? msg.maxQueuedMs : 0,
        streams: typeof msg.streams === 'number' ? msg.streams : 0
      })
    }

    this._audioContext = ctx
    this._playbackNode = playback
    this._playbackGain = playbackGain

    if (ctx.sampleRate !== 48000) {
      // Keep working, but current implementation assumes 48kHz for both playback and uplink.
      // Resampling will be added later.
      // eslint-disable-next-line no-console
      console.warn(`[voice] AudioContext sampleRate is ${ctx.sampleRate} (expected 48000)`)
    }

    await ctx.resume()
  }

  pushRemotePcm(frame: VoicePcmFrame): void {
    const ctx = this._audioContext
    const playback = this._playbackNode
    if (!ctx || !playback) return

    // Current pipeline expects 48kHz PCM. Resampling can be added when needed.
    if (frame.sampleRate !== 48000) return

    const pcmCopy = new Float32Array(frame.pcm.length)
    pcmCopy.set(frame.pcm)

    playback.port.postMessage(
      { type: 'pcm', userId: frame.userId, channels: frame.channels, pcm: pcmCopy.buffer },
      [pcmCopy.buffer]
    )
  }

  setMode(mode: 'vad' | 'ptt') {
    this._mode = mode
    this._postCaptureConfig()
  }

  setVadThreshold(value: number) {
    this._vadThreshold = value
    this._postCaptureConfig()
  }

  setVadHoldTime(ms: number) {
    this._vadHoldTimeMs = ms
    this._postCaptureConfig()
  }

  setPttActive(active: boolean) {
    this._pttActive = active
    this._postCaptureConfig()
  }

  private _postCaptureConfig() {
    if (!this._captureNode) return
    const hangoverFrames = Math.round(this._vadHoldTimeMs / 20)
    this._captureNode.port.postMessage({
      type: 'config',
      enabled: this._micEnabled,
      mode: this._mode,
      pttActive: this._pttActive,
      vadThreshold: this._vadThreshold,
      frameSize: 960,
      hangoverFrames
    })
  }

  async enableMic(options?: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean; deviceId?: string }): Promise<void> {
    if (this._micEnabled) return
    await this.enableAudio()

    const ctx = this._audioContext
    if (!ctx) return

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: options?.echoCancellation ?? true,
      noiseSuppression: options?.noiseSuppression ?? true,
      autoGainControl: options?.autoGainControl ?? true,
      channelCount: 1
    }
    if (options?.deviceId) {
      audioConstraints.deviceId = { exact: options.deviceId }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })

    const source = ctx.createMediaStreamSource(stream)
    const capture = new AudioWorkletNode(ctx, 'mumble-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    })

    // Keep the node running while not producing audible output.
    const gain = ctx.createGain()
    gain.gain.value = 0

    source.connect(capture)
    capture.connect(gain).connect(ctx.destination)

    capture.port.onmessage = (event) => {
      const msg = event.data
      if (!msg || typeof msg.type !== 'string') return
      if (msg.type === 'pcm' && msg.pcm instanceof ArrayBuffer) {
        const pcm = new Float32Array(msg.pcm)
        this._config.onMicPcm(pcm, ctx.sampleRate)
      } else if (msg.type === 'end') {
        this._config.onMicEnd()
      } else if (msg.type === 'stats') {
        this._config.onCaptureStats?.({
          rms: typeof msg.rms === 'number' ? msg.rms : 0,
          sending: Boolean(msg.sending)
        })
      }
    }

    this._micStream = stream
    this._micSource = source
    this._captureNode = capture
    this._captureGain = gain
    this._micEnabled = true
    this._postCaptureConfig()
  }

  disableMic(): void {
    if (!this._micEnabled) return

    this._micEnabled = false
    this._postCaptureConfig()
    this._config.onMicEnd()
    this._config.onCaptureStats?.({ rms: 0, sending: false })

    if (this._micSource) {
      try {
        this._micSource.disconnect()
      } catch {}
      this._micSource = null
    }

    if (this._captureNode) {
      try {
        this._captureNode.disconnect()
      } catch {}
      this._captureNode = null
    }

    if (this._captureGain) {
      try {
        this._captureGain.disconnect()
      } catch {}
      this._captureGain = null
    }

    if (this._micStream) {
      for (const t of this._micStream.getTracks()) {
        try {
          t.stop()
        } catch {}
      }
      this._micStream = null
    }
  }

  async switchDevice(options: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean; deviceId?: string }): Promise<void> {
    if (!this._micEnabled) return
    this.disableMic()
    await this.enableMic(options)
  }
}
