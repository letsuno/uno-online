import { useState, useEffect } from 'react';

/**
 * Tracks the remaining seconds until `turnEndTime`.
 *
 * Returns `null` when `turnEndTime` is nullish, otherwise a non-negative
 * integer that ticks down every second.
 */
export function useCountdown(
  turnEndTime: number | null | undefined,
): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!turnEndTime) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      setSecondsLeft(
        Math.max(0, Math.ceil((turnEndTime - Date.now()) / 1000)),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [turnEndTime]);

  return secondsLeft;
}
