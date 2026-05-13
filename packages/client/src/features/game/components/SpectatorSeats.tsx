import { memo } from 'react';
import { Eye } from 'lucide-react';
import { useSpectatorStore } from '../stores/spectator-store';
import { cn } from '@/shared/lib/utils';

interface SpectatorSeatsProps {
  top?: number;
}

function SpectatorSeats({ top }: SpectatorSeatsProps) {
  const spectators = useSpectatorStore((s) => s.spectators);
  const pendingJoinQueue = useSpectatorStore((s) => s.pendingJoinQueue);

  if (spectators.length === 0) return null;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card/60 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/5"
      style={top != null ? { top } : { bottom: 8 }}
    >
      <Eye size={12} className="text-muted-foreground shrink-0" />
      <div className="flex items-center gap-1">
        {spectators.map((name) => {
          const queued = pendingJoinQueue.includes(name);
          return (
            <div
              key={name}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 shrink-0',
                queued
                  ? 'bg-accent/20 border-accent/40 text-accent'
                  : 'bg-white/10 border-white/10 text-muted-foreground',
              )}
              title={name + (queued ? ' (下局加入)' : '')}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(SpectatorSeats);
