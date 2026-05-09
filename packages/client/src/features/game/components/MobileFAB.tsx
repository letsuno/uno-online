import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import BottomSheet from './BottomSheet';
import HouseRulesCard from './HouseRulesCard';
import GameLog from './GameLog';
import ChatBox from './ChatBox';
import GameRulesPanel from './GameRulesPanel';

type Panel = 'gameplay' | 'rules' | 'log' | 'chat' | null;

const FAB_BUTTONS: { panel: Exclude<Panel, null>; emoji: string; label: string }[] = [
  { panel: 'gameplay', emoji: '\u{1F3AE}', label: 'Gameplay' },
  { panel: 'rules', emoji: '\u{1F4CB}', label: 'House Rules' },
  { panel: 'log', emoji: '\u{1F4D6}', label: 'Game Log' },
  { panel: 'chat', emoji: '\u{1F4AC}', label: 'Chat' },
];

const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
  gameplay: '\u{1F3AE} 玩法介绍',
  rules: '\u{1F4CB} 本局村规',
  log: '\u{1F4D6} 游戏日记',
  chat: '\u{1F4AC} 聊天',
};

export default function MobileFAB() {
  const [activePanel, setActivePanel] = useState<Panel>(null);

  const toggle = (panel: Exclude<Panel, null>) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const close = () => setActivePanel(null);

  return (
    <>
      <div className="fixed right-3 top-1/2 -translate-y-1/2 max-h-[calc(100svh-5rem)] overflow-y-auto scrollbar-thin flex flex-col gap-2 py-1 z-fab">
        {FAB_BUTTONS.map(({ panel, emoji }) => (
          <button
            key={panel}
            onClick={() => toggle(panel)}
            className={cn(
              'w-10 h-10 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-base cursor-pointer transition-colors',
              activePanel === panel && 'bg-primary/30 border-primary',
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
      {activePanel && (
        <>
          <div className="hidden md:flex fixed right-16 top-16 bottom-4 w-[360px] max-w-[calc(100vw-6rem)] z-fab flex-col rounded-xl border border-white/15 bg-slate-950/90 backdrop-blur-xl shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 font-game font-bold text-accent">
              {PANEL_TITLES[activePanel]}
            </div>
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
              {activePanel === 'gameplay' && <GameRulesPanel />}
              {activePanel === 'rules' && <HouseRulesCard embedded />}
              {activePanel === 'log' && <GameLog embedded />}
              {activePanel === 'chat' && <ChatBox embedded />}
            </div>
          </div>
          <div className="md:hidden">
            <BottomSheet
              open={activePanel !== null}
              onClose={close}
              title={PANEL_TITLES[activePanel]}
            >
              {activePanel === 'gameplay' && <GameRulesPanel />}
              {activePanel === 'rules' && <HouseRulesCard embedded />}
              {activePanel === 'log' && <GameLog embedded />}
              {activePanel === 'chat' && <ChatBox embedded />}
            </BottomSheet>
          </div>
        </>
      )}
    </>
  );
}
