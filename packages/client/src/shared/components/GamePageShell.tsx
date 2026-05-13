import type { ReactNode } from 'react';
import DecoCards from './DecoCards';

interface Props {
  children: ReactNode;
  showDecoCards?: boolean;
}

export default function GamePageShell({ children, showDecoCards = true }: Props) {
  return (
    <div className="w-screen h-screen relative overflow-hidden flex items-center justify-center">
      <div
        className="absolute top-[42%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full pointer-events-none animate-[breathe_6s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.06) 0%, rgba(251,191,36,0.02) 30%, transparent 60%)' }}
      />
      {showDecoCards && <DecoCards />}
      {children}
    </div>
  );
}
