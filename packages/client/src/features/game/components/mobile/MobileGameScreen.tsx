import PlayerCompass from './PlayerCompass';
import StageCenter from './StageCenter';
import { useShortLandscape } from '../../hooks/useGameLayoutMode';

interface MobileGameScreenProps {
  onDraw: (side: 'left' | 'right') => void;
  /** 渲染在牌桌区相对容器内的覆盖层（弹幕、回合横幅） */
  children?: React.ReactNode;
}

/**
 * 移动端（strip 模式）对局主体——分区布局：
 * 对手区（固定高）+ 牌桌区（flex-1 居中）+ 操作区/手牌区（GamePage 装配）。
 * 每个分区内部居中，垂直节奏均匀，不留死区。
 */
export default function MobileGameScreen({ onDraw, children }: MobileGameScreenProps) {
  const compact = useShortLandscape();

  return (
    <>
      {/* 玩家罗盘 */}
      <div className="shrink-0 py-1.5">
        <PlayerCompass compact={compact} />
      </div>
      {/* 牌桌区（覆盖层挂这里） */}
      <div className="relative flex flex-col flex-1 min-h-0">
        <StageCenter compact={compact} onDraw={onDraw} />
        {children}
      </div>
    </>
  );
}
