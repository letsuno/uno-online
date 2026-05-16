import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { serverNow } from '@/shared/server-time';

export default function OwnerTransferBanner() {
  const transferAt = useGameStore((s) => s.ownerTransferAt);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (transferAt === null) {
      setSeconds(null);
      return;
    }
    const calc = () => Math.max(0, Math.ceil((transferAt - serverNow()) / 1000));
    setSeconds(calc());
    const interval = setInterval(() => {
      const remaining = calc();
      setSeconds(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [transferAt]);

  if (seconds === null) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-modal animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2 rounded-xl bg-card/95 backdrop-blur-sm border border-primary/30 shadow-xl px-4 py-2.5">
        <Crown size={16} className="text-primary shrink-0" />
        <span className="text-sm text-foreground">
          房主已离线，<span className="font-bold text-primary tabular-nums">{seconds}s</span> 后转移房主
        </span>
      </div>
    </div>
  );
}
