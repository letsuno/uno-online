import type { Color } from '@uno-online/shared';

/** 原始色值。用于 canvas / 粒子等读不到 CSS 变量的场景。 */
export const UNO_COLOR_HEX: Record<Color, string> = {
  red: '#ff3366',
  blue: '#4488ff',
  green: '#33cc66',
  yellow: '#fbbf24',
  // UNO Flip 暗面四色
  pink: '#ff5fa2',
  teal: '#1fbfb8',
  orange: '#ff8a3d',
  purple: '#a066ff',
};

/** CSS 变量引用形式。能跟随主题，优先用这个。 */
export const UNO_COLOR_VAR: Record<Color, string> = {
  red: 'var(--color-uno-red)',
  blue: 'var(--color-uno-blue)',
  green: 'var(--color-uno-green)',
  yellow: 'var(--color-uno-yellow)',
  pink: 'var(--color-uno-pink)',
  teal: 'var(--color-uno-teal)',
  orange: 'var(--color-uno-orange)',
  purple: 'var(--color-uno-purple)',
};

export const UNO_COLOR_LABEL: Record<Color, string> = {
  red: '红', blue: '蓝', green: '绿', yellow: '黄',
  pink: '粉', teal: '青', orange: '橙', purple: '紫',
};

/** 牌面底色的 Tailwind 类。 */
export const UNO_COLOR_BG_CLASS: Record<Color, string> = {
  red: 'bg-uno-red',
  blue: 'bg-uno-blue',
  green: 'bg-uno-green',
  yellow: 'bg-uno-yellow text-background',
  pink: 'bg-uno-pink',
  teal: 'bg-uno-teal',
  orange: 'bg-uno-orange text-background',
  purple: 'bg-uno-purple',
};
