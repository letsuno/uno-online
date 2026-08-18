import type { ReactNode } from 'react';
import DecoCards from './DecoCards';

interface Props {
  children: ReactNode;
  showDecoCards?: boolean;
}

export default function GamePageShell({ children, showDecoCards = true }: Props) {
  return (
    <div
      className="w-screen h-screen relative overflow-hidden flex items-center justify-center"
      style={{
        background: `
          radial-gradient(circle at 50% 42%, rgba(246, 190, 62, 0.12), transparent 30%),
          radial-gradient(circle at 50% 100%, rgba(246, 190, 62, 0.12), transparent 26%),
          linear-gradient(180deg, #0a1020 0%, #15172a 52%, #080d19 100%)
        `,
      }}
    >
      {/* Decorative ring arcs */}
      <div
        data-allow-overflow
        className="absolute pointer-events-none"
        style={{
          inset: '-20% -10% auto',
          height: '90%',
          opacity: 0.75,
          background: `
            radial-gradient(circle at 50% 50%, transparent 0 44%, rgba(246, 190, 62, 0.12) 44.3%, transparent 44.8%),
            radial-gradient(circle at 50% 50%, transparent 0 56%, rgba(255, 255, 255, 0.04) 56.2%, transparent 56.6%)
          `,
        }}
      />
      {/* Bottom glow */}
      <div
        data-allow-overflow
        className="absolute bottom-0 left-0 right-0 h-[190px] pointer-events-none"
        style={{
          opacity: 0.55,
          background: `
            radial-gradient(circle at 50% 100%, rgba(246, 190, 62, 0.42), transparent 12%),
            linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.72) 80%)
          `,
        }}
      />
      {/* Central breathing glow */}
      <div
        data-allow-overflow
        className="absolute top-[42%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full pointer-events-none animate-[breathe_6s_ease-in-out_infinite]"
        style={{
          background: 'radial-gradient(circle, rgba(246,190,62,0.08) 0%, rgba(246,190,62,0.03) 30%, transparent 60%)',
        }}
      />
      {showDecoCards && <DecoCards />}
      {children}
    </div>
  );
}
