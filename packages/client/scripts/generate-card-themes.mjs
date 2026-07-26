// 生成内置卡面主题资源包：3 套主题 × 54 张 SVG → public/card-themes/<key>.zip
//
// 索引与 src/shared/utils/card-images.ts 的 cardToImageIndex 严格一致：
//   0-3 +2（黄红绿蓝） | 4-43 数字（9→0，每值黄红绿蓝） | 44 +4 | 45 万能 | 46-49 禁止 | 50-53 转向
//
// 数字/字母用 Fredoka（游戏 UI 同款字体）在构建期转为路径，运行时不依赖设备字体。
// 用法：node scripts/generate-card-themes.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { zipSync, strToU8 } from 'fflate';
import * as fontkit from 'fontkit';
import { decompress } from 'wawoff2';

const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, '../public/card-themes');

// ── 字体：Fredoka wght 600，文字转路径 ──────────────────────────

const woff2Path = require.resolve('@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2');
const ttf = Buffer.from(await decompress(readFileSync(woff2Path)));
const fredoka = fontkit.create(ttf).getVariation({ wght: 600 });
const UPEM = 1000;

/** 文字 → 居中路径组（按整串 bbox 居中，兼容 +2/+4/W 等混排） */
function text(str, fontSize, attrs = '') {
  const run = fredoka.layout(str);
  let x = 0;
  const parts = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of run.glyphs) {
    const b = g.bbox;
    if (b.width > 0) {
      minX = Math.min(minX, x + b.minX); maxX = Math.max(maxX, x + b.maxX);
      minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY);
      parts.push(`<path transform="translate(${x} 0)" d="${g.path.toSVG()}"/>`);
    }
    x += g.advanceWidth;
  }
  const s = fontSize / UPEM;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return `<g ${attrs} transform="scale(${s} ${-s}) translate(${-cx} ${-cy})">${parts.join('')}</g>`;
}

// ── 共享几何 ────────────────────────────────────────────────────

export const COLORS = { red: '#ff3366', blue: '#4488ff', green: '#33cc66', yellow: '#fbbf24' };
const ALL = [COLORS.red, COLORS.yellow, COLORS.green, COLORS.blue];

function reverseArrows(fill, rotate = 45, scale = 1) {
  return `<g fill="${fill}" transform="rotate(${rotate}) scale(${scale})"><path d="M-32 -24 H8 V-32 L32 -17 L8 -2 V-10 H-32 Z"/><path d="M32 24 H-8 V32 L-32 17 L-8 2 V10 H32 Z"/></g>`;
}

function banSymbol(color, r = 46, w = 13) {
  return `<g fill="none" stroke="${color}" stroke-width="${w}"><circle r="${r}"/><line x1="${-r * 0.71}" y1="${-r * 0.71}" x2="${r * 0.71}" y2="${r * 0.71}"/></g>`;
}

function cornerSymbol(kind, fill, scale = 0.38) {
  if (kind === 'skip') return `<g transform="scale(${scale})">${banSymbol(fill, 40, 14)}</g>`;
  if (kind === 'reverse') return reverseArrows(fill, 45, scale);
  return '';
}

const underline = (v, y, w, color, h = 8, opacity = 1) =>
  v === 6 || v === 9 ? `<rect x="${-w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${color}" opacity="${opacity}"/>` : '';

const miniCard = (x, y, w, h, fill, stroke, strokeW, rot = 12) =>
  `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${w * 0.18}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" transform="rotate(${rot} ${x} ${y})"/>`;

// ── 主题 A：复古经典 ────────────────────────────────────────────

