import { useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useServerStore } from '@/shared/stores/server-store';
import { BUILD_VERSION } from '@/shared/build-info';

function getPingColor(ms: number | null | undefined) {
  if (ms == null) return { dot: '#666', text: '#64748b' };
  if (ms < 50) return { dot: '#22c55e', text: '#4ade80' };
  if (ms <= 150) return { dot: '#fbbf24', text: '#fbbf24' };
  return { dot: '#ef4444', text: '#f87171' };
}

export default function ServerStatusBar() {
  const { servers, currentServerId, serverInfoMap, latencyMap, openModal, refreshServerInfo } = useServerStore();
  const current = servers.find((s) => s.id === currentServerId);
  const info = serverInfoMap[currentServerId];
  const latency = latencyMap[currentServerId];
  const ping = getPingColor(latency);

  useEffect(() => {
    refreshServerInfo(currentServerId);
    const id = setInterval(() => refreshServerInfo(currentServerId), 30_000);
    return () => clearInterval(id);
  }, [currentServerId, refreshServerInfo]);

  return (
    <button
      onClick={openModal}
      className="absolute bottom-6 left-8 z-[5] flex items-center gap-3 px-3.5 py-2 rounded-[14px] bg-white/[0.02] border border-white/[0.04] cursor-pointer transition-all hover:bg-white/[0.04] hover:border-white/[0.08]"
    >
      <span className="flex items-center gap-1.5 text-xs text-[#64748b] font-medium">
        <Globe size={12} /> {info?.name ?? current?.name ?? '服务器'}
      </span>
      <span className="w-px h-3.5 bg-white/[0.06]" />
      <span className="flex items-center gap-[5px] text-[11px]">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: ping.dot, boxShadow: `0 0 6px ${ping.dot}60` }}
        />
        <span style={{ color: ping.text }} className="font-medium">
          {latency != null ? `${latency}ms` : '--'}
        </span>
      </span>
      <span className="w-px h-3.5 bg-white/[0.06]" />
      <span className="text-[11px] text-[#334155]">v{BUILD_VERSION}</span>
    </button>
  );
}
