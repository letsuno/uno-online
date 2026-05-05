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
  const isCritical = secondsLeft <= 5;
  return (
    <>
      <span style={{
        color: isWarning ? 'var(--color-red)' : 'var(--text-secondary)',
        fontWeight: isWarning ? 'bold' : 'normal',
        animation: isWarning ? 'timerFlash 0.5s ease-in-out infinite alternate' : 'none',
      }}>
        <Timer size={14} style={{ verticalAlign: 'middle' }} /> {secondsLeft}s
      </span>
      {isCritical && secondsLeft > 0 && (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 95,
        }}>
          <span style={{
            fontSize: 72, fontWeight: 900, fontFamily: 'var(--font-game)',
            color: 'var(--color-red)', textShadow: '3px 4px 0 rgba(0,0,0,0.3)',
            animation: 'timerFlash 0.5s ease-in-out infinite alternate',
            opacity: 0.8,
          }}>
            {secondsLeft}
          </span>
        </div>
      )}
    </>
  );
}
