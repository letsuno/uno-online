import type { Card } from '@uno-online/shared';
import { unzipSync } from 'fflate';

const COLOR_INDEX: Record<string, number> = { yellow: 0, red: 1, green: 2, blue: 3 };

/**
 * Map a card to its image index (0-53) in the resource pack.
 */
function cardToImageIndex(card: Card): number {
  switch (card.type) {
    case 'draw_two':
      return COLOR_INDEX[card.color] ?? 0;
    case 'number':
      return 4 + (9 - card.value) * 4 + (COLOR_INDEX[card.color] ?? 0);
    case 'wild_draw_four':
      return 44;
    case 'wild':
      return 45;
    case 'skip':
      return 46 + (COLOR_INDEX[card.color] ?? 0);
    case 'reverse':
      return 50 + (COLOR_INDEX[card.color] ?? 0);
  }
}

export interface CardImage {
  url: string;
  /** SVG 卡面自带圆角与角标（内置主题），渲染时无需容器裁切和角标叠加 */
  isSvg: boolean;
}

/** In-memory cache: index -> blob URL + metadata */
let imageCache: Map<number, CardImage> = new Map();
let packLoaded = false;

export function isPackLoaded(): boolean {
  return packLoaded;
}

export function getCardImage(card: Card): CardImage | null {
  if (!packLoaded) return null;
  return imageCache.get(cardToImageIndex(card)) ?? null;
}

/**
 * Load a ZIP buffer containing card images named 0.webp ... 53.webp (or .png/.jpg/.svg).
 * Images can be at root level or inside a single subdirectory.
 */
function loadPackFromZipBuffer(buffer: ArrayBuffer): void {
  // Revoke old blob URLs
  for (const entry of imageCache.values()) {
    URL.revokeObjectURL(entry.url);
  }
  imageCache = new Map();
  packLoaded = false;

  const files = unzipSync(new Uint8Array(buffer));

  for (const [path, data] of Object.entries(files)) {
    // Extract filename, skip directories
    const name = path.split('/').pop() ?? '';
    const match = name.match(/^(\d+)\.(webp|png|jpg|jpeg|svg)$/i);
    if (!match) continue;

    const index = parseInt(match[1], 10);
    if (index < 0 || index > 53) continue;

    const ext = match[2].toLowerCase();
    const mimeMap: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
    const blob = new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: mimeMap[ext] ?? 'image/webp' });
    imageCache.set(index, { url: URL.createObjectURL(blob), isSvg: ext === 'svg' });
  }

  packLoaded = imageCache.size > 0;
}

/** 用户自定义卡面包（上传 ZIP，会话级） */
export async function loadCardPack(file: File): Promise<void> {
  loadPackFromZipBuffer(await file.arrayBuffer());
}

export type BuiltinCardTheme = 'retro' | 'minimal' | 'neon';

/** 内置卡面主题：拉取静态资源包并装载（走 HTTP 缓存，刷新后可自动恢复） */
export async function loadBuiltinTheme(key: BuiltinCardTheme): Promise<void> {
  const res = await fetch(`/card-themes/${key}.zip`);
  if (!res.ok) throw new Error(`卡面主题加载失败: ${key} (${res.status})`);
  loadPackFromZipBuffer(await res.arrayBuffer());
}

/** Clear the loaded pack and revoke all blob URLs. */
export function clearCardPack(): void {
  for (const entry of imageCache.values()) {
    URL.revokeObjectURL(entry.url);
  }
  imageCache = new Map();
  packLoaded = false;
}
