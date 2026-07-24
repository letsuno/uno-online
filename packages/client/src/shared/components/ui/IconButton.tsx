import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  /** 激活态（金色高亮），用于开关类图标按钮 */
  active?: boolean;
}

const SIZE_CLASS = {
  sm: 'w-8 h-8 rounded-[10px]',
  md: 'w-10 h-10 rounded-[12px]',
  lg: 'w-14 h-14 rounded-btn',
} as const;

/** 统一图标按钮：毛玻璃底 + 金色 hover；active 时常驻金色 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = 'md', active = false, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'icon-button shrink-0',
        SIZE_CLASS[size],
        active && 'text-primary border-primary/46 shadow-[0_0_24px_rgba(246,190,62,0.14)]',
        className,
      )}
      {...props}
    />
  ),
);

IconButton.displayName = 'IconButton';

export { IconButton };
