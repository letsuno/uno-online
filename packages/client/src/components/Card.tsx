import type { Card as CardType } from '@uno-online/shared';
import { useSettingsStore } from '../stores/settings-store';
import ColorBlindOverlay from './ColorBlindOverlay';
import { cn } from '@/lib/utils';

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
  number: 'text-card-number md:text-card-number-md',
  skip: 'text-card-symbol md:text-card-symbol-md',
  reverse: 'text-card-symbol md:text-card-symbol-md',
  draw_two: 'text-card-draw',
  wild: 'text-card-wild',
  wild_draw_four: 'text-card-wild4',
};

interface CardProps {
  card: CardType;
  playable?: boolean;
  clickable?: boolean;
  dimmed?: boolean;
  mini?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export default function Card({ card, playable = false, clickable = playable, dimmed = false, mini = false, onClick, style, className }: CardProps) {
  const colorBlindMode = useSettingsStore((s) => s.colorBlindMode);

  const isWild = card.type === 'wild' || card.type === 'wild_draw_four';
  const bgClass = isWild
    ? 'bg-wild-gradient'
    : colorClasses[card.color!] ?? '';

  const label = getCardLabel(card);
  const showCorners = !isWild && !mini;

  return (
    <div
      className={cn(
        'w-card-w h-card-h md:w-card-w-md md:h-card-h-md rounded-card md:rounded-card-md',
        'border-card-border md:border-4 border-white',
        'flex items-center justify-center',
        'font-game font-black text-white select-none shrink-0 relative',
        'transition-[transform,box-shadow,opacity] duration-200',
        'shadow-card',
        'text-shadow-card',
        bgClass,
        playable && [
          'border-3 border-primary',
          'shadow-card-playable',
          'cursor-pointer hover:-translate-y-3 hover:scale-105',
        ],
        dimmed && 'opacity-40',
        className,
      )}
      onClick={clickable ? onClick : undefined}
      style={style}
    >
      {showCorners && (
        <span className="absolute top-0.5 left-1 leading-none">
          <span className="text-2xs font-bold">{label}</span>
        </span>
      )}

      <span className={mini ? 'text-2xs font-bold leading-none' : typeFontClasses[card.type] ?? ''}>
        {label}
      </span>

      {showCorners && (
        <span className="absolute bottom-0.5 right-1 leading-none rotate-180">
          <span className="text-2xs font-bold">{label}</span>
        </span>
      )}

      {colorBlindMode && card.color && <ColorBlindOverlay color={card.color} />}
    </div>
  );
}
