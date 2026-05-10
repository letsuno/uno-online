import { useState } from 'react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import { Button } from '@/shared/components/ui/Button';

interface GameActionsProps {
  onCallUno: () => void;
  onCatchUno: (targetId: string) => void;
  onChallenge: () => void;
  onAccept: () => void;
  onPass: () => void;
  onSwapTarget: (targetId: string) => void;
}

export default function GameActions({ onCallUno, onCatchUno, onChallenge, onAccept, onPass, onSwapTarget }: GameActionsProps) {
  const userId = useEffectiveUserId();
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const pendingDrawPlayerId = useGameStore((s) => s.pendingDrawPlayerId);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const settings = useGameStore((s) => s.settings);
  const [cooldown, setCooldown] = useState(false);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = useIsMyTurn();
  const canCallUno = me && me.hand.length >= 1 && me.hand.length <= 2 && !me.calledUno;
  const catchTargets = players.filter((p) => p.id !== userId && p.handCount === 1 && !p.calledUno && !p.unoCaught);
  const noChallengeWD4 = settings?.houseRules?.noChallengeWildFour ?? false;
  const playableIds = usePlayableCardIds();
  const mustDrawUntilPlayable = Boolean(settings?.houseRules?.drawUntilPlayable || settings?.houseRules?.deathDraw);
  const canPassAfterDraw = hasDrawnThisTurn && (!mustDrawUntilPlayable || playableIds.size > 0);

  const withCooldown = (fn: () => void) => () => {
    if (cooldown) return;
    setCooldown(true);
    fn();
    setTimeout(() => setCooldown(false), 1000);
  };

  return (
    <div className="relative z-actions flex justify-center gap-2.5 py-2 pointer-events-auto">
      {canCallUno && (
        <Button variant="primary" onClick={withCooldown(onCallUno)} disabled={cooldown}>喊 UNO!</Button>
      )}
      {catchTargets.map((t) => (
        <Button key={t.id} variant="danger" onClick={withCooldown(() => onCatchUno(t.id))} disabled={cooldown}>抓 {t.name}!</Button>
      ))}
      {phase === 'challenging' && pendingDrawPlayerId === userId && (
        <>
          {!noChallengeWD4 && <Button variant="danger" onClick={onChallenge}>质疑!</Button>}
          <Button variant="secondary" onClick={onAccept}>接受</Button>
        </>
      )}
      {isMyTurn && canPassAfterDraw && phase === 'playing' && (
        <Button variant="secondary" onClick={onPass}>跳过</Button>
      )}
      {phase === 'choosing_swap_target' && isMyTurn && (
        <>
          <span className="text-accent text-caption font-game">选择交换对象:</span>
          {players.filter(p => p.id !== userId).map(p => (
            <Button key={p.id} variant="primary" className="!text-caption" onClick={() => onSwapTarget(p.id)}>
              {p.name}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}
