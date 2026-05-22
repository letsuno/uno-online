import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';
import { playSound } from '@/shared/sound/sound-manager';
import type { ButtonSound } from '@/shared/sound/sound-manager';

const buttonVariants = cva(
  'font-bold transition-all duration-150 cursor-pointer rounded-btn shadow-tech',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground px-6 py-2.5 text-base shadow-card hover:scale-105 active:scale-click',
        danger:
          'bg-destructive text-white px-5 py-2 text-sm shadow-card',
        secondary:
          'bg-secondary text-foreground px-5 py-2 text-sm border border-white/20',
        ghost:
          'bg-transparent text-foreground px-4 py-2 text-sm hover:bg-white/10',
        outline:
          'bg-transparent text-primary border-2 border-primary/50 px-5 py-2 text-sm hover:bg-primary/10',
        game:
          'bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] text-[#1a1a2e] px-6 py-[22px] text-xl font-[family-name:var(--font-game)] tracking-[4px] shadow-[0_6px_28px_rgba(251,191,36,0.25),inset_0_1px_0_rgba(255,255,255,0.2)] hover:translate-y-[-3px] hover:shadow-[0_10px_40px_rgba(251,191,36,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] active:translate-y-[-1px] relative overflow-hidden',
      },
      size: {
        default: '',
        lg: 'px-10 py-4 text-xl',
        sm: 'px-3 py-1 text-xs',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  sound?: ButtonSound;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, sound, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (sound) playSound(sound);
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        onClick={handleClick}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button };
