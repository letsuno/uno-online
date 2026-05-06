import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import Card from './Card';
import CountdownRing from './CountdownRing';
import { cn } from '@/lib/utils';

export const AVATAR_COLORS = [
  '#ff3366',
  '#33cc66',
  '#4488ff',
  '#f97316',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#6366f1',
];
export const AVATAR_EMOJIS = [
  '😎',
  '🤠',
  '😺',
  '🐸',
  '🦊',
  '🐱',
  '🐶',
  '🦁',
  '🐼',
];

interface PlayerInfo {
  id: string;
  name: string;
  hand: CardType[];
  handCount: number;
  score: number;
  connected: boolean;
  calledUno: boolean;
  eliminated?: boolean;
  teamId?: number;
}

interface PlayerNodeProps {
  player: PlayerInfo;
  index: number;
  isActive: boolean;
  isMe: boolean;
  position: { x: number; y: number };
  turnEndTime?: number | null;
  turnTimeLimit?: number;
  lastPlayedCard?: CardType | null;
}

export default function PlayerNode({
  player,
  index,
  isActive,
  isMe,
  position,
  turnEndTime,
  turnTimeLimit,
  lastPlayedCard,
}: PlayerNodeProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!isActive || !turnEndTime) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((turnEndTime - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isActive, turnEndTime]);

  const avatarSize = isMe ? 48 : 44;
  const displayName =
    player.name.length > 8 ? player.name.slice(0, 8) + '...' : player.name;

  return (
    <div
      className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        ...(player.eliminated
          ? { opacity: 0.35, filter: 'grayscale(0.8)' }
          : {}),
      }}
    >
      {/* Avatar container */}
      <div className="relative" style={{ width: avatarSize, height: avatarSize }}>
        {/* Countdown ring overlay */}
        {isActive && secondsLeft !== null && turnTimeLimit && (
          <CountdownRing
            totalSeconds={turnTimeLimit}
            remainingSeconds={secondsLeft}
            size={avatarSize}
            strokeWidth={3}
          />
        )}

        {/* Avatar circle */}
        <div
          className={cn(
            'w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center',
            'text-sm md:text-lg',
            'border-2 border-white/30',
            'transition-[border,box-shadow] duration-300 ease-in-out',
            isActive && 'animate-draw-pulse shadow-glow-active',
            isMe && 'border-primary border-3',
          )}
          style={{
            background: AVATAR_COLORS[index % AVATAR_COLORS.length],
            width: avatarSize - 4,
            height: avatarSize - 4,
            margin: 2,
          }}
        >
          {AVATAR_EMOJIS[index % AVATAR_EMOJIS.length]}
        </div>

        {/* Disconnected indicator */}
        {!player.connected && (
          <div className="absolute top-0 right-0 w-3 h-3 rounded-full bg-destructive border-2 border-background" />
        )}

        {/* Last played card mini */}
        <AnimatePresence>
          {lastPlayedCard && (
            <motion.div
              className="absolute -bottom-1 -right-2"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              <Card
                card={lastPlayedCard}
                className="!w-card-mini-w !h-card-mini-h !text-2xs !border !rounded-sm !shadow-none"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Username */}
      <span
        className={cn(
          'text-xs text-foreground transition-colors duration-300 whitespace-nowrap',
          isActive && 'text-primary font-bold',
          isMe && 'text-primary',
        )}
      >
        {displayName}
      </span>

      {/* Hand count */}
      <span className="text-xs text-muted-foreground">
        {player.handCount}张
      </span>
    </div>
  );
}
