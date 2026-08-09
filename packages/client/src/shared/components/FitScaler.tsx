import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type Mode = 'contain' | 'width' | 'height';
type Align = 'center' | 'start' | 'end';

interface Props {
  children: ReactNode;
  /** contain = fit both axes (default), width/height = fit a single axis */
  mode?: Mode;
  /** Upper bound on scale. 1 = never upscale beyond the natural design size. */
  maxScale?: number;
  /** Alignment of the (pre-scale) content box inside the available area. */
  align?: Align;
  /** transform-origin for the scale; keep matching `align` so content stays anchored. */
  origin?: CSSProperties['transformOrigin'];
  /** Positions/sizes the available area (e.g. "absolute inset-x-0 top-[88px] bottom-[84px]"). */
  className?: string;
  style?: CSSProperties;
}

const ALIGN_CLASS: Record<Align, string> = {
  center: 'items-center justify-center',
  start: 'items-start justify-start',
  end: 'items-start justify-end',
};

/**
 * Game-style canvas scaling. Renders `children` at their natural (fixed) design
 * size and scales the whole block uniformly so it always fits the available area
 * — never reflowing, never clipping. This is the menu-screen analogue of a game
 * engine's "scale with screen size" canvas: design once at a logical size, then
 * the same layout shrinks (or grows up to maxScale) to fit any resolution/aspect.
 *
 * Children MUST use fixed (px) sizes, not vw/%/clamp — otherwise the natural size
 * tracks the viewport and the scaling can't be measured reliably.
 */
export default function FitScaler({
  children,
  mode = 'contain',
  maxScale = 1,
  align = 'center',
  origin = 'center center',
  className,
  style,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;

    const compute = () => {
      const aw = area.clientWidth;
      const ah = area.clientHeight;
      const cw = content.offsetWidth;
      const ch = content.offsetHeight;
      if (!aw || !ah || !cw || !ch) return;
      const byW = aw / cw;
      const byH = ah / ch;
      const next =
        mode === 'width'
          ? Math.min(maxScale, byW)
          : mode === 'height'
            ? Math.min(maxScale, byH)
            : Math.min(maxScale, byW, byH);
      setScale(next > 0 ? next : maxScale);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(area);
    ro.observe(content);
    return () => ro.disconnect();
  }, [mode, maxScale]);

  return (
    <div ref={areaRef} className={`flex ${ALIGN_CLASS[align]} ${className ?? ''}`} style={style}>
      <div ref={contentRef} style={{ transform: `scale(${scale})`, transformOrigin: origin, flex: '0 0 auto' }}>
        {children}
      </div>
    </div>
  );
}
