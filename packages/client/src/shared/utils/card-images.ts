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

/** In-memory cache: index -> blob URL */
let imageCache: Map<number, string> = new Map();
let packLoaded = false;

export function isPackLoaded(): boolean {
  return packLoaded;
}

export function getCardImageUrl(card: Card): string | null {
  if (!packLoaded) return null;
  return imageCache.get(cardToImageIndex(card)) ?? null;
}

/**
 * Load a ZIP file containing card images named 0.webp ... 53.webp (or .png/.jpg).
 * Images can be at root level or inside a single subdirectory.
 */
export async function loadCardPack(file: File): Promise<void> {
  // Revoke old blob URLs
  for (const url of imageCache.values()) {
    URL.revokeObjectURL(url);
  }
  imageCache = new Map();
  packLoaded = false;

  const buffer = await file.arrayBuffer();
  const files = unzipSync(new Uint8Array(buffer));

  for (const [path, data] of Object.entries(files)) {
    // Extract filename, skip directories
    const name = path.split('/').pop() ?? '';
    const match = name.match(/^(\d+)\.(webp|png|jpg|jpeg)$/i);
    if (!match) continue;

    const index = parseInt(match[1], 10);
    if (index < 0 || index > 53) continue;

    const ext = match[2].toLowerCase();
    const mimeMap: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
    const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeMap[ext] ?? 'image/webp' });
    imageCache.set(index, URL.createObjectURL(blob));
  }

  packLoaded = imageCache.size > 0;
}

/** Clear the loaded pack and revoke all blob URLs. */
export function clearCardPack(): void {
  for (const url of imageCache.values()) {
    URL.revokeObjectURL(url);
  }
  imageCache = new Map();
  packLoaded = false;
}
