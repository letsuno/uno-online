import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useGameStore } from '../stores/game-store';
import type { InfoDrawerTab } from '../stores/game-store';
import HouseRulesCard from './HouseRulesCard';
import GameLog from './GameLog';
import ChatBox from './ChatBox';
import GameRulesPanel from './GameRulesPanel';

const TABS: { key: InfoDrawerTab; label: string }[] = [
  { key: 'rules', label: '玩法' },
  { key: 'house-rules', label: '村规' },
  { key: 'log', label: '日志' },
  { key: 'chat', label: '聊天' },
];

export default function InfoDrawer() {
  const open = useGameStore((s) => s.infoDrawerOpen);
  const activeTab = useGameStore((s) => s.infoDrawerTab);
  const toggleInfoDrawer = useGameStore((s) => s.toggleInfoDrawer);
  const setInfoDrawerTab = useGameStore((s) => s.setInfoDrawerTab);

  const openInfoDrawer = useGameStore((s) => s.openInfoDrawer);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'h' || e.key === 'H' || e.key === '?') {
        e.preventDefault();
        toggleInfoDrawer();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        openInfoDrawer('chat');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleInfoDrawer, openInfoDrawer]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="hidden md:flex fixed right-0 top-0 bottom-0 w-[360px] z-fab flex-col border-l border-white/15 bg-slate-950/85 backdrop-blur-xl"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-sm font-bold text-foreground">游戏信息</span>
            <button
              onClick={toggleInfoDrawer}
              className="w-7 h-7 rounded-md bg-slate-800/60 flex items-center justify-center text-slate-400 hover:text-foreground cursor-pointer transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-4 border-b border-white/10">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setInfoDrawerTab(tab.key)}
                className={cn(
                  'px-3.5 py-2 text-sm cursor-pointer transition-colors bg-transparent border-0',
                  activeTab === tab.key
                    ? 'text-blue-500 font-medium border-b-2 border-blue-500'
                    : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
            {activeTab === 'rules' && <GameRulesPanel />}
            {activeTab === 'house-rules' && <HouseRulesCard embedded />}
            {activeTab === 'log' && <GameLog embedded />}
            {activeTab === 'chat' && <ChatBox embedded />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
