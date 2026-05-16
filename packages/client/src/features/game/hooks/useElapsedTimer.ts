import { useState, useEffect } from 'react';
import { serverNow } from '@/shared/server-time';

export function useElapsedTimer(startTime: number | null): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (startTime === null) {
      setElapsed(null);
      return;
    }
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((serverNow() - startTime) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return elapsed;
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
