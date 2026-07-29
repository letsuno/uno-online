import type { Card as CardType } from '@uno-online/shared';
import { isWildCard } from '@uno-online/shared';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { getCardImage, isPackLoaded } from '@/shared/utils/card-images';
import ColorBlindOverlay from './ColorBlindOverlay';
import { cn } from '@/shared/lib/utils';
import { cardSymbol } from '../constants/card-symbols';
import { UNO_COLOR_BG_CLASS } from '../constants/colors';

/** 经典双箭头转向符号——文字字形 ⟲ 与禁止 ⊘ 形近，改用 SVG 区分 */
function ReverseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn('inline-block w-[1em] h-[1em]', className)}
      style={{ filter: 'drop-shadow(2px 2px 0px rgba(0, 0, 0, 0.2))' }}
    >
      <g transform="rotate(45 12 12)">
        <path d="M4 7h8V4l7 5-7 5v-3H4z" />
        <path d="M20 17h-8v3l-7-5 7-5v3h8z" />
      </g>
    </svg>
  );
}



const typeFontClasses: Record<string, string> = {
  number: 'text-card-number md:text-card-number-md',
  skip: 'text-card-symbol md:text-card-symbol-md',
  reverse: 'text-card-symbol md:text-card-symbol-md',
  draw_two: 'text-card-draw',
  wild: 'text-card-wild',
  wild_draw_four: 'text-card-wild4',
  draw_one: 'text-card-draw',
  draw_five: 'text-card-draw',
  skip_everyone: 'text-card-draw',
  flip: 'text-card-symbol md:text-card-symbol-md',
  wild_draw_two: 'text-card-wild4',
  wild_draw_color: 'text-card-wild4',
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
  forceCornerLabel?: boolean;
  disableHoverLift?: boolean;
}

export default function Card({ card, playable = false, clickable = playable, dimmed = false, mini = false, onClick, style, className, forceCornerLabel = false, disableHoverLift = false }: CardProps) {
  const colorBlindMode = useSettingsStore((s) => s.colorBlindMode);
  const cardImagePack = useSettingsStore((s) => s.cardTheme !== 'default' && s.cardThemeReady);

  const isWild = isWildCard(card);
  const bgClass = isWild
    ? 'bg-wild-gradient'
    : UNO_COLOR_BG_CLASS[card.color!] ?? '';

  const label = cardSymbol(card.type, card.type === 'number' ? card.value : undefined);
  const symbol = card.type === 'reverse' ? <ReverseIcon /> : label;
  const showCorners = (!isWild || forceCornerLabel) && !mini;

  if (cardImagePack && isPackLoaded()) {
    const image = getCardImage(card);
    if (image) {
      return (
        <div
          className={cn(
            'w-card-w h-card-h md:w-card-w-md md:h-card-h-md',
            'bg-transparent border-none shadow-none p-0',
            // SVG 卡面（内置主题）自带圆角，容器裁切会切出豁口；栅格自定义包仍需圆角裁切
            !image.isSvg && 'rounded-card md:rounded-card-md overflow-hidden',
            'flex items-center justify-center',
            'select-none shrink-0 relative',
            'transition-[transform,box-shadow,opacity] duration-200',
            playable && [
              'cursor-pointer',
              !disableHoverLift && 'hover:-translate-y-3 hover:scale-105',
            ],
            dimmed && 'brightness-[0.45] saturate-[0.7]',
            className,
          )}
          onClick={clickable ? onClick : undefined}
          style={style}
        >
          <img src={image.url} alt={label} className="w-full h-full object-contain pointer-events-none" draggable={false} />
          {/* SVG 卡面角标已内置，叠加会出现双重角标 */}
          {forceCornerLabel && !image.isSvg && (
            <span className="absolute top-0.5 left-1 leading-none text-white text-shadow-card">
              <span className="text-2xs font-bold">{symbol}</span>
            </span>
          )}
          {colorBlindMode && card.color && <ColorBlindOverlay color={card.color} />}
        </div>
      );
    }
  }

  return (
    <div
      className={cn(
        'w-card-w h-card-h md:w-card-w-md md:h-card-h-md rounded-card md:rounded-card-md',
        // 边框区分明暗面：亮面白边，暗面黑灰边 + 白色描边（规则在 effects.css，
        // 走 [data-flip-side] 祖先选择器，避免每张牌都订阅 store）
        'uno-card border-3 md:border-4 border-white',
        'flex items-center justify-center',
        'font-game font-black text-white select-none shrink-0 relative',
        'transition-[transform,box-shadow,opacity] duration-200',
        'shadow-card',
        'text-shadow-card',
        bgClass,
        playable && [
          'border-3 border-primary',
          'shadow-card-playable',
          'cursor-pointer',
          !disableHoverLift && 'hover:-translate-y-3 hover:scale-105',
        ],
        dimmed && 'brightness-[0.45] saturate-[0.7]',
        className,
      )}
      onClick={clickable ? onClick : undefined}
      style={style}
    >
      {showCorners && (
        <span className="absolute top-0.5 left-1 leading-none">
          <span className="text-2xs font-bold">{symbol}</span>
        </span>
      )}

      <span className={mini ? 'text-2xs font-bold leading-none' : typeFontClasses[card.type] ?? ''}>
        {symbol}
      </span>

      {showCorners && (
        <span className="absolute bottom-0.5 right-1 leading-none rotate-180">
          <span className="text-2xs font-bold">{symbol}</span>
        </span>
      )}

      {colorBlindMode && card.color && <ColorBlindOverlay color={card.color} />}
    </div>
  );
}
