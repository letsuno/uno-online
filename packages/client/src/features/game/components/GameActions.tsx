import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import { useCooldown } from '../hooks/useCooldown';
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
  const pendingPenaltyDraws = useGameStore((s) => s.pendingPenaltyDraws);
  const drawStack = useGameStore((s) => s.drawStack);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const settings = useGameStore((s) => s.settings);
  const { cooldown, withCooldown } = useCooldown();

  const me = players.find((p) => p.id === userId);
  const isMyTurn = useIsMyTurn();
  const strictUnoCall = settings?.houseRules?.strictUnoCall ?? false;
  const playableIds = usePlayableCardIds();
  const ownHandCount = me?.handCount ?? me?.hand.length ?? 0;
  const knownHandCount = me?.hand.length ?? 0;
  const canCallUno = me && !me.calledUno && !me.unoCaught && pendingPenaltyDraws === 0 && (
    (ownHandCount === 1 && knownHandCount === 1) ||
    (!strictUnoCall && ownHandCount === 2 && knownHandCount === 2 && isMyTurn && playableIds.size > 0)
  );
  const catchTargets = players.filter((p) => p.id !== userId && p.handCount === 1 && !p.calledUno && !p.unoCaught);
  const noChallengeWD4 = settings?.houseRules?.noChallengeWildFour ?? false;
  const deckLeftCount = useGameStore((s) => s.deckLeftCount);
  const deckRightCount = useGameStore((s) => s.deckRightCount);
  const discardPileLength = useGameStore((s) => s.discardPile.length);
  const noCardsAvailable = deckLeftCount === 0 && deckRightCount === 0 && discardPileLength <= 1;
  const mustDrawUntilPlayable = Boolean(settings?.houseRules?.drawUntilPlayable || settings?.houseRules?.deathDraw);
  const canPassAfterDraw = pendingPenaltyDraws === 0 && drawStack === 0 && hasDrawnThisTurn && (!mustDrawUntilPlayable || playableIds.size > 0);
  const canPass = canPassAfterDraw || noCardsAvailable;

  return (
    <div className="relative z-actions flex justify-center gap-2.5 py-2 pointer-events-auto">
      {canCallUno && (
        <Button variant="primary" onClick={withCooldown(onCallUno)} disabled={cooldown} sound="action">喊 UNO!</Button>
      )}
      {catchTargets.map((t) => (
        <Button key={t.id} variant="danger" onClick={withCooldown(() => onCatchUno(t.id))} disabled={cooldown} sound="danger">抓 {t.name}!</Button>
      ))}
      {phase === 'challenging' && pendingDrawPlayerId === userId && (
        <>
          {!noChallengeWD4 && <Button variant="danger" onClick={onChallenge} sound="action">质疑!</Button>}
          <Button variant="secondary" onClick={onAccept} sound="action">接受</Button>
        </>
      )}
      {isMyTurn && canPass && phase === 'playing' && (
        <Button variant="secondary" onClick={onPass} sound="click">跳过</Button>
      )}
      {phase === 'choosing_swap_target' && isMyTurn && (
        <>
          <span className="text-accent text-caption font-game">选择交换对象:</span>
          {players.filter(p => p.id !== userId).map(p => (
            <Button key={p.id} variant="primary" className="!text-caption" onClick={() => onSwapTarget(p.id)} sound="action">
              {p.name}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}
