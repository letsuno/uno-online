import { describe, it, expect, afterAll } from 'vitest';
import { getOrCreateWorker, closeWorkers, getMediaCodecs } from '../../src/voice/media-worker';

afterAll(async () => {
  await closeWorkers();
});

describe('media-worker', () => {
  it('creates a mediasoup worker', async () => {
    const worker = await getOrCreateWorker();
    expect(worker).toBeDefined();
    expect(worker.pid).toBeGreaterThan(0);
  });

  it('returns the same worker on subsequent calls', async () => {
    const w1 = await getOrCreateWorker();
    const w2 = await getOrCreateWorker();
    expect(w1.pid).toBe(w2.pid);
  });

  it('provides audio media codecs', () => {
    const codecs = getMediaCodecs();
    expect(codecs.length).toBeGreaterThan(0);
    expect(codecs[0]!.mimeType.toLowerCase()).toContain('opus');
  });
});
