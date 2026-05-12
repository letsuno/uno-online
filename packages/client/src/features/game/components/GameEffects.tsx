import { useState, useEffect, useRef, useCallback } from 'react';
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
  drawCount?: number;
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
  const topCard = useGameStore((s) => s.discardPile[s.discardPile.length - 1]);
  const direction = useGameStore((s) => s.direction);
  const lastAction = useGameStore((s) => s.lastAction);
  const pendingDrawPlayerId = useGameStore((s) => s.pendingDrawPlayerId);
  const pendingPenaltyDraws = useGameStore((s) => s.pendingPenaltyDraws);
  const drawStack = useGameStore((s) => s.drawStack);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const prevTopCardRef = useRef<string | undefined>();
  const prevActionRef = useRef<typeof lastAction>(null);
  const prevPendingPenaltyRef = useRef(0);

  const addEffect = useCallback((effect: Omit<Effect, 'id'>) => {
    const id = `effect_${++effectId}`;
    setEffects((prev) => [...prev, { id, ...effect }]);
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== id));
    }, EFFECT_DURATION);
  }, []);

  useEffect(() => {
    if (!topCard || topCard.id === prevTopCardRef.current) return;
    prevTopCardRef.current = topCard.id;

    const findIdx = (id: string) => players.findIndex((p) => p.id === id);

    const getNextFromActor = () => {
      if (lastAction?.type !== 'PLAY_CARD') return null;
      const actorIdx = findIdx(lastAction.playerId);
      if (actorIdx < 0 || players.length === 0) return null;
      const step = direction === 'clockwise' ? 1 : -1;
      const targetIdx = ((actorIdx + step) % players.length + players.length) % players.length;
      const t = players[targetIdx];
      return t ? { player: t, index: targetIdx } : null;
    };

    const getStackTarget = () => {
      const p = players[currentPlayerIndex];
      return p ? { player: p, index: currentPlayerIndex } : null;
    };

    const affected = getNextFromActor();

    if (topCard.type === 'skip') {
      addEffect({ type: 'skip', text: '跳过!', targetName: affected?.player.name, targetIndex: affected?.index, targetAvatarUrl: affected?.player.avatarUrl });
      playSound('skip');
    } else if (topCard.type === 'reverse') {
      if (players.length === 2) {
        addEffect({ type: 'skip', text: '跳过!', targetName: affected?.player.name, targetIndex: affected?.index, targetAvatarUrl: affected?.player.avatarUrl });
      } else {
        addEffect({ type: 'reverse', text: '反转!' });
      }
      playSound('reverse');
    } else if (topCard.type === 'draw_two') {
      const stacked = drawStack > 0 ? getStackTarget() : null;
      const dc = drawStack > 0 ? drawStack : 2;
      const target = stacked ?? affected;
      addEffect({ type: 'draw', text: `+${dc}!`, targetName: target?.player.name, targetIndex: target?.index, targetAvatarUrl: target?.player.avatarUrl, drawCount: dc });
      playSound('draw_two');
    } else if (topCard.type === 'wild_draw_four') {
      const stacked = drawStack > 0 ? getStackTarget() : null;
      const pendingIdx = pendingDrawPlayerId ? findIdx(pendingDrawPlayerId) : -1;
      const pendingPlayer = pendingIdx >= 0 ? players[pendingIdx] : affected?.player;
      const target = stacked ?? (pendingPlayer ? { player: pendingPlayer, index: pendingIdx >= 0 ? pendingIdx : affected?.index } : affected);
      const dc = drawStack > 0 ? drawStack : 4;
      addEffect({ type: 'draw', text: `+${dc}!`, targetName: target?.player.name, targetIndex: target?.index, targetAvatarUrl: target?.player.avatarUrl, drawCount: dc });
      playSound('wild');
    } else if (topCard.type === 'wild') {
      playSound('wild');
    } else {
      playSound('play_card');
    }
  }, [topCard?.id, lastAction, players, direction, pendingDrawPlayerId, drawStack, currentPlayerIndex, addEffect]);

  useEffect(() => {
    if (pendingPenaltyDraws > 0 && prevPendingPenaltyRef.current <= 0) {
      playSound('penalty');
    }
    prevPendingPenaltyRef.current = pendingPenaltyDraws;
  }, [pendingPenaltyDraws]);

  useEffect(() => {
    if (phase === 'round_end' || phase === 'game_over') {
      const winner = players.find((p) => p.id === winnerId);
      if (winner) {
        const winnerIdx = players.findIndex((p) => p.id === winner.id);
        addEffect({ type: 'victory', text: winner.id === userId ? '你赢了!' : `${winner.name} 获胜!`, targetName: winner.name, targetIndex: winnerIdx >= 0 ? winnerIdx : undefined, targetAvatarUrl: winner.avatarUrl });
        playSound(winner.id === userId ? 'win' : 'lose');
      }
    }
  }, [phase, players, winnerId, userId, addEffect]);

  useEffect(() => {
    if (!lastAction || lastAction === prevActionRef.current) return;
    prevActionRef.current = lastAction;

    const findIdx = (id: string) => players.findIndex((p) => p.id === id);

    if (lastAction.type === 'CHALLENGE' && lastAction.succeeded !== undefined) {
      const challenger = players.find((p) => p.id === lastAction.playerId);
      const challengerIdx = findIdx(lastAction.playerId);

      const penaltyId = lastAction.penaltyPlayerId ?? (lastAction.succeeded ? undefined : lastAction.playerId);
      const penaltyCount = lastAction.penaltyCount ?? (lastAction.succeeded ? 4 : 6);
      const penaltyPlayer = penaltyId ? players.find((p) => p.id === penaltyId) : undefined;
      const penaltyIdx = penaltyId ? findIdx(penaltyId) : -1;

      addEffect({
        type: 'challenge',
        text: lastAction.succeeded ? '质疑成功!' : '质疑失败!',
        targetName: challenger?.name,
        targetIndex: challengerIdx >= 0 ? challengerIdx : undefined,
        targetAvatarUrl: challenger?.avatarUrl,
        penaltyName: penaltyPlayer?.name,
        penaltyIndex: penaltyIdx >= 0 ? penaltyIdx : undefined,
        penaltyAvatarUrl: penaltyPlayer?.avatarUrl,
        penaltyCount,
      });
    } else if (lastAction.type === 'CALL_UNO') {
      const caller = players.find((p) => p.id === lastAction.playerId);
      const callerIdx = findIdx(lastAction.playerId);

      addEffect({
        type: 'uno_call',
        text: 'UNO!',
        targetName: caller?.name,
        targetIndex: callerIdx >= 0 ? callerIdx : undefined,
        targetAvatarUrl: caller?.avatarUrl,
      });
      playSound('uno_call');
    } else if (lastAction.type === 'CATCH_UNO') {
      const catcher = players.find((p) => p.id === lastAction.catcherId);
      const target = players.find((p) => p.id === lastAction.targetId);
      const catcherIdx = findIdx(lastAction.catcherId);
      const targetIdx = findIdx(lastAction.targetId);

      addEffect({
        type: 'catch_uno',
        text: '抓 UNO!',
        catcherName: catcher?.name ?? lastAction.catcherName ?? '观众',
        catcherIndex: catcherIdx >= 0 ? catcherIdx : undefined,
        catcherAvatarUrl: catcher?.avatarUrl,
        targetName: target?.name,
        targetIndex: targetIdx >= 0 ? targetIdx : undefined,
        targetAvatarUrl: target?.avatarUrl,
      });
      playSound('uno_catch');
    }
  }, [lastAction, players, addEffect]);

  const hasEffects = effects.length > 0;

  return (
    <>
      <AnimatePresence>
        {hasEffects && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-effects bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
      <div className="pointer-events-none fixed inset-0 z-effects flex items-center justify-center">
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
              {effect.targetName && effect.type === 'draw' && effect.drawCount && effect.drawCount > 0 && (
                <motion.div
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.16, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  <div className="flex -space-x-2">
                    {Array.from({ length: Math.min(effect.drawCount, 6) }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ x: -16, opacity: 0, rotate: -8 }}
                        animate={{ x: 0, opacity: 1, rotate: i * 4 - 8 }}
                        transition={{ delay: 0.05 + i * 0.04, duration: 0.2 }}
                      >
                        <CardBack small />
                      </motion.div>
                    ))}
                  </div>
                  <span className="text-2xl font-black text-destructive text-shadow-bold">x{effect.drawCount}</span>
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
