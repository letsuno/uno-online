import { create } from 'zustand';

/**
 * 动画-状态同步层：跟踪「在途」的牌。
 * 飞牌未到达时，目标区域不现身——摸牌的新牌在手牌区隐形占位、
 * 出牌时弃牌堆先显示上一张顶牌，飞牌落地瞬间再更新。
 */
interface FxState {
  /** 手牌区暂时隐形的牌 id（摸牌在途，落地后移除） */
  hiddenHandCardIds: Set<string>;
  /** 弃牌堆暂时不显示的顶牌 id（出牌在途，落地后移除） */
  hiddenDiscardCardIds: Set<string>;
  /** 自己出牌的起飞位置（点击时记录的精确槽位矩形） */
  playOrigins: Map<string, { x: number; y: number }>;
  hideHandCards: (ids: string[]) => void;
  revealHandCard: (id: string) => void;
  hideDiscardCard: (id: string) => void;
  revealDiscardCard: (id: string) => void;
  setPlayOrigin: (cardId: string, pt: { x: number; y: number }) => void;
  takePlayOrigin: (cardId: string) => { x: number; y: number } | null;
}

/** 兜底：任何在途标记最多存在 1.2s，避免异常路径下牌永远隐形 */
const SAFETY_MS = 1200;

export const useFxStore = create<FxState>((set, get) => ({
  hiddenHandCardIds: new Set(),
  hiddenDiscardCardIds: new Set(),
  playOrigins: new Map(),
  hideHandCards: ids => {
    if (ids.length === 0) return;
    set(s => ({ hiddenHandCardIds: new Set([...s.hiddenHandCardIds, ...ids]) }));
    for (const id of ids) {
      setTimeout(() => get().revealHandCard(id), SAFETY_MS);
    }
  },
  revealHandCard: id =>
    set(s => {
      if (!s.hiddenHandCardIds.has(id)) return {};
      const next = new Set(s.hiddenHandCardIds);
      next.delete(id);
      return { hiddenHandCardIds: next };
    }),
  hideDiscardCard: id => {
    set(s => ({ hiddenDiscardCardIds: new Set([...s.hiddenDiscardCardIds, id]) }));
    setTimeout(() => get().revealDiscardCard(id), SAFETY_MS);
  },
  revealDiscardCard: id =>
    set(s => {
      if (!s.hiddenDiscardCardIds.has(id)) return {};
      const next = new Set(s.hiddenDiscardCardIds);
      next.delete(id);
      return { hiddenDiscardCardIds: next };
    }),
  setPlayOrigin: (cardId, pt) =>
    set(s => {
      const next = new Map(s.playOrigins);
      next.set(cardId, pt);
      return { playOrigins: next };
    }),
  takePlayOrigin: cardId => {
    const pt = get().playOrigins.get(cardId) ?? null;
    if (pt) {
      set(s => {
        const next = new Map(s.playOrigins);
        next.delete(cardId);
        return { playOrigins: next };
      });
    }
    return pt;
  },
}));
