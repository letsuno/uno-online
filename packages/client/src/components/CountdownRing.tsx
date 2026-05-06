import { cn } from '@/lib/utils';

interface CountdownRingProps {
  totalSeconds: number;
  remainingSeconds: number;
  size: number;
  strokeWidth?: number;
}

export default function CountdownRing({
  totalSeconds,
  remainingSeconds,
  size,
  strokeWidth = 3,
}: CountdownRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const offset = circumference * (1 - progress);
  const colorClass =
    progress > 0.5
      ? 'stroke-uno-green'
      : progress > 0.25
        ? 'stroke-uno-yellow'
        : 'stroke-destructive';

  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-white/10"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className={cn(
          colorClass,
          'transition-[stroke-dashoffset] duration-1000 ease-linear',
        )}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}
