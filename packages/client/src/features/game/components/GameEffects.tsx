import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, RotateCcw, Trophy, ShieldAlert, ShieldX } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { playSound } from '@/shared/sound/sound-manager';
import { cn } from '@/shared/lib/utils';

interface Effect {
  id: string;
  type: 'uno_call' | 'skip' | 'reverse' | 'draw' | 'victory' | 'catch' | 'challenge';
  text: string;
  targetName?: string;
}

const EFFECT_DURATION = 1000;

let effectId = 0;

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

  const addEffect = (type: Effect['type'], text: string, targetName?: string) => {
    const id = `effect_${++effectId}`;
    setEffects((prev) => [...prev, { id, type, text, targetName }]);
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== id));
    }, EFFECT_DURATION);
  };

  const topCard = discardPile[discardPile.length - 1];

  useEffect(() => {
    if (!topCard || topCard.id === prevTopCardRef.current) return;
    prevTopCardRef.current = topCard.id;
    const skippedPlayer = players[currentPlayerIndex];
    if (topCard.type === 'skip') {
      addEffect('skip', '跳过!', skippedPlayer?.name);
      playSound('skip');
    } else if (topCard.type === 'reverse') {
      addEffect('reverse', '反转!');
      playSound('reverse');
    } else if (topCard.type === 'draw_two') {
      addEffect('draw', '+2!', skippedPlayer?.name);
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
        addEffect('victory', winner.id === userId ? '你赢了!' : `${winner.name} 获胜!`);
        playSound(winner.id === userId ? 'win' : 'lose');
      }
    }
  }, [phase]);

  useEffect(() => {
    if (!lastAction || lastAction === prevActionRef.current) return;
    prevActionRef.current = lastAction;

    if (lastAction.type === 'CHALLENGE' && lastAction.succeeded !== undefined) {
      const challenger = players.find((p) => p.id === lastAction.playerId);
      if (lastAction.succeeded) {
        addEffect('challenge', '质疑成功!', challenger?.name);
      } else {
        addEffect('challenge', '质疑失败!', challenger?.name);
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
                'absolute font-game font-black whitespace-nowrap flex flex-col items-center gap-1 text-shadow-bold text-white',
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
                <motion.span
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 40, opacity: [1, 1, 0] }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="text-lg text-effect-skip flex items-center gap-1"
                >
                  <Ban size={14} /> → {effect.targetName}
                </motion.span>
              )}
              {effect.targetName && effect.type === 'draw' && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-base text-destructive"
                >
                  → {effect.targetName}
                </motion.span>
              )}
              {effect.targetName && effect.type === 'challenge' && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-base text-slate-300"
                >
                  {effect.targetName}
                </motion.span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
