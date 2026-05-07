import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import BottomSheet from './BottomSheet';
import HouseRulesCard from './HouseRulesCard';
import GameLog from './GameLog';
import ChatBox from './ChatBox';

type Panel = 'rules' | 'log' | 'chat' | null;

const FAB_BUTTONS: { panel: Exclude<Panel, null>; emoji: string; label: string }[] = [
  { panel: 'rules', emoji: '\u{1F4CB}', label: 'House Rules' },
  { panel: 'log', emoji: '\u{1F4D6}', label: 'Game Log' },
  { panel: 'chat', emoji: '\u{1F4AC}', label: 'Chat' },
];

const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
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
    <div className="md:hidden fixed right-3 bottom-28 flex flex-col gap-2 z-fab">
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

      {activePanel && (
        <BottomSheet
          open={activePanel !== null}
          onClose={close}
          title={PANEL_TITLES[activePanel]}
        >
          {activePanel === 'rules' && <HouseRulesCard embedded />}
          {activePanel === 'log' && <GameLog embedded />}
          {activePanel === 'chat' && <ChatBox embedded />}
        </BottomSheet>
      )}
    </div>
  );
}
