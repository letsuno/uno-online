import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { IconButton } from '@/shared/components/ui/IconButton';
import { Tabs } from '@/shared/components/ui/Tabs';
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
  const open = useGameStore(s => s.infoDrawerOpen);
  const activeTab = useGameStore(s => s.infoDrawerTab);
  const toggleInfoDrawer = useGameStore(s => s.toggleInfoDrawer);
  const setInfoDrawerTab = useGameStore(s => s.setInfoDrawerTab);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="hidden md:block fixed inset-0 z-fab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleInfoDrawer}
          />
          <motion.div
            className="flex fixed right-0 top-0 bottom-0 w-[360px] z-fab flex-col glass-panel !rounded-none"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-sm font-bold text-foreground">游戏信息</span>
              <IconButton size="sm" onClick={toggleInfoDrawer} title="关闭" className="w-7 h-7">
                <X size={14} />
              </IconButton>
            </div>

            {/* Tabs */}
            <Tabs tabs={TABS} active={activeTab} onChange={setInfoDrawerTab} className="px-4" />

            {/* Content */}
            <div
              className={cn(
                'flex-1 min-h-0 p-4',
                activeTab === 'chat' ? 'flex flex-col' : 'overflow-y-auto scrollbar-thin',
              )}
            >
              {activeTab === 'rules' && <GameRulesPanel />}
              {activeTab === 'house-rules' && <HouseRulesCard embedded />}
              {activeTab === 'log' && <GameLog embedded />}
              {activeTab === 'chat' && <ChatBox embedded />}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
