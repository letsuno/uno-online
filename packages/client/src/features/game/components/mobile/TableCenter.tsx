import { RotateCw, RotateCcw } from 'lucide-react';
import type { Color } from '@uno-online/shared';
import Card from '../Card';
import { useGameStore } from '../../stores/game-store';
import { useEffectiveUserId } from '../../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../../hooks/usePlayableCardIds';
import FitScaler from '@/shared/components/FitScaler';
import { cn } from '@/shared/lib/utils';

const COLOR_HEX: Record<Color, string> = {
  red: 'var(--color-uno-red)',
  blue: 'var(--color-uno-blue)',
  green: 'var(--color-uno-green)',
  yellow: 'var(--color-uno-yellow)',
};

interface TableCenterProps {
  onDraw: (side: 'left' | 'right') => void;
}

function useCanDraw(side: 'left' | 'right') {
  const deckCount = useGameStore((s) => side === 'left' ? s.deckLeftCount : s.deckRightCount);
  const discardPileLength = useGameStore((s) => s.discardPile.length);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const pendingPenaltyDraws = useGameStore((s) => s.pendingPenaltyDraws);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);
  const isMyTurn = useIsMyTurn();
  const playableIds = usePlayableCardIds();

  const remainingPenaltyDraws = pendingPenaltyDraws > 0 ? pendingPenaltyDraws : drawStack;
  const isPenaltyDrawing = remainingPenaltyDraws > 0;
  const mustDrawUntilPlayable = Boolean(settings?.houseRules?.drawUntilPlayable);
  const canStartDrawUntilPlayable = !mustDrawUntilPlayable || playableIds.size === 0;
  const canContinueDrawUntilPlayable = !isPenaltyDrawing && mustDrawUntilPlayable && hasDrawnThisTurn && playableIds.size === 0;
  const hasCardsAvailable = deckCount > 0 || discardPileLength > 1;

  return isMyTurn && phase === 'playing' && hasCardsAvailable
    && (isPenaltyDrawing || (!hasDrawnThisTurn && canStartDrawUntilPlayable) || canContinueDrawUntilPlayable);
}

function DeckBack({ count, side, canDraw, onDraw }: {
  count: number; side: 'left' | 'right'; canDraw: boolean; onDraw: () => void;
}) {
  return (
    <button
      data-draw-pile={side}
      onClick={canDraw ? onDraw : undefined}
      disabled={!canDraw}
      className={cn(
        'relative flex flex-col items-center justify-center gap-1 rounded-card border-2 transition-all bg-transparent',
        canDraw
          ? 'border-primary/60 shadow-draw-ready animate-draw-pulse active:scale-95 cursor-pointer'
          : 'border-white/15',
        count === 0 && !canDraw && 'opacity-25',
        !canDraw && count > 0 && 'opacity-50',
      )}
      style={{
        width: 64, height: 92,
        background: 'linear-gradient(135deg, var(--color-card-back-from), var(--color-card-back-to))',
      }}
    >
      <span className="text-lg font-bold text-white/70 font-game tabular-nums">{count}</span>
      <span className="text-[10px] text-white/40 font-game">{side === 'left' ? '摸牌' : '摸牌'}</span>
    </button>
  );
}

/**
 * 移动端中央牌区：摸牌堆 + 弃牌堆 + 方向/回合提示。
 * 内容固定逻辑尺寸（340×230），外层 FitScaler 按高度缩放——短横屏也不会溢出。
 */
export default function TableCenter({ onDraw }: TableCenterProps) {
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const direction = useGameStore((s) => s.direction);
  const phase = useGameStore((s) => s.phase);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const userId = useEffectiveUserId();

  const canDrawLeft = useCanDraw('left');
  const canDrawRight = useCanDraw('right');
  const deckLeftCount = useGameStore((s) => s.deckLeftCount);
  const deckRightCount = useGameStore((s) => s.deckRightCount);

  const topCard = discardPile[discardPile.length - 1];
  const currentPlayer = players[currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === userId;

  if (phase === 'round_end' || phase === 'game_over') return null;

  const DirIcon = direction === 'clockwise' ? RotateCw : RotateCcw;

  return (
    <FitScaler mode="height" align="center" maxScale={1} className="flex-1 min-h-0 pointer-events-none">
      <div className="flex flex-col items-center gap-4 w-[340px] pointer-events-auto">
        <div className="flex items-center justify-center gap-7">
          <DeckBack count={deckLeftCount} side="left" canDraw={canDrawLeft} onDraw={() => onDraw('left')} />

          <div className="relative">
            {topCard ? (
              <div style={{ width: 88, height: 126 }}>
                <Card card={topCard} mini style={{ width: 88, height: 126 }} />
              </div>
            ) : (
              <div className="rounded-card bg-white/5 border border-dashed border-white/20" style={{ width: 88, height: 126 }} />
            )}
            {drawStack > 0 && (
              <span className="absolute -top-2.5 -right-2.5 bg-destructive text-white text-xs font-bold rounded-full min-w-6 h-6 flex items-center justify-center px-1.5 shadow-lg">
                +{drawStack}
              </span>
            )}
            {currentColor && (
              <span
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-black/40 shadow"
                style={{ background: COLOR_HEX[currentColor] }}
              />
            )}
          </div>

          <DeckBack count={deckRightCount} side="right" canDraw={canDrawRight} onDraw={() => onDraw('right')} />
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <DirIcon size={14} className="opacity-60" />
          <span className={cn('font-game text-base', isMyTurn ? 'text-primary font-bold' : '')}>
            {isMyTurn ? '你的回合' : `${currentPlayer?.name ?? ''} 的回合`}
          </span>
        </div>
      </div>
    </FitScaler>
  );
}
