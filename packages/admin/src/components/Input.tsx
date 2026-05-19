type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`flex h-9 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-1 text-sm text-white shadow-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
      {...props}
    />
  );
}
