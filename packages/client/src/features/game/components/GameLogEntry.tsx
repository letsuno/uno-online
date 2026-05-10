import type { GameLogEntry as LogEntry } from '../stores/game-log-store';
import Card from './Card';
import { cn } from '@/shared/lib/utils';

const PLAYER_NAME_COLORS = [
  'text-avatar-1',
  'text-avatar-2',
  'text-avatar-3',
  'text-avatar-4',
  'text-avatar-5',
  'text-avatar-6',
  'text-avatar-7',
  'text-avatar-8',
  'text-avatar-9',
];

function getPlayerColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return PLAYER_NAME_COLORS[Math.abs(hash) % PLAYER_NAME_COLORS.length]!;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getActionDescription(entry: LogEntry): string {
  if (entry.type.startsWith('play_')) return '打出';
  switch (entry.type) {
    case 'draw': return '摸牌';
    case 'call_uno': return '喊出';
    case 'catch_uno': return '抓到';
    case 'challenge': return '质疑';
    default: return '';
  }
}

interface GameLogEntryProps {
  entry: LogEntry;
}

export default function GameLogEntry({ entry }: GameLogEntryProps) {
  const isCatchUno = entry.type === 'catch_uno';
  const isCallUno = entry.type === 'call_uno';

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 py-1 px-1',
        isCallUno && 'bg-accent/10 border border-accent/20 rounded-lg',
        isCatchUno && 'bg-destructive/10 border border-destructive/20 rounded-lg',
      )}
    >
      <span className="text-2xs text-muted-foreground min-w-8 shrink-0">
        {formatTime(entry.timestamp)}
      </span>

      <span className={cn('text-2xs font-bold shrink-0', getPlayerColor(entry.playerName))}>
        {entry.playerName}
      </span>

      <span className="text-2xs text-muted-foreground shrink-0">
        {getActionDescription(entry)}
        {entry.type === 'draw' && (entry.count ?? 1) > 1 ? `x${entry.count}` : ''}
      </span>

      {entry.card && (
        <Card
          card={entry.card}
          mini
          className="!w-card-log-w !h-card-log-h !text-2xs !border !rounded-none shrink-0"
        />
      )}

      {entry.targetName && (
        <>
          <span className="text-2xs text-muted-foreground shrink-0">→</span>
          <span className={cn('text-2xs font-bold shrink-0', getPlayerColor(entry.targetName))}>
            {entry.targetName}
          </span>
        </>
      )}

      {entry.extra && (
        <span className="text-2xs text-muted-foreground">
          {entry.extra}
        </span>
      )}
    </div>
  );
}
