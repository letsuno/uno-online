import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const inputVariants = cva(
  'border-2 border-white/20 bg-card text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 rounded-input',
  {
    variants: {
      variant: {
        default: '',
        ghost: 'border-transparent bg-transparent focus:bg-card/50',
      },
      inputSize: {
        default: 'px-4 py-2.5 text-base',
        lg: 'px-5 py-3.5 text-lg',
        sm: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'default',
    },
  },
);

interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, inputSize, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(inputVariants({ variant, inputSize }), className)}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';

export { Input };
