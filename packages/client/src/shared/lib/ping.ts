export interface PingColor {
  /** 状态圆点颜色 */
  dot: string;
  /** 延迟文本颜色 */
  text: string;
}

/**
 * 统一的延迟配色：未知 → 灰，<50ms → 绿，≤150ms → 黄，更高 → 红。
 * ServerStatusBar / ServerSelectModal / TopBar 共用，避免各处阈值和色值漂移。
 */
export function getPingColor(ms: number | null | undefined): PingColor {
  if (ms == null) return { dot: '#666666', text: '#64748b' };
  if (ms < 50) return { dot: '#22c55e', text: '#4ade80' };
  if (ms <= 150) return { dot: '#fbbf24', text: '#fbbf24' };
  return { dot: '#ef4444', text: '#f87171' };
}
