import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { useGameStore } from '../stores/game-store.js';
import { playSound } from '../sound/sound-manager.js';

export default function TurnTimer() {
  const turnEndTime = useGameStore((s) => s.turnEndTime);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!turnEndTime) { setSecondsLeft(null); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((turnEndTime - Date.now()) / 1000));
      if (remaining <= 5 && remaining > 0 && lastTickRef.current !== remaining) {
        playSound('timer_tick');
      }
      lastTickRef.current = remaining;
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [turnEndTime]);

  if (secondsLeft === null) return null;
  const isWarning = secondsLeft <= 10;
  return (
    <span style={{
      color: isWarning ? 'var(--color-red)' : 'var(--text-secondary)',
      fontWeight: isWarning ? 'bold' : 'normal',
      animation: isWarning ? 'timerFlash 0.5s ease-in-out infinite alternate' : 'none',
    }}>
      <Timer size={14} style={{ verticalAlign: 'middle' }} /> {secondsLeft}s
    </span>
  );
}
