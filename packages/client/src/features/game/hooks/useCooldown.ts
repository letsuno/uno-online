import { useState, useCallback } from 'react';

export function useCooldown(ms = 1000) {
  const [active, setActive] = useState(false);

  const wrap = useCallback((fn: () => void) => () => {
    if (active) return;
    setActive(true);
    fn();
    setTimeout(() => setActive(false), ms);
  }, [active, ms]);

  return { cooldown: active, withCooldown: wrap } as const;
}
