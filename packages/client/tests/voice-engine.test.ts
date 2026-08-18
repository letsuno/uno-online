import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceEngine } from '../src/shared/voice/voice-engine';

class TestAudioNode {
  readonly disconnect = vi.fn();

  connect<T>(target: T): T {
    return target;
  }
}

class TestGainNode extends TestAudioNode {
  readonly gain = { value: 1 };
}

class TestAudioWorkletNode extends TestAudioNode {
  readonly port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };
}

class TestAudioContext {
  static latest: TestAudioContext;

  sampleRate = 48_000;
  state: AudioContextState = 'running';
  readonly destination = new TestAudioNode();
  readonly audioWorklet = { addModule: vi.fn(async () => undefined) };
  readonly resume = vi.fn(async () => undefined);
  readonly close = vi.fn(async () => {
    this.state = 'closed';
  });
  readonly createGain = vi.fn(() => new TestGainNode());
  readonly createMediaStreamSource = vi.fn(() => new TestAudioNode());

  constructor() {
    TestAudioContext.latest = this;
  }
}

function createEngine(): VoiceEngine {
  return new VoiceEngine({
    onMicPcm: vi.fn(),
    onMicEnd: vi.fn(),
  });
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', TestAudioContext);
  vi.stubGlobal('AudioWorkletNode', TestAudioWorkletNode);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((_: Blob) => `blob:voice-${Math.random()}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VoiceEngine resource lifecycle', () => {
  it('closes the AudioContext and revokes worklet URLs when setup fails', async () => {
    const engine = createEngine();
    const enable = engine.enableAudio();
    TestAudioContext.latest.audioWorklet.addModule.mockRejectedValueOnce(new Error('worklet failed'));

    await expect(enable).rejects.toThrow('worklet failed');
    expect(TestAudioContext.latest.close).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(engine.audioReady).toBe(false);
  });

  it('releases playback nodes and the AudioContext on dispose', async () => {
    const engine = createEngine();
    await engine.enableAudio();
    const context = TestAudioContext.latest;

    expect(engine.audioReady).toBe(true);
    engine.dispose();

    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.audioReady).toBe(false);
  });

  it('stops acquired microphone tracks when node setup fails', async () => {
    const engine = createEngine();
    await engine.enableAudio();
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })),
      },
    });
    TestAudioContext.latest.createMediaStreamSource.mockImplementationOnce(() => {
      throw new Error('source failed');
    });

    await expect(engine.enableMic()).rejects.toThrow('source failed');
    expect(stop).toHaveBeenCalledOnce();
    expect(engine.micEnabled).toBe(false);
  });
});
