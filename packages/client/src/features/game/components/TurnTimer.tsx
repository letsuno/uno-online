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
  return (
    <span className={cn(
      isWarning
        ? 'text-destructive font-bold animate-timer-flash'
        : 'text-muted-foreground font-normal'
    )}>
      <Timer size={14} className="inline align-middle" /> {secondsLeft}s
    </span>
  );
}
