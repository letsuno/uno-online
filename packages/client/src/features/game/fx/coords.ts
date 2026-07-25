/**
 * 视口坐标锚点工具。
 * 特效层挂在 document.body 上（fixed 定位），因此所有锚点统一用
 * getBoundingClientRect 取视口坐标——天然免疫 FitScaler 的 transform: scale。
 */

export interface ViewportPoint {
  x: number;
  y: number;
}

/** 取元素视口中心；元素不存在或不可见时返回 null（调用方跳过动画，不报错） */
function centerOf(el: Element | null): ViewportPoint | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** 玩家锚点：桌面 PlayerNode 头像 / 移动端 OpponentRow 头像 / 自己的 PlayerHand */
export function getPlayerAnchor(playerId: string): ViewportPoint | null {
  // 自己在桌面会同时命中 PlayerNode 与 PlayerHand；
  // PlayerHand 在 GamePage 中渲染于牌桌之后，取最后一个命中即「自己摸牌的终点」
  const matches = document.querySelectorAll(`[data-player-id="${CSS.escape(playerId)}"]`);
  return centerOf(matches.length > 0 ? matches[matches.length - 1]! : null);
}

/** 摸牌堆锚点：桌面 DrawPile / 移动端 StageCenter 的 DeckBack */
export function getDrawPileAnchor(side: 'left' | 'right'): ViewportPoint | null {
  return centerOf(document.querySelector(`[data-draw-pile="${side}"]`));
}

/** 弃牌槽锚点：移动端 StageCenter / 桌面 DiscardPile */
export function getDiscardSlotAnchor(): ViewportPoint | null {
  return centerOf(document.querySelector('[data-discard-slot]'));
}

/** 弃牌槽矩形（飞牌终点尺寸用它，保证落点与牌堆视觉一致） */
export function getDiscardSlotRect(): { x: number; y: number; w: number; h: number } | null {
  const el = document.querySelector('[data-discard-slot]');
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width, h: rect.height };
}
