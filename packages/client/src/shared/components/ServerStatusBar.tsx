import { useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useServerStore } from '@/shared/stores/server-store';
import { BUILD_VERSION } from '@/shared/build-info';
import { getPingColor } from '@/shared/lib/ping';
import FitScaler from './FitScaler';

/** 左下角 HUD：服务器/延迟/版本。窄屏按宽度整体等比缩小，不重排。 */
export default function ServerStatusBar() {
  const { servers, currentServerId, serverInfoMap, latencyMap, openModal, refreshServerInfo } = useServerStore();
  const current = servers.find(s => s.id === currentServerId);
  const info = serverInfoMap[currentServerId];
  const latency = latencyMap[currentServerId];
  const ping = getPingColor(latency);

  useEffect(() => {
    refreshServerInfo(currentServerId);
  }, [currentServerId, refreshServerInfo]);

  return (
    <FitScaler
      mode="width"
      align="start"
      origin="left bottom"
      className="absolute bottom-7 left-8 right-[120px] z-card h-[46px] pointer-events-none"
    >
      <button
        onClick={openModal}
        className="flex items-center gap-3.5 h-[46px] px-[18px] rounded-full bg-secondary border border-border cursor-pointer transition-all hover:bg-white/[0.07] backdrop-blur-[16px] pointer-events-auto"
      >
        <span className="flex items-center gap-2 text-[13px] text-foreground/85 font-medium whitespace-nowrap">
          <Globe size={16} /> {info?.name ?? current?.name ?? '服务器'}
        </span>
        <span className="w-px h-[22px] bg-white/[0.18]" />
        <span className="flex items-center gap-[6px] text-[13px] whitespace-nowrap">
          <span
            className="w-[9px] h-[9px] rounded-full"
            style={{ background: ping.dot, boxShadow: `0 0 10px ${ping.dot}` }}
          />
          <span style={{ color: ping.text }} className="font-bold">
            {latency != null ? `${latency}ms` : '--'}
          </span>
        </span>
        <span className="w-px h-[22px] bg-white/[0.18]" />
        <span className="text-[13px] text-muted-foreground whitespace-nowrap">v{BUILD_VERSION}</span>
      </button>
    </FitScaler>
  );
}
