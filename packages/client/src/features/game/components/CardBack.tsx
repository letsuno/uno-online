import { cn } from '@/shared/lib/utils';

interface CardBackProps {
  small?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function CardBack({ small = false, onClick, className = '', style }: CardBackProps) {
  return (
    <div
      className={cn(
        small
          ? 'w-card-mini-w h-card-mini-h rounded-sm border border-white/30 bg-uno-blue text-zero'
          : [
              'w-card-w h-card-h md:w-card-w-md md:h-card-h-md',
              'rounded-card-md border-3 border-white/20',
              'bg-gradient-to-br from-card-back-from to-card-back-to',
              'flex items-center justify-center',
              'font-game text-card-back md:text-base font-black text-white/50',
              'shadow-card',
              'shrink-0',
              'transition-[opacity,transform,border-color] duration-200',
            ],
        onClick ? 'cursor-pointer' : 'cursor-default',
        className,
      )}
      onClick={onClick}
      style={style}
    >
      {!small && 'UNO'}
    </div>
  );
}
