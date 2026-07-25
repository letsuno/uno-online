import { useState } from 'react';
import BottomSheet from '../BottomSheet';
import { Tabs } from '@/shared/components/ui/Tabs';
import GameRulesPanel from '../GameRulesPanel';
import PlayerListTab from './PlayerListTab';
import HouseRulesCard from '../HouseRulesCard';
import GameLog from '../GameLog';
import ChatBox from '../ChatBox';

const TABS = [
  { key: 'players', label: '玩家' },
  { key: 'rules', label: '玩法' },
  { key: 'house', label: '村规' },
  { key: 'log', label: '日志' },
  { key: 'chat', label: '聊天' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface InfoSheetProps {
  open: boolean;
  onClose: () => void;
}

/** 移动端信息面板：玩法/村规/日志/聊天 四合一 BottomSheet（替代 FAB 四件套） */
export default function InfoSheet({ open, onClose }: InfoSheetProps) {
  const [tab, setTab] = useState<TabKey>('players');

  return (
    <BottomSheet open={open} onClose={onClose} title="游戏信息">
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="px-4" />
      <div className="overflow-y-auto scrollbar-thin px-4 py-3 max-h-[50vh]">
        {tab === 'players' && <PlayerListTab />}
        {tab === 'rules' && <GameRulesPanel />}
        {tab === 'house' && <HouseRulesCard embedded />}
        {tab === 'log' && <GameLog embedded />}
        {tab === 'chat' && <ChatBox embedded />}
      </div>
    </BottomSheet>
  );
}
