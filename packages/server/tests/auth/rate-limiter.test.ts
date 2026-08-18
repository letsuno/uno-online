import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../../src/auth/rate-limiter';

function makeFakeRequest(ip: string) {
  return { ip } as any;
}

function makeFakeReply() {
  let status = 200;
  let body: any;
  const reply: any = {
    code(c: number) {
      status = c;
      return reply;
    },
    header(_k: string, _v: string) {
      return reply;
    },
    send(b: any) {
      body = b;
      return reply;
    },
    get statusCode() {
      return status;
    },
    get sentBody() {
      return body;
    },
  };
  return reply;
}

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', async () => {
    const handler = createRateLimiter({ windowMs: 60_000, max: 3 });
    const reply = makeFakeReply();
    for (let i = 0; i < 3; i++) {
      await handler(makeFakeRequest('1.2.3.4'), reply);
    }
    expect(reply.statusCode).toBe(200);
  });

  it('rejects requests over the limit with 429', async () => {
    const handler = createRateLimiter({ windowMs: 60_000, max: 2 });
    const reply = makeFakeReply();
    await handler(makeFakeRequest('1.2.3.4'), reply);
    await handler(makeFakeRequest('1.2.3.4'), reply);
    await handler(makeFakeRequest('1.2.3.4'), reply);
    expect(reply.statusCode).toBe(429);
    expect(reply.sentBody).toEqual({ error: '请求过于频繁，请稍后再试' });
  });

  it('tracks IPs independently', async () => {
    const handler = createRateLimiter({ windowMs: 60_000, max: 1 });
    const replyA = makeFakeReply();
    const replyB = makeFakeReply();
    await handler(makeFakeRequest('1.1.1.1'), replyA);
    await handler(makeFakeRequest('2.2.2.2'), replyB);
    expect(replyA.statusCode).toBe(200);
    expect(replyB.statusCode).toBe(200);
  });

  it('resets after the window expires', async () => {
    const handler = createRateLimiter({ windowMs: 60_000, max: 1 });
    const reply1 = makeFakeReply();
    await handler(makeFakeRequest('1.1.1.1'), reply1);
    const reply2 = makeFakeReply();
    await handler(makeFakeRequest('1.1.1.1'), reply2);
    expect(reply2.statusCode).toBe(429);

    vi.advanceTimersByTime(60_001);
    const reply3 = makeFakeReply();
    await handler(makeFakeRequest('1.1.1.1'), reply3);
    expect(reply3.statusCode).toBe(200);
  });
});
