import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack';
import DrawCardAnimation from './DrawCardAnimation';
import { useGameStore } from '../stores/game-store';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import { cn } from '@/shared/lib/utils';

interface DrawPileProps {
  side: 'left' | 'right';
  isPortrait: boolean;
  onDraw: (side: 'left' | 'right') => void;
  drawTargetX?: number;
  drawTargetY?: number;
  drawAnimTrigger?: number;
  drawUntilCount?: number;
}

function DrawPile({ side, isPortrait, onDraw, drawTargetX, drawTargetY, drawAnimTrigger = 0, drawUntilCount = 0 }: DrawPileProps) {
  const deckCount = useGameStore((s) => side === 'left' ? s.deckLeftCount : s.deckRightCount);
  const discardPileLength = useGameStore((s) => s.discardPile.length);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const pendingPenaltyDraws = useGameStore((s) => s.pendingPenaltyDraws);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);

  const isMyTurn = useIsMyTurn();
  const remainingPenaltyDraws = pendingPenaltyDraws > 0 ? pendingPenaltyDraws : drawStack;
  const isPenaltyDrawing = remainingPenaltyDraws > 0;
  const playableIds = usePlayableCardIds();
  const mustDrawUntilPlayable = Boolean(settings?.houseRules?.drawUntilPlayable || settings?.houseRules?.deathDraw);
  const isDrawUntilTurn = mustDrawUntilPlayable && !isPenaltyDrawing;
  const canStartDrawUntilPlayable = !mustDrawUntilPlayable || playableIds.size === 0;
  const canContinueDrawUntilPlayable = !isPenaltyDrawing && mustDrawUntilPlayable && hasDrawnThisTurn && playableIds.size === 0;
  const hasCardsAvailable = deckCount > 0 || discardPileLength > 1;
  const canDraw = isMyTurn && phase === 'playing' && hasCardsAvailable && (isPenaltyDrawing || (!hasDrawnThisTurn && canStartDrawUntilPlayable) || canContinueDrawUntilPlayable);

  const showNoPlayableHint = canDraw && !isDrawUntilTurn && !isPenaltyDrawing && drawStack === 0 && playableIds.size === 0 && !settings?.houseRules?.noHints;
  const emphasizeDraw = canDraw && !settings?.houseRules?.noHints;

  const label = isPortrait
    ? (side === 'left' ? '上牌堆' : '下牌堆')
    : (side === 'left' ? '左牌堆' : '右牌堆');

  const handleClick = () => onDraw(side);

  return (
    <div className="flex flex-col items-center gap-1.5 z-card relative min-w-draw-pile-min">
      <DrawCardAnimation trigger={drawAnimTrigger} targetX={drawTargetX} targetY={drawTargetY} />
      <CardBack
        onClick={canDraw ? handleClick : undefined}
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
          opacity: deckCount === 0 && !canDraw ? 0.25 : canDraw ? 1 : 0.5,
        }}
      />
      <span
        className={cn(
          'text-xs text-muted-foreground',
          deckCount <= 10 && deckCount > 0 && 'text-destructive font-bold',
        )}
      >
        {label} ({deckCount})
      </span>
      <AnimatePresence>
        {isDrawUntilTurn && drawUntilCount > 0 && side === 'left' && (
          <motion.span
            className="font-game text-caption text-primary text-shadow-glow whitespace-nowrap"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            已摸 {drawUntilCount} 张
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(DrawPile);
