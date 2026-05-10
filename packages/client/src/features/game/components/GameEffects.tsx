import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, RotateCcw, Trophy, ShieldAlert, ShieldX, Megaphone, Hand } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { playSound } from '@/shared/sound/sound-manager';
import { cn } from '@/shared/lib/utils';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants/avatars';
import CardBack from './CardBack';

interface Effect {
  id: string;
  type: 'uno_call' | 'skip' | 'reverse' | 'draw' | 'victory' | 'catch_uno' | 'challenge';
  text: string;
  targetName?: string;
  targetIndex?: number;
  targetAvatarUrl?: string | null;
  catcherName?: string;
  catcherIndex?: number;
  catcherAvatarUrl?: string | null;
  penaltyName?: string;
  penaltyIndex?: number;
  penaltyAvatarUrl?: string | null;
  penaltyCount?: number;
}

const EFFECT_DURATION = 1000;

let effectId = 0;

function EffectAvatar({ index, avatarUrl, name }: { index: number; avatarUrl?: string | null; name?: string }) {
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const emoji = AVATAR_EMOJIS[index % AVATAR_EMOJIS.length];
  return (
    <div
      className="relative w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0 shadow-lg ring-2 ring-white/30 overflow-hidden"
      style={{ background: bg }}
    >
      <span>{emoji}</span>
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt={name ?? ''}
          className="absolute inset-0 w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
    </div>
  );
}

