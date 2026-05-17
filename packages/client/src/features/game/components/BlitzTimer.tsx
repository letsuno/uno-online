import { Zap } from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';
import { useGameStore } from '../stores/game-store';
import { cn } from '@/shared/lib/utils';

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function BlitzTimer() {
  const phase = useGameStore((s) => s.phase);
  const gameStartedAt = useGameStore((s) => s.gameStartedAt);
  const blitzLimit = useGameStore((s) => s.settings?.houseRules?.blitzTimeLimit ?? null);
  const endTime = gameStartedAt && blitzLimit && phase !== 'round_end' && phase !== 'game_over'
    ? gameStartedAt + blitzLimit * 1000
    : null;
  const secondsLeft = useCountdown(endTime);

  if (secondsLeft === null) return null;

  const urgent = secondsLeft <= 30;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold font-game',
        urgent
          ? 'border-destructive/50 bg-destructive/15 text-destructive animate-timer-flash'
          : 'border-primary/30 bg-primary/10 text-primary',
      )}
      title="Blitz countdown"
    >
      <Zap size={12} />
      <span>{formatSeconds(secondsLeft)}</span>
    </div>
  );
}
