import { RotateCw, RotateCcw } from 'lucide-react';
import type { Color } from '@uno-online/shared';
import Card from './Card';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import { cn } from '@/shared/lib/utils';

const COLOR_HEX: Record<Color, string> = {
  red: 'var(--color-uno-red)',
  blue: 'var(--color-uno-blue)',
  green: 'var(--color-uno-green)',
  yellow: 'var(--color-uno-yellow)',
};

interface MobileGameCenterProps {
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
  const mustDrawUntilPlayable = Boolean(settings?.houseRules?.drawUntilPlayable || settings?.houseRules?.deathDraw);
  const canStartDrawUntilPlayable = !mustDrawUntilPlayable || playableIds.size === 0;
  const canContinueDrawUntilPlayable = !isPenaltyDrawing && mustDrawUntilPlayable && hasDrawnThisTurn && playableIds.size === 0;
  const hasCardsAvailable = deckCount > 0 || discardPileLength > 1;

  return isMyTurn && phase === 'playing' && hasCardsAvailable
    && (isPenaltyDrawing || (!hasDrawnThisTurn && canStartDrawUntilPlayable) || canContinueDrawUntilPlayable);
}

function DeckBack({ count, label, canDraw, onDraw }: {
  count: number; label: string; canDraw: boolean; onDraw: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={canDraw ? onDraw : undefined}
        disabled={!canDraw}
        className={cn(
          'rounded-lg border flex items-center justify-center transition-all',
          canDraw
            ? 'border-primary/60 shadow-draw-ready animate-draw-pulse active:scale-95'
            : 'border-white/15',
          count === 0 && !canDraw && 'opacity-25',
          !canDraw && count > 0 && 'opacity-50',
        )}
        style={{
          width: 44, height: 62,
          background: 'linear-gradient(135deg, var(--color-card-back-from), var(--color-card-back-to))',
          cursor: canDraw ? 'pointer' : 'default',
        }}
      >
        <span className="text-xs font-bold text-white/70 font-game">{count}</span>
      </button>
      <span className={cn(
        'text-[9px]',
        count <= 10 && count > 0 ? 'text-destructive font-bold' : 'text-muted-foreground/50',
      )}>
        {label}
      </span>
    </div>
  );
}

export default function MobileGameCenter({ onDraw }: MobileGameCenterProps) {
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
    <div className="flex items-center justify-center gap-6 flex-1 min-h-0">
      <DeckBack count={deckLeftCount} label="左牌堆" canDraw={canDrawLeft} onDraw={() => onDraw('left')} />

      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          {topCard ? (
            <div style={{ width: 64, height: 92 }}>
              <Card card={topCard} mini style={{ width: 64, height: 92 }} />
            </div>
          ) : (
            <div className="rounded-xl bg-white/5 border border-dashed border-white/20" style={{ width: 64, height: 92 }} />
          )}
          {drawStack > 0 && (
            <span className="absolute -top-2 -right-2 bg-destructive text-white text-[10px] font-bold rounded-full min-w-5 h-5 flex items-center justify-center px-1 shadow-lg">
              +{drawStack}
            </span>
          )}
          {currentColor && (
            <span
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-black/40 shadow"
              style={{ background: COLOR_HEX[currentColor] }}
            />
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <DirIcon size={12} className="opacity-60" />
          <span className={isMyTurn ? 'text-primary font-bold font-game' : 'font-game'}>
            {isMyTurn ? '你的回合' : currentPlayer?.name ?? ''}
          </span>
        </div>
      </div>

      <DeckBack count={deckRightCount} label="右牌堆" canDraw={canDrawRight} onDraw={() => onDraw('right')} />
    </div>
  );
}
