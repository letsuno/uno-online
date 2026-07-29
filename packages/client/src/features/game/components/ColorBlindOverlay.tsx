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
  // UNO Flip 暗面四色。暗面色相（粉/橙）比亮面更易混淆，图案差异需要更明显。
  pink: {
    backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.18) 3px, rgba(255,255,255,0.18) 6px)',
  },
  teal: {
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.18) 2px, rgba(255,255,255,0.18) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.18) 2px, rgba(255,255,255,0.18) 4px)',
  },
  orange: {
    backgroundImage: 'radial-gradient(circle 2px, rgba(0,0,0,0.18) 100%, transparent 100%)',
    backgroundSize: '8px 8px',
  },
  purple: {
    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(255,255,255,0.18) 4px, rgba(255,255,255,0.18) 8px)',
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
