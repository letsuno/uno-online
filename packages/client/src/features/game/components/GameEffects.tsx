import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, RotateCcw, Trophy, ShieldAlert, ShieldX } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { playSound } from '@/shared/sound/sound-manager';
import { cn } from '@/shared/lib/utils';
import { AVATAR_COLORS, AVATAR_EMOJIS } from './PlayerNode';

interface Effect {
  id: string;
  type: 'uno_call' | 'skip' | 'reverse' | 'draw' | 'victory' | 'catch' | 'challenge';
  text: string;
  targetName?: string;
  targetIndex?: number;
}

const EFFECT_DURATION = 1000;

let effectId = 0;

function EffectAvatar({ index }: { index: number }) {
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const emoji = AVATAR_EMOJIS[index % AVATAR_EMOJIS.length];
  return (
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0 shadow-lg ring-2 ring-white/30"
      style={{ background: bg }}
    >
      {emoji}
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
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const lastAction = useGameStore((s) => s.lastAction);
  const prevTopCardRef = useRef<string | undefined>();
  const prevActionRef = useRef<typeof lastAction>(null);

  const addEffect = (type: Effect['type'], text: string, targetName?: string, targetIndex?: number) => {
    const id = `effect_${++effectId}`;
    setEffects((prev) => [...prev, { id, type, text, targetName, targetIndex }]);
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== id));
    }, EFFECT_DURATION);
  };

  const findPlayerIndex = (id: string) => players.findIndex((p) => p.id === id);

  const topCard = discardPile[discardPile.length - 1];

  useEffect(() => {
    if (!topCard || topCard.id === prevTopCardRef.current) return;
    prevTopCardRef.current = topCard.id;
    const skippedPlayer = players[currentPlayerIndex];
    if (topCard.type === 'skip') {
      addEffect('skip', '跳过!', skippedPlayer?.name, currentPlayerIndex);
      playSound('skip');
    } else if (topCard.type === 'reverse') {
      addEffect('reverse', '反转!');
      playSound('reverse');
    } else if (topCard.type === 'draw_two') {
      addEffect('draw', '+2!', skippedPlayer?.name, currentPlayerIndex);
      playSound('draw_two');
    } else if (topCard.type === 'wild_draw_four') {
      addEffect('draw', '+4!');
      playSound('wild');
    } else if (topCard.type === 'wild') {
      playSound('wild');
    }
  }, [topCard?.id]);

  useEffect(() => {
    if (phase === 'round_end' || phase === 'game_over') {
      const winner = players.find((p) => p.id === winnerId);
      if (winner) {
        const winnerIdx = findPlayerIndex(winner.id);
        addEffect('victory', winner.id === userId ? '你赢了!' : `${winner.name} 获胜!`, winner.name, winnerIdx >= 0 ? winnerIdx : undefined);
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
      if (lastAction.succeeded) {
        addEffect('challenge', '质疑成功!', challenger?.name, challengerIdx >= 0 ? challengerIdx : undefined);
      } else {
        addEffect('challenge', '质疑失败!', challenger?.name, challengerIdx >= 0 ? challengerIdx : undefined);
      }
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
                effect.type === 'victory' ? 'text-effect-xl' :
                'text-effect'
              )}
            >
              <span className="flex items-center gap-2">
                {effect.type === 'skip' && <Ban size={120} />}
                {effect.type === 'reverse' && <RotateCcw size={120} />}
                {effect.type === 'victory' && <Trophy size={140} />}
                {effect.type === 'challenge' && effect.text.includes('成功') && <ShieldAlert size={120} />}
                {effect.type === 'challenge' && effect.text.includes('失败') && <ShieldX size={120} />}
                {effect.text}
              </span>
              {effect.targetName && effect.type === 'skip' && (
                <motion.div
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} />}
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
                  {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} />}
                  <span className="text-2xl font-bold text-destructive">→ {effect.targetName}</span>
                </motion.div>
              )}
              {effect.targetName && effect.type === 'challenge' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} />}
                  <span className="text-2xl font-bold text-slate-200">{effect.targetName}</span>
                </motion.div>
              )}
              {effect.targetName && effect.type === 'victory' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  {effect.targetIndex !== undefined && <EffectAvatar index={effect.targetIndex} />}
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
