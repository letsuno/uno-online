import { forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** 左侧图标（lucide 节点），自动留出内边距 */
  icon?: React.ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS = {
  sm: 'h-[42px] px-3 text-sm rounded-[12px]',
  md: 'h-14 px-[18px] text-base rounded-input',
  lg: 'h-[68px] px-5 text-base rounded-input',
} as const;

const ICON_PAD_CLASS = {
  sm: 'pl-9',
  md: 'pl-12',
  lg: 'pl-14',
} as const;

/**
 * 统一输入框：themed-input 样式（描边 + 金色聚焦环）。
 * 带 icon 时外层包 relative 容器；否则渲染裸 input。
 */
const Input = forwardRef<HTMLInputElement, InputProps>(({ className, icon, inputSize = 'md', ...props }, ref) => {
  const cls = cn('themed-input w-full', SIZE_CLASS[inputSize], icon && ICON_PAD_CLASS[inputSize], className);
  if (!icon) return <input ref={ref} className={cls} {...props} />;
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary pointer-events-none flex items-center">
        {icon}
      </span>
      <input ref={ref} className={cls} {...props} />
    </div>
  );
});

Input.displayName = 'Input';

export { Input };
