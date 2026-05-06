import { useState } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import { playSound } from '../sound/sound-manager.js';
import '../styles/game.css';

interface GameActionsProps {
  onCallUno: () => void;
  onCatchUno: (targetId: string) => void;
  onChallenge: () => void;
  onAccept: () => void;
  onPass: () => void;
  onSwapTarget: (targetId: string) => void;
}

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
    <div className="game-actions">
      {me && me.hand.length <= 2 && !me.calledUno && (
        <button className="btn-primary" onClick={withCooldown(onCallUno)} disabled={cooldown}>喊 UNO!</button>
      )}
      {catchTargets.map((t) => (
        <button key={t.id} className="btn-danger" onClick={withCooldown(() => { playSound('uno_catch'); onCatchUno(t.id); })} disabled={cooldown}>抓 {t.name}!</button>
      ))}
      {phase === 'challenging' && pendingDrawPlayerId === userId && (
        <>
          {!noChallengeWD4 && <button className="btn-danger" onClick={onChallenge}>质疑!</button>}
          <button className="btn-secondary" onClick={onAccept}>接受</button>
        </>
      )}
      {isMyTurn && hasDrawnThisTurn && phase === 'playing' && (
        <button className="btn-secondary" onClick={onPass}>跳过</button>
      )}
      {phase === 'choosing_swap_target' && isMyTurn && (
        <>
          <span style={{ color: 'var(--text-accent)', fontSize: 13, fontFamily: 'var(--font-game)' }}>选择交换对象:</span>
          {players.filter(p => p.id !== userId).map(p => (
            <button key={p.id} className="btn-primary" onClick={() => onSwapTarget(p.id)} style={{ fontSize: 13 }}>
              {p.name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
