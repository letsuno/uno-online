const variantStyles = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500',
  destructive: 'bg-rose-700 text-white hover:bg-rose-600',
  secondary: 'border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700',
  outline: 'border border-slate-700 text-slate-300 hover:bg-slate-800',
  ghost: 'text-slate-400 hover:bg-slate-800 hover:text-white',
};

const sizeStyles = {
  default: 'h-9 px-4 py-2 text-sm',
  sm: 'h-8 px-3 text-xs',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
}

export function Button({ variant = 'primary', size = 'default', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:pointer-events-none disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  );
}
