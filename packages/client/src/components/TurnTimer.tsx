import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { playSound } from '../sound/sound-manager';
import { cn } from '@/lib/utils';

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
      <span className={cn(
        isWarning
          ? 'text-destructive font-bold animate-timer-flash'
          : 'text-muted-foreground font-normal'
      )}>
        <Timer size={14} className="inline align-middle" /> {secondsLeft}s
      </span>
      {isCritical && secondsLeft > 0 && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-timer-overlay">
          <span className="text-timer-critical font-black font-game text-destructive animate-timer-flash opacity-80 text-shadow-bold">
            {secondsLeft}
          </span>
        </div>
      )}
    </>
  );
}
