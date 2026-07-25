import { useState } from 'react';
import OpponentRow from './OpponentRow';
import TableCenter from './TableCenter';
import OpponentSheet from './OpponentSheet';

interface MobileGameScreenProps {
  onDraw: (side: 'left' | 'right') => void;
  /** 渲染在中央区相对容器内的覆盖层（弹幕、回合横幅） */
  children?: React.ReactNode;
}

/**
 * 移动端（strip 模式）对局主体：
 * 对手栏（可点互动）+ 中央牌区（FitScaler 按高度缩放）。
 * 顶栏由 GameHUD、底部由 GameActions/PlayerHand 提供（GamePage 统一装配）。
 */
export default function MobileGameScreen({ onDraw, children }: MobileGameScreenProps) {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <>
      <OpponentRow onSelect={(id, name) => setTarget({ id, name })} />
      <div className="relative flex flex-col flex-1 min-h-0">
        <TableCenter onDraw={onDraw} />
        {children}
      </div>
      <OpponentSheet target={target} onClose={() => setTarget(null)} />
    </>
  );
}