function themeRetro(card) {
  const { type, color, value } = card;
  const c = COLORS[color] ?? '#1c1c24';
  const isWild = type === 'wild' || type === 'wild_draw_four';
  const ground = isWild ? '#191921' : c;
  const ELL = `<ellipse rx="92" ry="56" fill="#fff" transform="rotate(-32)"/>`;
  const tall = value === 6 || value === 9;

  let center = '';
  if (type === 'number') {
    center = `${ELL}<g transform="translate(0 ${tall ? -8 : 0})">${text(String(value), tall ? 96 : 106, `fill="${c}"`)}</g>${underline(value, 44, 54, c)}`;
  } else if (type === 'skip') {
    center = `${ELL}${banSymbol(c)}`;
  } else if (type === 'reverse') {
    center = `${ELL}${reverseArrows(c, -32, 1.06)}`;
  } else if (type === 'draw_two') {
    center = `${ELL}${miniCard(-17, 12, 36, 52, c, '#fff', 5)}${miniCard(17, -12, 36, 52, c, '#fff', 5)}`;
  } else if (type === 'wild') {
    const wedges = ALL.map((col, i) => {
      const a0 = (i * Math.PI) / 2, a1 = ((i + 1) * Math.PI) / 2;
      const rx = 88, ry = 54;
      return `<path d="M0 0L${Math.cos(a0) * rx} ${Math.sin(a0) * ry}A${rx} ${ry} 0 0 1 ${Math.cos(a1) * rx} ${Math.sin(a1) * ry}Z" fill="${col}"/>`;
    }).join('');
    center = `<g transform="rotate(-32)"><ellipse rx="92" ry="56" fill="#fff"/>${wedges}</g>`;
  } else if (type === 'wild_draw_four') {
    center = [[-39, 8, COLORS.yellow], [-13, -4, COLORS.green], [13, -4, COLORS.blue], [39, 8, COLORS.red]]
      .map(([x, y, col]) => miniCard(x, y, 34, 52, col, '#fff', 5)).join('');
  }

  const cornerContent = (fill) => {
    if (type === 'skip' || type === 'reverse') return cornerSymbol(type, fill);
    const label = { number: String(value), draw_two: '+2', wild: '', wild_draw_four: '+4' }[type];
    if (!label) return '';
    return `${text(label, 46, `fill="${fill}"`)}${underline(value, 25, 30, fill, 5.5)}`;
  };
  const corner = (x, y, rot = 0) => cornerContent('#fff')
    ? `<g transform="translate(${x} ${y}) rotate(${rot})"><g transform="translate(2 3)">${cornerContent('rgba(0,0,0,.35)')}</g>${cornerContent('#fff')}</g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300">
  <rect width="200" height="300" rx="52" fill="#fff"/>
  <rect x="9" y="9" width="182" height="282" rx="43" fill="${ground}"/>
  <g transform="translate(100 150)">${center}</g>
  ${corner(38, 36)}${corner(162, 264, 180)}
</svg>`;
}

// ── 主题 B：极简扁平 ────────────────────────────────────────────

function themeMinimal(card) {
  const { type, color, value } = card;
  const c = COLORS[color] ?? '#23232e';
  const isWild = type === 'wild' || type === 'wild_draw_four';
  const ground = isWild ? '#23232e' : c;
  const tall = value === 6 || value === 9;

  const dots = (r, d) => ALL.map((col, i) => {
    const a = (i * Math.PI) / 2 - Math.PI / 4;
    return `<circle cx="${Math.cos(a) * d}" cy="${Math.sin(a) * d}" r="${r}" fill="${col}"/>`;
  }).join('');

  let center = '';
  if (type === 'number') {
    center = `<g transform="translate(0 ${tall ? -10 : 0})">${text(String(value), tall ? 112 : 124, 'fill="#fff"')}</g>${underline(value, 52, 60, '#fff', 8, 0.9)}`;
  } else if (type === 'draw_two') {
    center = text('+2', 94, 'fill="#fff"');
  } else if (type === 'skip') {
    center = banSymbol('#fff', 48, 12);
  } else if (type === 'reverse') {
    center = reverseArrows('#fff');
  } else if (type === 'wild') {
    center = dots(22, 34);
  } else if (type === 'wild_draw_four') {
    center = `<g transform="translate(0 -22)">${dots(18, 28)}</g><g transform="translate(0 64)">${text('+4', 50, 'fill="#fff"')}</g>`;
  }

  const cornerContent = () => {
    if (type === 'skip' || type === 'reverse') return cornerSymbol(type, 'rgba(255,255,255,.92)');
    const label = { number: String(value), draw_two: '+2', wild: '', wild_draw_four: '+4' }[type];
    if (!label) return '';
    return `${text(label, 38, 'fill="rgba(255,255,255,.92)"')}${underline(value, 22, 26, 'rgba(255,255,255,.92)', 4.5)}`;
  };
  const corner = (x, y, rot = 0) => cornerContent()
    ? `<g transform="translate(${x} ${y}) rotate(${rot})">${cornerContent()}</g>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300">
  <rect width="200" height="300" rx="52" fill="${ground}"/>
  <rect x="10" y="10" width="180" height="280" rx="42" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2.5"/>
  <g transform="translate(100 150)">${center}</g>
  ${corner(36, 36)}${corner(164, 264, 180)}
</svg>`;
}

// ── 主题 C：霓虹暗黑 ────────────────────────────────────────────
// v2：本色染色的深底（呼应 HUD 彩色胶囊的 color-mix 语言）+ 实心提亮数字 + 柔光，
// 替代 v1 的纯黑底 + 空心描边字（小尺寸可读性差、与整体 UI 不融合）。

