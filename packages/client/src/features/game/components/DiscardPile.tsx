import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isWildCard } from '@uno-online/shared';
import Card from './Card';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';

const VISIBLE_DISCARD_STACK = 8;

function hashCardId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Compute the initial animation offset based on the seat position
 * of the player who played the card.
 * Self (bottom) -> handled by layoutId shared animation.
 * Opponents -> fly from their approximate screen direction.
 */
function getPlayOrigin(
  playerId: string | undefined,
  players: { id: string }[],
  selfId: string | undefined,
): { x: number; y: number } {
  if (!playerId || playerId === selfId) return { x: 0, y: 120 }; // self: from bottom
  const opponents = players.filter((p) => p.id !== selfId);
  const idx = opponents.findIndex((p) => p.id === playerId);
  if (idx < 0) return { x: 0, y: -120 };
  const count = opponents.length;
  const arcStart = -150 * (Math.PI / 180);
  const arcEnd = 150 * (Math.PI / 180);
  const angle = count === 1 ? 0 : arcStart + ((arcEnd - arcStart) / (count - 1)) * idx;
  // Map angle to screen offset (sin = horizontal, -cos = vertical from top)
  return { x: Math.sin(angle) * 200, y: -Math.cos(angle) * 160 };
}

function DiscardPile() {
  const discardPile = useGameStore((s) => s.discardPile);
  const drawStack = useGameStore((s) => s.drawStack);
  const phase = useGameStore((s) => s.phase);
  const currentColor = useGameStore((s) => s.currentColor);
  const lastAction = useGameStore((s) => s.lastAction);
  const players = useGameStore((s) => s.players);
  const selfId = useEffectiveUserId();
  const topCard = discardPile[discardPile.length - 1];
  if (!topCard) return null;
  const visibleStack = discardPile.slice(-VISIBLE_DISCARD_STACK);

  const playedBy = lastAction?.type === 'PLAY_CARD' ? lastAction.playerId : undefined;
  const origin = getPlayOrigin(playedBy, players, selfId);
  const isSelf = playedBy === selfId;

  const wild = isWildCard(topCard);
  const isWaitingForColor = wild && !topCard.chosenColor && phase === 'choosing_color';
  const chosenColor = wild && !isWaitingForColor ? (topCard.chosenColor ?? currentColor ?? null) : null;
  const colorGlowMap: Record<string, string> = {
    red: 'rgba(255, 51, 102, 0.6)',
    blue: 'rgba(68, 136, 255, 0.6)',
    green: 'rgba(51, 204, 102, 0.6)',
    yellow: 'rgba(251, 191, 36, 0.6)',
  };
  const colorBorderMap: Record<string, string> = {
    red: '#ff3366',
    blue: '#4488ff',
    green: '#33cc66',
    yellow: '#fbbf24',
  };
  const colorLabelMap: Record<string, string> = {
    red: '红',
    blue: '蓝',
    green: '绿',
    yellow: '黄',
  };

  return (
    <div className="flex flex-col items-center gap-1.5 z-card relative">
      <div className="relative w-[120px] h-[140px]">
        {visibleStack.slice(0, -1).map((card, stackIndex) => {
          const seed = hashCardId(card.id);
          const rotate = (seed % 360) * 0.1 - 18;
          const x = ((seed >> 4) % 40) - 20;
          const y = ((seed >> 8) % 30) - 15;

          return (
            <div
              key={`${card.id}-stack-${stackIndex}`}
              className="absolute top-1/2 left-1/2 pointer-events-none"
              style={{
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rotate}deg)`,
                zIndex: stackIndex,
                opacity: Math.max(0.4, 0.85 - stackIndex * 0.06),
              }}
            >
              <Card card={card} />
            </div>
          );
        })}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={topCard.id}
            layoutId={isSelf ? topCard.id : undefined}
            initial={{ opacity: 0, x: origin.x, y: origin.y, scale: 0.6 }}
            animate={{ scale: 1, rotate: 3, opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.15 } }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginLeft: '-41px',
              marginTop: '-56px',
              zIndex: visibleStack.length,
              borderRadius: '18px',
              ...(chosenColor ? {
                boxShadow: `0 0 18px 4px ${colorGlowMap[chosenColor] ?? 'transparent'}`,
                outline: `2.5px solid ${colorBorderMap[chosenColor] ?? 'transparent'}`,
                outlineOffset: '1px',
              } : isWaitingForColor ? {
                boxShadow: '0 0 16px 3px rgba(255, 255, 255, 0.22)',
                outline: '2.5px dashed rgba(255, 255, 255, 0.55)',
                outlineOffset: '1px',
              } : {}),
            }}
          >
            <Card card={topCard} />
            {chosenColor && (
              <span
                className="absolute -bottom-1 -right-1 text-xs font-game font-black px-1 py-0.5 rounded bg-black/60 leading-none whitespace-nowrap"
                style={{ color: colorBorderMap[chosenColor] }}
              >
                打{colorLabelMap[chosenColor]}！
              </span>
            )}
            {isWaitingForColor && (
              <motion.span
                className="absolute -bottom-1 -right-1 text-xs font-game font-black px-1 py-0.5 rounded bg-black/65 leading-none whitespace-nowrap text-white"
                initial={{ opacity: 0.6, scale: 0.96 }}
                animate={{ opacity: [0.6, 1, 0.6], scale: [0.96, 1, 0.96] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              >
                待选色
              </motion.span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {drawStack > 0 && (
        <motion.div
          key={`stack-${drawStack}-${chosenColor ?? ''}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-3 -right-3 text-white rounded-full w-8 h-8 flex items-center justify-center font-black text-sm font-game border-2 border-white shadow-card-sm"
          style={{ backgroundColor: chosenColor ? colorBorderMap[chosenColor] : 'var(--color-destructive, #ef4444)' }}
        >
          +{drawStack}
        </motion.div>
      )}
      <span className="text-xs text-muted-foreground">弃牌堆 ({discardPile.length})</span>
    </div>
  );
}

export default memo(DiscardPile);
