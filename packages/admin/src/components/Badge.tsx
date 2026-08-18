const variantStyles = {
  default: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
  secondary: 'border-white/8 bg-white/5 text-slate-300',
  success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  warning: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  danger: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
};

interface BadgeProps {
  variant?: keyof typeof variantStyles;
  children: React.ReactNode;
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium leading-none ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