/** hex 颜色线性混合：mix('#ff3366', '#ffffff', 0.25) */
function mix(hexA, hexB, t) {
  const a = hexA.match(/\w\w/g).map((x) => parseInt(x, 16));
  const b = hexB.match(/\w\w/g).map((x) => parseInt(x, 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function themeNeon(card) {
  const { type, color, value } = card;
  const c = COLORS[color] ?? '#b48cff';
  const isWild = type === 'wild' || type === 'wild_draw_four';
  const tall = value === 6 || value === 9;
  /** 深底带本色染色；万能牌用中性深底 */
  const ground = isWild ? '#1c1c28' : mix(c, '#15151f', 0.88);
  /** 实心元素用提亮的本色，保证暗底上的可读性 */
  const bright = mix(c, '#ffffff', 0.22);
  const stroke = isWild ? `url(#wg)` : c;

  const gradient = isWild
    ? `<linearGradient id="wg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${COLORS.red}"/><stop offset=".33" stop-color="${COLORS.yellow}"/>
        <stop offset=".66" stop-color="${COLORS.green}"/><stop offset="1" stop-color="${COLORS.blue}"/>
      </linearGradient>`
    : '';

  /** 柔光：模糊副本垫底 + 清晰实心层 */
  const glow = (inner, opacity = 0.45) => `<g filter="url(#glow)" opacity="${opacity}">${inner}</g>${inner}`;
  const solidText = (txt, size, dy = 0, fill = bright) => glow(
    `<g transform="translate(0 ${dy})">${text(txt, size, `fill="${fill}"`)}</g>`,
  );

  let center = '';
  if (type === 'number') {
    center = solidText(String(value), tall ? 116 : 128, tall ? -10 : 0)
      + (tall ? underline(value, 50, 60, bright) : '');
  } else if (type === 'draw_two') {
    center = solidText('+2', 96);
  } else if (type === 'wild_draw_four') {
    center = solidText('+4', 96, 0, '#f2f2f8');
  } else if (type === 'wild') {
    center = ALL.map((col, i) => {
      const a = (i * Math.PI) / 2 - Math.PI / 4;
      const cx = Math.cos(a) * 36, cy = Math.sin(a) * 36;
      return `<circle cx="${cx}" cy="${cy}" r="17" fill="${col}" filter="url(#glow)" opacity=".5"/><circle cx="${cx}" cy="${cy}" r="17" fill="${col}"/>`;
    }).join('');
  } else if (type === 'skip') {
    center = glow(banSymbol(bright, 46, 12));
  } else if (type === 'reverse') {
    center = glow(reverseArrows(bright));
  }

  const cornerContent = () => {
    if (type === 'skip' || type === 'reverse') return cornerSymbol(type, bright);
    const label = { number: String(value), draw_two: '+2', wild: 'W', wild_draw_four: '+4' }[type];
    if (!label) return '';
    return `${text(label, 40, `fill="${isWild ? '#f2f2f8' : bright}"`)}${underline(value, 23, 27, bright, 5)}`;
  };
  const corner = (x, y, rot = 0) => cornerContent()
    ? `<g transform="translate(${x} ${y}) rotate(${rot})">${cornerContent()}</g>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300">
  <defs>${gradient}
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
    <radialGradient id="sheen" cx=".3" cy=".12" r="1.1">
      <stop offset="0" stop-color="rgba(255,255,255,.10)"/><stop offset=".45" stop-color="rgba(255,255,255,.03)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="200" height="300" rx="52" fill="${ground}"/>
  <rect width="200" height="300" rx="52" fill="url(#sheen)"/>
  <rect x="8" y="8" width="184" height="284" rx="44" fill="none" stroke="${stroke}" stroke-width="4" opacity=".45" filter="url(#glow)"/>
  <rect x="8" y="8" width="184" height="284" rx="44" fill="none" stroke="${stroke}" stroke-width="3.5" opacity=".85"/>
  <g transform="translate(100 150)">${center}</g>
  ${corner(36, 36)}${corner(164, 264, 180)}
</svg>`;
}

// ── 54 张卡的索引枚举（与 cardToImageIndex 逆映射） ──────────────

const COLOR_AT = ['yellow', 'red', 'green', 'blue'];

function cardAtIndex(i) {
  if (i <= 3) return { type: 'draw_two', color: COLOR_AT[i] };
  if (i <= 43) return { type: 'number', color: COLOR_AT[(i - 4) % 4], value: 9 - Math.floor((i - 4) / 4) };
  if (i === 44) return { type: 'wild_draw_four' };
  if (i === 45) return { type: 'wild' };
  if (i <= 49) return { type: 'skip', color: COLOR_AT[i - 46] };
  return { type: 'reverse', color: COLOR_AT[i - 50] };
}

const THEMES = { retro: themeRetro, minimal: themeMinimal, neon: themeNeon };

mkdirSync(OUT_DIR, { recursive: true });
for (const [key, fn] of Object.entries(THEMES)) {
  const files = {};
  for (let i = 0; i < 54; i++) {
    files[`${i}.svg`] = strToU8(fn(cardAtIndex(i)));
  }
  const zip = zipSync(files, { level: 9 });
  writeFileSync(join(OUT_DIR, `${key}.zip`), zip);
  // 主题选择器里的缩略预览（红 7）
  writeFileSync(join(OUT_DIR, `${key}-preview.svg`), fn({ type: 'number', color: 'red', value: 7 }));
  console.log(`${key}.zip: ${(zip.length / 1024).toFixed(1)} KB (+ ${key}-preview.svg)`);
}
