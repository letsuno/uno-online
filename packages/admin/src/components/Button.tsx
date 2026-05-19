const variantStyles = {
  primary: 'bg-blue-600 text-white shadow hover:bg-blue-700',
  destructive: 'bg-red-700 text-white shadow-sm hover:bg-red-600',
  secondary: 'bg-slate-700 text-white shadow-sm hover:bg-slate-600',
  outline: 'border border-slate-600 text-slate-300 shadow-sm hover:bg-slate-700 hover:text-white',
  ghost: 'text-slate-300 hover:bg-slate-700 hover:text-white',
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
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  );
}
