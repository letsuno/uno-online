import type { ReactNode } from 'react';
import UserCapsule from './UserCapsule';

interface Props {
  leftControls?: ReactNode;
}

export default function GameTopBar({ leftControls }: Props) {
  return (
    <div className="absolute top-0 left-0 right-0 px-8 py-6 flex justify-between items-center z-10">
      <div className="flex items-center gap-2">
        {leftControls}
      </div>
      <UserCapsule />
    </div>
  );
}
