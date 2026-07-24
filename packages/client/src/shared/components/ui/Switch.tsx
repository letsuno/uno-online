import { cn } from '@/shared/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** 小号（房间设置等紧凑场景） */
  size?: 'sm' | 'md';
  label?: string;
}

/**
 * 统一开关：金色渐变开启态 + 发光。
 * md 58×30（设置页），sm 44×24（村规列表等紧凑行）。
 */
export function Switch({ checked, onChange, disabled = false, size = 'md', label }: SwitchProps) {
  const md = size === 'md';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative rounded-full transition-all duration-200 shrink-0',
        md ? 'w-[58px] h-[30px] p-[3px]' : 'w-11 h-6',
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
      )}
      style={{
        background: checked ? 'linear-gradient(135deg, var(--gold-2), var(--gold))' : 'rgba(255,255,255,0.15)',
        boxShadow: checked ? '0 0 15px rgba(246,190,62,0.26)' : 'none',
      }}
    >
      <span
        className={cn(
          'block rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.25)] transition-transform',
          md ? 'w-6 h-6' : 'w-toggle-knob h-toggle-knob absolute top-toggle-off',
          md && checked && 'translate-x-7',
          !md && (checked ? 'left-toggle-on' : 'left-toggle-off'),
        )}
      />
    </button>
  );
}
