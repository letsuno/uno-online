export function AiBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded bg-violet-500/20 px-1 py-0.5 text-[10px] font-bold leading-none text-violet-300 ${className}`}>
      AI
    </span>
  );
}
