import { memo } from 'react';
import { motion } from 'framer-motion';
import { useCountdown } from '../hooks/useCountdown';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants/avatars';
import GoogleRing from '@/shared/components/ui/GoogleRing';
import { cn } from '@/shared/lib/utils';
import { AiBadge } from '@/shared/components/ui/AiBadge';
import { BotThinkingIndicator } from './BotThinkingIndicator';

interface TurnIndicatorProps {
  playerName: string;
  avatarUrl?: string | null;
  playerIndex: number;
  isMe: boolean;
  turnEndTime: number | null;
  phase: string | null;
  cy: number;
  isBot?: boolean;
}

function TurnIndicator({ playerName, avatarUrl, playerIndex, isMe, turnEndTime, phase, cy, isBot }: TurnIndicatorProps) {
  const secondsLeft = useCountdown(turnEndTime);

  let label: string;
  if (phase === 'challenging') {
    label = isMe ? '选择质疑或接受' : `${playerName} 正在考虑质疑`;
  } else if (phase === 'choosing_color') {
    label = isMe ? '选择颜色' : `${playerName} 正在选色`;
  } else if (phase === 'choosing_swap_target') {
    label = isMe ? '选择交换对象' : `${playerName} 正在选择交换`;
  } else {
    label = isMe ? '你的回合' : playerName;
  }

  const urgent = secondsLeft !== null && secondsLeft <= 5;

  return (
    <motion.div
      key={playerName}
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1 whitespace-nowrap"
      style={{ top: cy + 110 }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-2">
        <div
          className="relative w-7 h-7 rounded-full flex items-center justify-center text-xs overflow-hidden"
          style={{ background: AVATAR_COLORS[playerIndex % AVATAR_COLORS.length] }}
        >
          <span>{AVATAR_EMOJIS[playerIndex % AVATAR_EMOJIS.length]}</span>
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt={playerName}
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <GoogleRing size={0} className="w-full h-full" />
        </div>
        <span className={cn(
          'font-game text-lg',
          isMe ? 'text-primary font-bold' : 'text-foreground',
        )}>
          {label}
          {isBot && <AiBadge className="ml-1.5" />}
          {isBot && <BotThinkingIndicator />}
        </span>
      </div>
      {secondsLeft !== null && (
        <span className={cn(
          'font-game text-base tabular-nums',
          urgent ? 'text-destructive font-bold animate-timer-flash' : 'text-muted-foreground',
        )}>
          {secondsLeft}s
        </span>
      )}
    </motion.div>
  );
}

export default memo(TurnIndicator);
