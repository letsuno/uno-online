import { useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useServerStore } from '@/shared/stores/server-store';
import { BUILD_VERSION } from '@/shared/build-info';
import { getPingColor } from '@/shared/lib/ping';

export default function ServerStatusBar() {
  const { servers, currentServerId, serverInfoMap, latencyMap, openModal, refreshServerInfo } = useServerStore();
  const current = servers.find((s) => s.id === currentServerId);
  const info = serverInfoMap[currentServerId];
  const latency = latencyMap[currentServerId];
  const ping = getPingColor(latency);

  useEffect(() => {
    refreshServerInfo(currentServerId);
  }, [currentServerId, refreshServerInfo]);

  return (
    <button
      onClick={openModal}
      className="absolute bottom-7 max-sm:bottom-5 left-8 max-sm:left-5 z-[5] flex items-center gap-3.5 max-sm:gap-2 h-[46px] max-sm:h-[38px] px-[18px] max-sm:px-3 rounded-full bg-white/[0.045] border border-white/[0.12] cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/[0.18] backdrop-blur-[16px] shadow-[0_16px_40px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <span className="flex items-center gap-2 max-sm:gap-1.5 text-[13px] max-sm:text-[12px] text-[#dbe3f8] font-medium">
        <Globe size={16} className="max-sm:w-3.5 max-sm:h-3.5" /> {info?.name ?? current?.name ?? '服务器'}
      </span>
      <span className="w-px h-[22px] max-sm:h-4 bg-white/[0.18]" />
      <span className="flex items-center gap-[6px] max-sm:gap-1 text-[13px] max-sm:text-[12px]">
        <span
          className="w-[9px] h-[9px] max-sm:w-2 max-sm:h-2 rounded-full"
          style={{ background: ping.dot, boxShadow: `0 0 10px ${ping.dot}` }}
        />
        <span style={{ color: ping.text }} className="font-bold">
          {latency != null ? `${latency}ms` : '--'}
        </span>
      </span>
      <span className="w-px h-[22px] max-sm:h-4 bg-white/[0.18]" />
      <span className="text-[13px] max-sm:text-[12px] text-[#8b95b3]">v{BUILD_VERSION}</span>
    </button>
  );
}
