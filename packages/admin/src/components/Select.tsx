interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Select({ value, options, onChange, disabled, className = '', ariaLabel }: SelectProps) {
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`h-9 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50 ${className}`}
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
