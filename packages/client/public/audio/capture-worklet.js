class MumbleCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    this._enabled = false
    this._mode = 'vad' // 'vad' | 'ptt'
    this._pttActive = false
    this._vadThreshold = 0.02
    this._hangoverFrames = 5
    this._frameSize = 960

    this._frameBuffer = new Float32Array(this._frameSize)
    this._frameWrite = 0

    this._sending = false
    this._hangoverLeft = 0
    this._lastStatsTime = 0
    this._lastSending = false

    this.port.onmessage = (event) => {
      const msg = event.data
      if (!msg || msg.type !== 'config') return
      if (typeof msg.enabled === 'boolean') this._enabled = msg.enabled
      if (msg.mode === 'vad' || msg.mode === 'ptt') this._mode = msg.mode
      if (typeof msg.pttActive === 'boolean') this._pttActive = msg.pttActive
      if (typeof msg.vadThreshold === 'number') this._vadThreshold = msg.vadThreshold
      if (typeof msg.hangoverFrames === 'number') this._hangoverFrames = msg.hangoverFrames
      if (typeof msg.frameSize === 'number' && msg.frameSize > 0 && msg.frameSize <= 2880) {
        this._frameSize = msg.frameSize | 0
        this._frameBuffer = new Float32Array(this._frameSize)
        this._frameWrite = 0
      }
    }
  }

  _emitFrame(frame) {
    const copy = new Float32Array(frame.length)
    copy.set(frame)
    this.port.postMessage({ type: 'pcm', pcm: copy.buffer }, [copy.buffer])
  }

  _emitEnd() {
    this.port.postMessage({ type: 'end' })
  }

  process(inputs, outputs) {
    const output = outputs[0]
    if (output) {
      for (let ch = 0; ch < output.length; ch++) output[ch].fill(0)
    }

    if (!this._enabled) {
      if (this._sending) {
        this._sending = false
        this._hangoverLeft = 0
        this._emitEnd()
      }
      return true
    }

    const input = inputs[0]
    if (!input || input.length === 0) return true

    const channels = input.length
    const frames = input[0].length

    for (let i = 0; i < frames; i++) {
      let s = 0
      for (let ch = 0; ch < channels; ch++) {
        s += input[ch][i] ?? 0
      }
      s /= channels

      this._frameBuffer[this._frameWrite++] = s
      if (this._frameWrite === this._frameSize) {
        let sumSq = 0
        for (let j = 0; j < this._frameSize; j++) {
          const v = this._frameBuffer[j]
          sumSq += v * v
        }
        const rms = Math.sqrt(sumSq / this._frameSize)

        let shouldSend = false
        if (this._mode === 'ptt') {
          shouldSend = this._pttActive
        } else {
          if (rms >= this._vadThreshold) {
            shouldSend = true
            this._hangoverLeft = this._hangoverFrames
          } else if (this._hangoverLeft > 0) {
            shouldSend = true
            this._hangoverLeft -= 1
          } else {
            shouldSend = false
          }
        }

        if (shouldSend) {
          this._sending = true
          this._emitFrame(this._frameBuffer)
        } else if (this._sending) {
          this._sending = false
          this._hangoverLeft = 0
          this._emitEnd()
        }

        if (currentTime - this._lastStatsTime >= 0.2 || this._sending !== this._lastSending) {
          this.port.postMessage({ type: 'stats', rms, sending: this._sending })
          this._lastStatsTime = currentTime
          this._lastSending = this._sending
        }

        this._frameWrite = 0
      }
    }

    return true
  }
}

registerProcessor('mumble-capture', MumbleCaptureProcessor)
