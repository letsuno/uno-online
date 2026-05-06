import type { Card as CardType } from '@uno-online/shared';
import { useSettingsStore } from '../stores/settings-store';
import ColorBlindOverlay from './ColorBlindOverlay';
import { cn } from '@/lib/utils';

const COLOR_SYMBOLS: Record<string, string> = {
  red: '♦',
  blue: '♠',
  green: '♣',
  yellow: '♥',
};

function getCardLabel(card: CardType): string {
  switch (card.type) {
    case 'number': return String(card.value);
    case 'skip': return '⊘';
    case 'reverse': return '⟲';
    case 'draw_two': return '+2';
    case 'wild': return 'W';
    case 'wild_draw_four': return '+4';
  }
}

const colorClasses: Record<string, string> = {
  red: 'bg-uno-red',
  blue: 'bg-uno-blue',
  green: 'bg-uno-green',
  yellow: 'bg-uno-yellow text-background',
};

const typeFontClasses: Record<string, string> = {
  number: 'text-[24px] md:text-[32px]',
  skip: 'text-[18px] md:text-[24px]',
  reverse: 'text-[18px] md:text-[24px]',
  draw_two: 'text-[20px]',
  wild: 'text-[18px]',
  wild_draw_four: 'text-[16px]',
};

interface CardProps {
  card: CardType;
  playable?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export default function Card({ card, playable = false, clickable = playable, onClick, style, className }: CardProps) {
  const colorBlindMode = useSettingsStore((s) => s.colorBlindMode);

  const isWild = card.type === 'wild' || card.type === 'wild_draw_four';
  const bgClass = isWild
    ? 'bg-[conic-gradient(#ff3366_0deg_90deg,#4488ff_90deg_180deg,#33cc66_180deg_270deg,#fbbf24_270deg_360deg)]'
    : colorClasses[card.color!] ?? '';

  return (
    <div
      className={cn(
        // base
        'w-[52px] h-[76px] md:w-[70px] md:h-[100px] rounded-[14px] md:rounded-[18px]',
        'border-[3px] md:border-4 border-white',
        'flex items-center justify-center',
        'font-game font-black text-white select-none shrink-0 relative',
        'transition-[transform,box-shadow] duration-200',
        'shadow-[3px_4px_0px_rgba(0,0,0,0.2)]',
        '[text-shadow:2px_2px_0px_rgba(0,0,0,0.2)]',
        // color
        bgClass,
        // playable
        playable && [
          'border-3 border-primary',
          'shadow-[0_0_12px_rgba(251,191,36,0.5),3px_4px_0px_rgba(0,0,0,0.2)]',
          'cursor-pointer hover:-translate-y-3 hover:scale-105',
        ],
        className,
      )}
      onClick={clickable ? onClick : undefined}
      style={style}
    >
      {card.color && (
        <span className="absolute top-1 left-1.5 text-[10px] opacity-70">
          {COLOR_SYMBOLS[card.color]}
        </span>
      )}
      <span className={typeFontClasses[card.type] ?? ''}>
        {getCardLabel(card)}
      </span>
      {colorBlindMode && card.color && <ColorBlindOverlay color={card.color} />}
    </div>
  );
}
