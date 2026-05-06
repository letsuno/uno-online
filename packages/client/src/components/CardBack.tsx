import { cn } from '@/lib/utils';

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
          ? 'w-3 h-[18px] rounded-sm border border-white/30 bg-uno-blue text-[0px]'
          : [
              'w-[52px] h-[76px] md:w-[70px] md:h-[100px]',
              'rounded-[18px] border-3 border-white/20',
              'bg-gradient-to-br from-[#1e3a5f] to-[#0f2744]',
              'flex items-center justify-center',
              'font-game text-[12px] md:text-base font-black text-white/50',
              'shadow-[3px_4px_0px_rgba(0,0,0,0.2)]',
              'shrink-0',
              'transition-[opacity,transform,border-color,box-shadow] duration-200',
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
