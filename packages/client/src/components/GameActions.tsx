import { useState } from 'react';
import { useGameStore } from '../stores/game-store';
import { useAuthStore } from '../stores/auth-store';
import { playSound } from '../sound/sound-manager';

interface GameActionsProps {
  onCallUno: () => void;
  onCatchUno: (targetId: string) => void;
  onChallenge: () => void;
  onAccept: () => void;
  onPass: () => void;
  onSwapTarget: (targetId: string) => void;
}

const btnPrimary = 'bg-primary text-primary-foreground px-6 py-2.5 rounded-3xl text-base font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)] transition-transform duration-150 hover:scale-105 active:scale-[0.97]';
const btnDanger = 'bg-destructive text-white px-5 py-2 rounded-[20px] text-sm font-bold shadow-[3px_4px_0px_rgba(0,0,0,0.2)]';
const btnSecondary = 'bg-secondary text-foreground px-5 py-2 rounded-[20px] text-sm border border-white/20';

export default function GameActions({ onCallUno, onCatchUno, onChallenge, onAccept, onPass, onSwapTarget }: GameActionsProps) {
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const pendingDrawPlayerId = useGameStore((s) => s.pendingDrawPlayerId);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const settings = useGameStore((s) => s.settings);
  const [cooldown, setCooldown] = useState(false);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const catchTargets = players.filter((p) => p.id !== userId && p.handCount === 1 && !p.calledUno);
  const noChallengeWD4 = settings?.houseRules?.noChallengeWildFour ?? false;

  const withCooldown = (fn: () => void) => () => {
    if (cooldown) return;
    setCooldown(true);
    fn();
    setTimeout(() => setCooldown(false), 1000);
  };

  return (
    <div className="flex justify-center gap-2.5 py-2">
      {me && me.hand.length <= 2 && !me.calledUno && (
        <button className={btnPrimary} onClick={withCooldown(onCallUno)} disabled={cooldown}>喊 UNO!</button>
      )}
      {catchTargets.map((t) => (
        <button key={t.id} className={btnDanger} onClick={withCooldown(() => { playSound('uno_catch'); onCatchUno(t.id); })} disabled={cooldown}>抓 {t.name}!</button>
      ))}
      {phase === 'challenging' && pendingDrawPlayerId === userId && (
        <>
          {!noChallengeWD4 && <button className={btnDanger} onClick={onChallenge}>质疑!</button>}
          <button className={btnSecondary} onClick={onAccept}>接受</button>
        </>
      )}
      {isMyTurn && hasDrawnThisTurn && phase === 'playing' && (
        <button className={btnSecondary} onClick={onPass}>跳过</button>
      )}
      {phase === 'choosing_swap_target' && isMyTurn && (
        <>
          <span className="text-accent text-[13px] font-game">选择交换对象:</span>
          {players.filter(p => p.id !== userId).map(p => (
            <button key={p.id} className={`${btnPrimary} !text-[13px]`} onClick={() => onSwapTarget(p.id)}>
              {p.name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
