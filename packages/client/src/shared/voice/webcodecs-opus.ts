type AnyEncoder = any;
type AnyDecoder = any;
type AnyAudioData = any;
type AnyEncodedAudioChunk = any;

function getGlobal(): any {
  return globalThis as any;
}

function reportCodecError(handler: ((err: unknown) => void) | undefined, error: unknown): void {
  if (handler) {
    handler(error);
  } else {
    console.error('[voice] WebCodecs operation failed', error);
  }
}

export function canUseWebCodecsOpus(): boolean {
  const g = getGlobal();
  return (
    typeof g.AudioEncoder === 'function' &&
    typeof g.AudioDecoder === 'function' &&
    typeof g.AudioData === 'function' &&
    typeof g.EncodedAudioChunk === 'function'
  );
}

type WebCodecsOpusEncoder = {
  encode: (pcm: Float32Array) => void;
  flush: () => Promise<void>;
  close: () => void;
};

export function createWebCodecsOpusEncoder(params: {
  sampleRate: number;
  channels: number;
  bitrate?: number;
  onOpus: (opus: Uint8Array) => void;
  onError?: (err: unknown) => void;
}): WebCodecsOpusEncoder {
  const g = getGlobal();
  if (!canUseWebCodecsOpus()) {
    throw new Error('WebCodecs is not available (AudioEncoder/AudioData missing)');
  }

  let closed = false;
  const encoder = new g.AudioEncoder({
    output: (chunk: any) => {
      try {
        const out = new Uint8Array(chunk.byteLength);
        chunk.copyTo(out);
        params.onOpus(out);
      } catch (err) {
        reportCodecError(params.onError, err);
      }
    },
    error: (err: unknown) => {
      closed = true;
      reportCodecError(params.onError, err);
    },
  }) as AnyEncoder;

  const config: any = {
    codec: 'opus',
    sampleRate: params.sampleRate,
    numberOfChannels: params.channels,
  };
  if (params.bitrate != null) config.bitrate = params.bitrate;

  try {
    encoder.configure(config);
  } catch (error) {
    closed = true;
    try {
      encoder.close();
    } catch (closeError) {
      console.warn('[voice] Failed to close AudioEncoder after configuration failure', closeError);
    }
    throw error;
  }

  let timestampUs = 0;

  return {
    encode: (pcm: Float32Array) => {
      if (closed || encoder.state === 'closed') {
        throw new Error('Cannot encode with a closed AudioEncoder');
      }
      const frames = Math.floor(pcm.length / params.channels);
      if (frames <= 0) return;

      const audioData = new g.AudioData({
        format: 'f32',
        sampleRate: params.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: params.channels,
        timestamp: timestampUs,
        data: pcm,
      }) as AnyAudioData;

      timestampUs += Math.round((frames / params.sampleRate) * 1_000_000);
      try {
        encoder.encode(audioData);
      } finally {
        try {
          audioData.close();
        } catch (error) {
          console.warn('[voice] Failed to close encoded AudioData', error);
        }
      }
    },
    flush: async () => {
      if (closed || encoder.state === 'closed') {
        throw new Error('Cannot flush a closed AudioEncoder');
      }
      await encoder.flush();
    },
    close: () => {
      if (closed) return;
      closed = true;
      try {
        encoder.close();
      } catch (error) {
        console.warn('[voice] Failed to close AudioEncoder', error);
      }
    },
  };
}

type WebCodecsOpusDecoder = {
  decode: (opus: Uint8Array) => boolean;
  close: () => void;
};

export function createWebCodecsOpusDecoder(params: {
  sampleRate: number;
  channels: number;
  onPcm: (pcm: Float32Array) => void;
  onError?: (err: unknown) => void;
}): WebCodecsOpusDecoder {
  const g = getGlobal();
  if (!canUseWebCodecsOpus()) {
    throw new Error('WebCodecs is not available (AudioDecoder/EncodedAudioChunk missing)');
  }

  let closed = false;
  let decoder: AnyDecoder | null = null;

  const closeDecoder = () => {
    if (closed) return;
    closed = true;
    if (!decoder || decoder.state === 'closed') return;
    try {
      decoder.close();
    } catch (error) {
      console.warn('[voice] Failed to close AudioDecoder', error);
    }
  };

  decoder = new g.AudioDecoder({
    output: (audioData: any) => {
      try {
        const frames = Number(audioData.numberOfFrames);
        const channels = Number(audioData.numberOfChannels);
        if (!Number.isInteger(frames) || frames <= 0 || channels !== params.channels) {
          throw new Error('AudioDecoder returned invalid PCM metadata');
        }
        const pcm = new Float32Array(frames * channels);
        audioData.copyTo(pcm, { planeIndex: 0, format: 'f32' });
        params.onPcm(pcm);
      } catch (err) {
        reportCodecError(params.onError, err);
        closeDecoder();
      } finally {
        try {
          audioData.close();
        } catch (error) {
          console.warn('[voice] Failed to close decoded AudioData', error);
        }
      }
    },
    error: (err: unknown) => {
      reportCodecError(params.onError, err);
      closeDecoder();
    },
  }) as AnyDecoder;

  try {
    decoder.configure({
      codec: 'opus',
      sampleRate: params.sampleRate,
      numberOfChannels: params.channels,
    });
  } catch (error) {
    closeDecoder();
    throw error;
  }

  let timestampUs = 0;

  return {
    decode: (opus: Uint8Array) => {
      if (closed || decoder?.state === 'closed') return false;

      const chunk = new g.EncodedAudioChunk({
        type: 'key',
        timestamp: timestampUs,
        data: opus,
      }) as AnyEncodedAudioChunk;

      timestampUs += 20_000;
      try {
        decoder?.decode(chunk);
        return true;
      } catch (err) {
        reportCodecError(params.onError, err);
        closeDecoder();
        return false;
      }
    },
    close: closeDecoder,
  };
}
