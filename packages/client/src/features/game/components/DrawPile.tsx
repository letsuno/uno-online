import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack';
import DrawCardAnimation from './DrawCardAnimation';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { getPlayableCardIds } from '@/shared/utils/playable-cards';
import { cn } from '@/shared/lib/utils';

interface DrawPileProps {
  onDraw: () => void;
  drawTargetX?: number;
  drawTargetY?: number;
  drawAnimTrigger?: number;
}

export default function DrawPile({ onDraw, drawTargetX, drawTargetY, drawAnimTrigger = 0 }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);
  const userId = useEffectiveUserId();

  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const canDraw = isMyTurn && !hasDrawnThisTurn && phase === 'playing';

  const me = players.find((p) => p.id === userId);
  const topCard = discardPile[discardPile.length - 1];

  const playableIds = useMemo(() => {
    if (!isMyTurn || phase !== 'playing') return new Set<string>();
    return getPlayableCardIds({
      hand: me?.hand ?? [],
      topCard,
      currentColor,
      drawStack,
      houseRules: settings?.houseRules,
    });
  }, [currentColor, drawStack, isMyTurn, me?.hand, phase, settings?.houseRules, topCard]);

  const showNoPlayableHint = canDraw && playableIds.size === 0 && !settings?.houseRules?.noHints;
  const emphasizeDraw = canDraw && !settings?.houseRules?.noHints;

  return (
    <div className="flex flex-col items-center gap-1.5 z-card relative min-w-draw-pile-min">
      <DrawCardAnimation trigger={drawAnimTrigger} targetX={drawTargetX} targetY={drawTargetY} />
      <AnimatePresence>
        {showNoPlayableHint && (
          <motion.div
            className="absolute bottom-hint-bottom left-1/2 -translate-x-1/2 whitespace-nowrap font-game text-caption text-primary text-shadow-glow"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            无牌可出，摸牌
          </motion.div>
        )}
      </AnimatePresence>
      <CardBack
        onClick={canDraw ? onDraw : undefined}
        className={cn(
          emphasizeDraw && [
            'border-primary',
            'shadow-draw-ready',
            'animate-draw-pulse',
            'hover:-translate-y-2 hover:scale-draw-hover',
          ],
        )}
        style={{
          cursor: canDraw ? 'pointer' : 'default',
          opacity: canDraw ? 1 : 0.5,
        }}
      />
      <span
        className={cn(
          'text-xs text-muted-foreground',
          deckCount <= 10 && 'text-destructive font-bold',
        )}
      >
        牌堆 ({deckCount})
      </span>
    </div>
  );
}
