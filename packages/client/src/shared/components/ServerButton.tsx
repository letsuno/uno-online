import { useServerStore } from '../stores/server-store';

export function ServerButton() {
  const { servers, currentServerId, latencyMap, openModal } = useServerStore();
  const current = servers.find(s => s.id === currentServerId);
  const latency = latencyMap[currentServerId];
  const isOnline = latency !== null && latency !== undefined;

  return (
    <button
      onClick={openModal}
      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/10"
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: isOnline ? '#4ade80' : '#ef4444' }}
      />
      <span>{current?.name ?? '服务器'}</span>
    </button>
  );
}
