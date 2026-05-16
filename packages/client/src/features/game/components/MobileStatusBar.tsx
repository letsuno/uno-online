import { Menu } from 'lucide-react';
import type { Card, Color } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import TurnTimer from './TurnTimer';

const COLOR_HEX: Record<Color, string> = {
  red: 'var(--color-uno-red)',
  blue: 'var(--color-uno-blue)',
  green: 'var(--color-uno-green)',
  yellow: 'var(--color-uno-yellow)',
};

const COLOR_LABEL: Record<Color, string> = {
  red: '红', blue: '蓝', green: '绿', yellow: '黄',
};

const PHASE_LABEL: Record<string, string> = {
  choosing_color: '选色中…',
  challenging: '质疑中…',
  choosing_swap_target: '选交换…',
};

function getCardLabel(card: Card): string {
  switch (card.type) {
    case 'number': return `${card.value}`;
    case 'skip': return '禁';
    case 'reverse': return '转';
    case 'draw_two': return '+2';
    case 'wild': return '变色';
    case 'wild_draw_four': return '+4';
  }
}

interface MobileStatusBarProps {
  onOpenMenu: () => void;
}

export default function MobileStatusBar({ onOpenMenu }: MobileStatusBarProps) {
  const topCard = useGameStore((s) => s.discardPile?.[s.discardPile.length - 1]);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const phase = useGameStore((s) => s.phase);

  const showCard = topCard && currentColor && phase !== 'round_end' && phase !== 'game_over';

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 text-xs z-topbar">
      <div className="flex items-center gap-2">
        {showCard && (
          <div
            className="flex items-center gap-1 rounded-full px-2 py-0.5 font-game"
            style={{
              background: `color-mix(in srgb, ${COLOR_HEX[currentColor]} 25%, transparent)`,
              color: COLOR_HEX[currentColor],
            }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOR_HEX[currentColor] }} />
            <span>{COLOR_LABEL[currentColor]}</span>
            <span className="opacity-50">·</span>
            <span>{getCardLabel(topCard)}</span>
          </div>
        )}
        {drawStack > 0 && (
          <span className="rounded-full bg-destructive/20 text-destructive px-2 py-0.5 font-game font-bold">
            +{drawStack}
          </span>
        )}
        {phase && PHASE_LABEL[phase] && (
          <span className="rounded-full bg-white/10 text-muted-foreground px-2 py-0.5 font-game">
            {PHASE_LABEL[phase]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <TurnTimer />
        <button
          onClick={onOpenMenu}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 text-muted-foreground active:bg-white/20"
        >
          <Menu size={14} />
        </button>
      </div>
    </div>
  );
}
