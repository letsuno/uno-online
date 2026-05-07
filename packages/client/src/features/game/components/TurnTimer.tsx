import { useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useCountdown } from '../hooks/useCountdown';
import { playSound } from '@/shared/sound/sound-manager';
import { cn } from '@/shared/lib/utils';

export default function TurnTimer() {
  const turnEndTime = useGameStore((s) => s.turnEndTime);
  const secondsLeft = useCountdown(turnEndTime);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0 && lastTickRef.current !== secondsLeft) {
      playSound('timer_tick');
    }
    lastTickRef.current = secondsLeft;
  }, [secondsLeft]);

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
