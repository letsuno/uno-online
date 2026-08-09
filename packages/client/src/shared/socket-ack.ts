interface AckRetryOptions {
  timeoutMs: number;
  maxAttempts: number;
  signal?: AbortSignal;
}

export const ROOM_REJOIN_ACK_POLICY = {
  timeoutMs: 5_000,
  maxAttempts: 2,
} as const;

function abortError(): Error {
  const error = new Error('Socket acknowledgement request cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Re-sends an idempotent Socket.IO request when its acknowledgement is lost.
 * The caller owns both the request semantics and cancellation generation.
 */
export function requestAckWithRetry<T>(
  send: (acknowledge: (response: T) => void) => void,
  { timeoutMs, maxAttempts, signal }: AckRetryOptions,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      signal?.removeEventListener('abort', onAbort);
    };
    const finishResolve = (response: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => finishReject(abortError());

    const dispatch = () => {
      if (settled) return;
      if (signal?.aborted) {
        onAbort();
        return;
      }

      attempts += 1;
      try {
        send(finishResolve);
      } catch (error) {
        finishReject(error);
        return;
      }
      if (settled) return;

      timer = setTimeout(() => {
        timer = null;
        if (attempts < maxAttempts) {
          dispatch();
          return;
        }
        finishReject(new Error(`Socket acknowledgement timed out after ${attempts} attempts`));
      }, timeoutMs);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    dispatch();
  });
}
