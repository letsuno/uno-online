import { useGameStore } from '../stores/game-store';
import { useCooldown } from '../hooks/useCooldown';
import { Button } from '@/shared/components/ui/Button';

interface SpectatorActionsProps {
  onCatchUno: (targetId: string) => void;
}

export default function SpectatorActions({ onCatchUno }: SpectatorActionsProps) {
  const players = useGameStore((s) => s.players);
  const { cooldown, withCooldown } = useCooldown();

  const catchTargets = players.filter((p) => p.handCount === 1 && !p.calledUno && !p.unoCaught);

  if (catchTargets.length === 0) return null;

  return (
    <div className="relative z-actions flex justify-center gap-2.5 py-2 pointer-events-auto">
      {catchTargets.map((t) => (
        <Button key={t.id} variant="danger" onClick={withCooldown(() => onCatchUno(t.id))} disabled={cooldown} sound="danger">抓 {t.name}!</Button>
      ))}
    </div>
  );
}
