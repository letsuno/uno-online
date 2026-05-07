import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const buttonVariants = cva(
  'font-bold transition-transform duration-150 cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground px-6 py-2.5 rounded-3xl text-base shadow-card hover:scale-105 active:scale-click',
        danger:
          'bg-destructive text-white px-5 py-2 rounded-panel text-sm shadow-card',
        secondary:
          'bg-secondary text-foreground px-5 py-2 rounded-panel text-sm border border-white/20',
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
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button };
