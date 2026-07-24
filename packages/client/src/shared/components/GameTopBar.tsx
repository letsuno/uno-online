import type { ReactNode } from 'react';
import UserCapsule from './UserCapsule';
import FitScaler from './FitScaler';

interface Props {
  leftControls?: ReactNode;
}

/** 顶部 HUD：左侧控件组（窄屏整体等比缩小）+ 右侧用户胶囊 */
export default function GameTopBar({ leftControls }: Props) {
  return (
    <div className="absolute top-0 left-0 right-0 px-8 py-[34px] flex justify-between items-center gap-4 z-topbar">
      <FitScaler mode="width" align="start" origin="left top" className="flex-1 min-w-0 h-14 pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto w-fit">{leftControls}</div>
      </FitScaler>
      <UserCapsule />
    </div>
  );
}
