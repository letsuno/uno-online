import type { Color } from '@uno-online/shared';

const PATTERNS: Record<Color, React.CSSProperties> = {
  red: {
    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)',
  },
  blue: {
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)',
  },
  green: {
    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)',
  },
  yellow: {
    backgroundImage: 'radial-gradient(circle 2px, rgba(0,0,0,0.12) 100%, transparent 100%)',
    backgroundSize: '6px 6px',
  },
};

interface Props {
  color: Color;
}

export default function ColorBlindOverlay({ color }: Props) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      pointerEvents: 'none',
      ...PATTERNS[color],
    }} />
  );
}
