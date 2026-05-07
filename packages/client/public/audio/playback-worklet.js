class MumblePlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._streams = new Map()
    this._lastStatsTime = 0

    this.port.onmessage = (event) => {
      const msg = event.data
      if (!msg || msg.type !== 'pcm') return

      const userId = Number(msg.userId) >>> 0
      const channels = Number(msg.channels) || 1
      if (!(msg.pcm instanceof ArrayBuffer)) return

      const pcm = new Float32Array(msg.pcm)
      let stream = this._streams.get(userId)
      if (!stream) {
        stream = { queue: [], current: null, lastActive: currentTime }
        this._streams.set(userId, stream)
      }

      stream.queue.push({ pcm, channels, offsetFrames: 0 })
      stream.lastActive = currentTime

      // Avoid unbounded memory usage on slow consumers.
      if (stream.queue.length > 200) {
        stream.queue.splice(0, stream.queue.length - 200)
      }
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0]
    if (!output || output.length === 0) return true

    const outChannels = output.length
    const frames = output[0].length

    for (let ch = 0; ch < outChannels; ch++) {
      output[ch].fill(0)
    }

    for (const [userId, stream] of this._streams) {
      if (!stream.current && stream.queue.length > 0) {
        stream.current = stream.queue.shift()
      }

      let item = stream.current
      if (!item) {
        if (currentTime - stream.lastActive > 10) {
          this._streams.delete(userId)
        }
        continue
      }

      let writeIndex = 0
      while (writeIndex < frames) {
        if (!item) break

        const inChannels = item.channels || 1
        const totalFrames = Math.floor(item.pcm.length / inChannels)
        const remainingFrames = totalFrames - item.offsetFrames
        if (remainingFrames <= 0) {
          item = stream.queue.shift() || null
          stream.current = item
          continue
        }

        const toCopy = Math.min(remainingFrames, frames - writeIndex)
        for (let i = 0; i < toCopy; i++) {
          const srcBase = (item.offsetFrames + i) * inChannels
          const left = item.pcm[srcBase] ?? 0
          const right = inChannels >= 2 ? item.pcm[srcBase + 1] ?? left : left

          if (outChannels === 1) {
            output[0][writeIndex + i] += left
          } else {
            output[0][writeIndex + i] += left
            output[1][writeIndex + i] += right
            for (let ch = 2; ch < outChannels; ch++) {
              output[ch][writeIndex + i] += ch % 2 === 0 ? left : right
            }
          }
        }

        item.offsetFrames += toCopy
        writeIndex += toCopy
      }
    }

    for (let ch = 0; ch < outChannels; ch++) {
      const arr = output[ch]
      for (let i = 0; i < frames; i++) {
        const v = arr[i]
        arr[i] = v > 1 ? 1 : v < -1 ? -1 : v
      }
    }

    if (currentTime - this._lastStatsTime >= 0.5) {
      let totalQueuedFrames = 0
      let maxQueuedFrames = 0
      let activeStreams = 0

      for (const stream of this._streams.values()) {
        let queuedFrames = 0

        if (stream.current) {
          const inChannels = stream.current.channels || 1
          const totalFrames = Math.floor(stream.current.pcm.length / inChannels)
          queuedFrames += Math.max(0, totalFrames - stream.current.offsetFrames)
        }

        for (const item of stream.queue) {
          const inChannels = item.channels || 1
          queuedFrames += Math.floor(item.pcm.length / inChannels)
        }

        if (queuedFrames > 0) activeStreams += 1
        totalQueuedFrames += queuedFrames
        if (queuedFrames > maxQueuedFrames) maxQueuedFrames = queuedFrames
      }

      const totalQueuedMs = (totalQueuedFrames / sampleRate) * 1000
      const maxQueuedMs = (maxQueuedFrames / sampleRate) * 1000
      this.port.postMessage({ type: 'stats', totalQueuedMs, maxQueuedMs, streams: activeStreams })
      this._lastStatsTime = currentTime
    }

    return true
  }
}

registerProcessor('mumble-playback', MumblePlaybackProcessor)
