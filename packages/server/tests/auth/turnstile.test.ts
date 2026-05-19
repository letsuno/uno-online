import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstile } from '../../src/auth/turnstile';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => { mockFetch.mockReset(); });

describe('verifyTurnstile', () => {
  it('returns true when Cloudflare responds with success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const result = await verifyTurnstile('valid-token', 'secret-key');
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns false when Cloudflare responds with failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });
    const result = await verifyTurnstile('bad-token', 'secret-key');
    expect(result).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const result = await verifyTurnstile('token', 'secret-key');
    expect(result).toBe(false);
  });

  it('sends remoteip when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    await verifyTurnstile('token', 'secret', '1.2.3.4');
    const body = mockFetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });
});
