import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestAckWithRetry } from '../src/shared/socket-ack';

afterEach(() => {
  vi.useRealTimers();
});

describe('requestAckWithRetry', () => {
  it('retries an idempotent request once and accepts the retry acknowledgement', async () => {
    vi.useFakeTimers();
    const callbacks: Array<(response: string) => void> = [];
    const request = requestAckWithRetry<string>(acknowledge => callbacks.push(acknowledge), {
      timeoutMs: 1_000,
      maxAttempts: 2,
    });

    expect(callbacks).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(callbacks).toHaveLength(2);

    callbacks[1]!('ok');
    await expect(request).resolves.toBe('ok');
  });

  it('stops after the configured attempt bound', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const request = requestAckWithRetry<string>(send, { timeoutMs: 1_000, maxAttempts: 2 });
    const rejection = expect(request).rejects.toThrow('timed out after 2 attempts');

    await vi.advanceTimersByTimeAsync(2_000);
    await rejection;
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('cancels pending retries when its generation is disposed', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const send = vi.fn();
    const request = requestAckWithRetry<string>(send, {
      timeoutMs: 1_000,
      maxAttempts: 2,
      signal: controller.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await rejection;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(send).toHaveBeenCalledOnce();
  });
});
