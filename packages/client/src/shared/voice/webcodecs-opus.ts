type AnyEncoder = any
type AnyDecoder = any
type AnyAudioData = any
type AnyEncodedAudioChunk = any

function getGlobal(): any {
  return globalThis as any
}

export function canUseWebCodecsOpus(): boolean {
  const g = getGlobal()
  return typeof g.AudioEncoder === 'function' && typeof g.AudioDecoder === 'function' && typeof g.AudioData === 'function' && typeof g.EncodedAudioChunk === 'function'
}

export type WebCodecsOpusEncoder = {
  encode: (pcm: Float32Array) => void
  flush: () => Promise<void>
  close: () => void
}

export function createWebCodecsOpusEncoder(params: {
  sampleRate: number
  channels: number
  bitrate?: number
  onOpus: (opus: Uint8Array) => void
  onError?: (err: unknown) => void
}): WebCodecsOpusEncoder {
  const g = getGlobal()
  if (!canUseWebCodecsOpus()) {
    throw new Error('WebCodecs is not available (AudioEncoder/AudioData missing)')
  }

  const encoder = new g.AudioEncoder({
    output: (chunk: any) => {
      try {
        const out = new Uint8Array(chunk.byteLength)
        chunk.copyTo(out)
        params.onOpus(out)
      } catch (err) {
        params.onError?.(err)
      }
    },
    error: (err: unknown) => params.onError?.(err)
  }) as AnyEncoder

  const config: any = {
    codec: 'opus',
    sampleRate: params.sampleRate,
    numberOfChannels: params.channels
  }
  if (params.bitrate != null) config.bitrate = params.bitrate

  encoder.configure(config)

  let timestampUs = 0

  return {
    encode: (pcm: Float32Array) => {
      const frames = Math.floor(pcm.length / params.channels)
      if (frames <= 0) return

      const audioData = new g.AudioData({
        format: 'f32',
        sampleRate: params.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: params.channels,
        timestamp: timestampUs,
        data: pcm
      }) as AnyAudioData

      timestampUs += Math.round((frames / params.sampleRate) * 1_000_000)
      encoder.encode(audioData)
      audioData.close()
    },
    flush: async () => {
      await encoder.flush()
    },
    close: () => {
      try {
        encoder.close()
      } catch {}
    }
  }
}

export type WebCodecsOpusDecoder = {
  decode: (opus: Uint8Array) => boolean
  close: () => void
}

export function createWebCodecsOpusDecoder(params: {
  sampleRate: number
  channels: number
  onPcm: (pcm: Float32Array) => void
  onError?: (err: unknown) => void
}): WebCodecsOpusDecoder {
  const g = getGlobal()
  if (!canUseWebCodecsOpus()) {
    throw new Error('WebCodecs is not available (AudioDecoder/EncodedAudioChunk missing)')
  }

  let closed = false

  const decoder = new g.AudioDecoder({
    output: (audioData: any) => {
      try {
        const frames = Number(audioData.numberOfFrames) || 0
        const channels = Number(audioData.numberOfChannels) || params.channels
        const pcm = new Float32Array(frames * channels)
        audioData.copyTo(pcm, { planeIndex: 0, format: 'f32' })
        params.onPcm(pcm)
      } catch (err) {
        params.onError?.(err)
      } finally {
        try {
          audioData.close()
        } catch {}
      }
    },
    error: (err: unknown) => {
      closed = true
      params.onError?.(err)
    }
  }) as AnyDecoder

  decoder.configure({
    codec: 'opus',
    sampleRate: params.sampleRate,
    numberOfChannels: params.channels
  })

  let timestampUs = 0

  return {
    decode: (opus: Uint8Array) => {
      if (closed || decoder.state === 'closed') return false

      const chunk = new g.EncodedAudioChunk({
        type: 'key',
        timestamp: timestampUs,
        data: opus
      }) as AnyEncodedAudioChunk

      timestampUs += 20_000
      try {
        decoder.decode(chunk)
        return true
      } catch (err) {
        closed = true
        params.onError?.(err)
        return false
      }
    },
    close: () => {
      if (closed) return
      closed = true
      try {
        decoder.close()
      } catch {}
    }
  }
}