export default function GameEffects() {
  const [effects, setEffects] = useState<Effect[]>([]);
  const phase = useGameStore((s) => s.phase);
  const winnerId = useGameStore((s) => s.winnerId);
  const players = useGameStore((s) => s.players);
  const userId = useEffectiveUserId();
  const discardPile = useGameStore((s) => s.discardPile);
  const direction = useGameStore((s) => s.direction);
  const lastAction = useGameStore((s) => s.lastAction);
  const pendingDrawPlayerId = useGameStore((s) => s.pendingDrawPlayerId);
  const prevTopCardRef = useRef<string | undefined>();
  const prevActionRef = useRef<typeof lastAction>(null);

  const addEffect = (type: Effect['type'], text: string, targetName?: string, targetIndex?: number, targetAvatarUrl?: string | null) => {
    const id = `effect_${++effectId}`;
    setEffects((prev) => [...prev, { id, type, text, targetName, targetIndex, targetAvatarUrl }]);
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== id));
    }, EFFECT_DURATION);
  };

  const findPlayerIndex = (id: string) => players.findIndex((p) => p.id === id);

  const getNextPlayerFromActor = () => {
    if (lastAction?.type !== 'PLAY_CARD') return null;
    const actorIdx = findPlayerIndex(lastAction.playerId);
    if (actorIdx < 0 || players.length === 0) return null;

    const step = direction === 'clockwise' ? 1 : -1;
    const targetIdx = ((actorIdx + step) % players.length + players.length) % players.length;
    const target = players[targetIdx];
    return target ? { player: target, index: targetIdx } : null;
  };

  const topCard = discardPile[discardPile.length - 1];

  useEffect(() => {
    if (!topCard || topCard.id === prevTopCardRef.current) return;
    prevTopCardRef.current = topCard.id;

    const affected = getNextPlayerFromActor();

    if (topCard.type === 'skip') {
      addEffect('skip', '跳过!', affected?.player.name, affected?.index, affected?.player.avatarUrl);
      playSound('skip');
    } else if (topCard.type === 'reverse') {
      if (players.length === 2) {
        addEffect('skip', '跳过!', affected?.player.name, affected?.index, affected?.player.avatarUrl);
      } else {
        addEffect('reverse', '反转!');
      }
      playSound('reverse');
    } else if (topCard.type === 'draw_two') {
      addEffect('draw', '+2!', affected?.player.name, affected?.index, affected?.player.avatarUrl);
      playSound('draw_two');
    } else if (topCard.type === 'wild_draw_four') {
      const pendingIdx = pendingDrawPlayerId ? findPlayerIndex(pendingDrawPlayerId) : -1;
      const pendingPlayer = pendingIdx >= 0 ? players[pendingIdx] : affected?.player;
      addEffect('draw', '+4!', pendingPlayer?.name, pendingIdx >= 0 ? pendingIdx : affected?.index, pendingPlayer?.avatarUrl);
      playSound('wild');
    } else if (topCard.type === 'wild') {
      playSound('wild');
    }
  }, [topCard?.id, lastAction, players, direction, pendingDrawPlayerId]);

  useEffect(() => {
    if (phase === 'round_end' || phase === 'game_over') {
      const winner = players.find((p) => p.id === winnerId);
      if (winner) {
        const winnerIdx = findPlayerIndex(winner.id);
        addEffect('victory', winner.id === userId ? '你赢了!' : `${winner.name} 获胜!`, winner.name, winnerIdx >= 0 ? winnerIdx : undefined, winner.avatarUrl);
        playSound(winner.id === userId ? 'win' : 'lose');
      }
    }
  }, [phase]);

  useEffect(() => {
    if (!lastAction || lastAction === prevActionRef.current) return;
    prevActionRef.current = lastAction;

    if (lastAction.type === 'CHALLENGE' && lastAction.succeeded !== undefined) {
      const challenger = players.find((p) => p.id === lastAction.playerId);
      const challengerIdx = findPlayerIndex(lastAction.playerId);

      const penaltyId = lastAction.penaltyPlayerId ?? (lastAction.succeeded ? undefined : lastAction.playerId);
      const penaltyCount = lastAction.penaltyCount ?? (lastAction.succeeded ? 4 : 6);
      const penaltyPlayer = penaltyId ? players.find((p) => p.id === penaltyId) : undefined;
      const penaltyIdx = penaltyId ? findPlayerIndex(penaltyId) : -1;

      const id = `effect_${++effectId}`;
      const effect: Effect = {
        id,
        type: 'challenge',
        text: lastAction.succeeded ? '质疑成功!' : '质疑失败!',
        targetName: challenger?.name,
        targetIndex: challengerIdx >= 0 ? challengerIdx : undefined,
        targetAvatarUrl: challenger?.avatarUrl,
        penaltyName: penaltyPlayer?.name,
        penaltyIndex: penaltyIdx >= 0 ? penaltyIdx : undefined,
        penaltyAvatarUrl: penaltyPlayer?.avatarUrl,
        penaltyCount,
      };
      setEffects((prev) => [...prev, effect]);
      setTimeout(() => {
        setEffects((prev) => prev.filter((e) => e.id !== id));
      }, EFFECT_DURATION);
    } else if (lastAction.type === 'CALL_UNO') {
      const caller = players.find((p) => p.id === lastAction.playerId);
      const callerIdx = findPlayerIndex(lastAction.playerId);

      const id = `effect_${++effectId}`;
      const effect: Effect = {
        id,
        type: 'uno_call',
        text: 'UNO!',
        targetName: caller?.name,
        targetIndex: callerIdx >= 0 ? callerIdx : undefined,
        targetAvatarUrl: caller?.avatarUrl,
      };
      setEffects((prev) => [...prev, effect]);
      setTimeout(() => {
        setEffects((prev) => prev.filter((e) => e.id !== id));
      }, EFFECT_DURATION);
      playSound('uno_call');
    } else if (lastAction.type === 'CATCH_UNO') {
      const catcher = players.find((p) => p.id === lastAction.catcherId);
      const target = players.find((p) => p.id === lastAction.targetId);
      const catcherIdx = findPlayerIndex(lastAction.catcherId);
      const targetIdx = findPlayerIndex(lastAction.targetId);

      const id = `effect_${++effectId}`;
      const effect: Effect = {
        id,
        type: 'catch_uno',
        text: '抓 UNO!',
        catcherName: catcher?.name,
        catcherIndex: catcherIdx >= 0 ? catcherIdx : undefined,
        catcherAvatarUrl: catcher?.avatarUrl,
        targetName: target?.name,
        targetIndex: targetIdx >= 0 ? targetIdx : undefined,
        targetAvatarUrl: target?.avatarUrl,
      };
      setEffects((prev) => [...prev, effect]);
      setTimeout(() => {
        setEffects((prev) => prev.filter((e) => e.id !== id));
      }, EFFECT_DURATION);
      playSound('uno_catch');
    }
  }, [lastAction, players]);

  const hasEffects = effects.length > 0;

  return (
    <>
      <AnimatePresence>
        {hasEffects && (
          <motion.div
            className="fixed inset-0 z-effects bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
      <div className={cn('fixed inset-0 z-effects flex items-center justify-center', hasEffects ? 'pointer-events-auto' : 'pointer-events-none')}>
        <AnimatePresence>
          {effects.map((effect) => (
            <motion.div
              key={effect.id}
              initial={{ scale: 0.3, opacity: 0, y: 20 }}
              animate={{ scale: 1.2, opacity: 1, y: 0 }}
              exit={{ scale: 2, opacity: 0, y: -30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className={cn(
                'absolute font-game font-black whitespace-nowrap flex flex-col items-center gap-2 text-shadow-bold text-white',
                effect.type === 'victory' ? 'text-effect-xl' : 'text-effect',
              )}
            >
              <span className="flex items-center gap-2">
                {effect.type === 'skip' && <Ban size={120} />}
                {effect.type === 'reverse' && <RotateCcw size={120} />}
                {effect.type === 'victory' && <Trophy size={140} />}
                {effect.type === 'uno_call' && <Megaphone size={120} />}
                {effect.type === 'catch_uno' && <Hand size={120} />}
                {effect.type === 'challenge' && effect.text.includes('成功') && <ShieldAlert size={120} />}
                {effect.type === 'challenge' && effect.text.includes('失败') && <ShieldX size={120} />}
                {effect.text}
              </span>
              {effect.type === 'uno_call' && effect.targetName && (
                <motion.div
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} avatarUrl={effect.targetAvatarUrl} name={effect.targetName} />}
                  <span className="text-2xl font-bold text-accent text-shadow-bold">{effect.targetName}</span>
                </motion.div>
              )}
              {effect.type === 'catch_uno' && (
                <motion.div
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center gap-3"
                >
                  {effect.catcherName && (
                    <div className="flex items-center gap-2">
                      {effect.catcherIndex !== undefined && <EffectAvatar index={effect.catcherIndex} avatarUrl={effect.catcherAvatarUrl} name={effect.catcherName} />}
                      <span className="text-2xl font-bold text-accent text-shadow-bold">{effect.catcherName}</span>
                    </div>
                  )}
                  <span className="text-2xl font-bold text-destructive text-shadow-bold">抓到</span>
                  {effect.targetName && (
                    <div className="flex items-center gap-2">
                      {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} avatarUrl={effect.targetAvatarUrl} name={effect.targetName} />}
                      <span className="text-2xl font-bold text-destructive text-shadow-bold">{effect.targetName}</span>
                    </div>
                  )}
                </motion.div>
              )}
              {effect.targetName && effect.type === 'skip' && (
                <motion.div
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} avatarUrl={effect.targetAvatarUrl} name={effect.targetName} />}
                  <span className="text-2xl font-bold text-shadow-bold">
                    <Ban size={14} className="inline mr-1" />{effect.targetName}
                  </span>
                </motion.div>
              )}
              {effect.targetName && effect.type === 'draw' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} avatarUrl={effect.targetAvatarUrl} name={effect.targetName} />}
                  <span className="text-2xl font-bold text-destructive">→ {effect.targetName}</span>
                </motion.div>
              )}
              {effect.type === 'challenge' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex flex-col items-center gap-2"
                >
                  {effect.penaltyName && effect.penaltyCount && (
                    <div className="flex items-center gap-2">
                      {effect.penaltyIndex !== undefined && <EffectAvatar index={effect.penaltyIndex} avatarUrl={effect.penaltyAvatarUrl} name={effect.penaltyName} />}
                      <span className="text-2xl font-bold text-destructive">{effect.penaltyName}</span>
                      <div className="flex items-center gap-1 ml-1">
                        <div className="flex -space-x-1.5">
                          {Array.from({ length: Math.min(effect.penaltyCount, 3) }).map((_, i) => (
                            <CardBack key={i} small />
                          ))}
                        </div>
                        <span className="text-xl font-bold text-destructive">×{effect.penaltyCount}</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
              {effect.targetName && effect.type === 'victory' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} avatarUrl={effect.targetAvatarUrl} name={effect.targetName} />}
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
