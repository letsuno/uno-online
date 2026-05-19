const variantStyles = {
  default: 'bg-blue-600 text-white',
  secondary: 'bg-slate-700 text-slate-300',
  success: 'bg-green-700/40 text-green-300',
  warning: 'bg-yellow-700/40 text-yellow-300',
};

interface BadgeProps {
  variant?: keyof typeof variantStyles;
  children: React.ReactNode;
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${variantStyles[variant]}`}>
      {children}
    </span>
  );
}
