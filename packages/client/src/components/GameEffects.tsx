import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, RotateCcw, Trophy } from 'lucide-react';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import { playSound } from '../sound/sound-manager.js';

interface Effect {
  id: string;
  type: 'uno_call' | 'skip' | 'reverse' | 'draw' | 'victory' | 'catch';
  text: string;
  targetName?: string;
}

let effectId = 0;

export default function GameEffects() {
  const [effects, setEffects] = useState<Effect[]>([]);
  const phase = useGameStore((s) => s.phase);
  const winnerId = useGameStore((s) => s.winnerId);
  const players = useGameStore((s) => s.players);
  const userId = useAuthStore((s) => s.user?.id);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const prevTopCardRef = useRef<string | undefined>();

  const addEffect = (type: Effect['type'], text: string, targetName?: string) => {
    const id = `effect_${++effectId}`;
    setEffects((prev) => [...prev, { id, type, text, targetName }]);
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== id));
    }, 1500);
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

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AnimatePresence>
        {effects.map((effect) => (
          <motion.div
            key={effect.id}
            initial={{ scale: 0.3, opacity: 0, y: 20 }}
            animate={{ scale: 1.2, opacity: 1, y: 0 }}
            exit={{ scale: 2, opacity: 0, y: -30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            style={{
              position: 'absolute',
              fontFamily: 'var(--font-game)',
              fontSize: effect.type === 'victory' ? 48 : 36,
              fontWeight: 900,
              color: effect.type === 'victory' ? 'var(--text-accent)' :
                     effect.type === 'draw' ? 'var(--color-red)' :
                     effect.type === 'skip' ? '#ff6b6b' :
                     effect.type === 'reverse' ? 'var(--color-blue)' : 'var(--text-accent)',
              textShadow: '3px 4px 0px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {effect.type === 'skip' && <Ban size={32} />}
              {effect.type === 'reverse' && <RotateCcw size={32} />}
              {effect.type === 'victory' && <Trophy size={36} />}
              {effect.text}
            </span>
            {effect.targetName && effect.type === 'skip' && (
              <motion.span
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 40, opacity: [1, 1, 0] }}
                transition={{ duration: 1, ease: 'easeOut' }}
                style={{ fontSize: 18, color: '#ff6b6b', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Ban size={14} /> → {effect.targetName}
              </motion.span>
            )}
            {effect.targetName && effect.type === 'draw' && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ fontSize: 16, color: 'var(--color-red)' }}
              >
                → {effect.targetName}
              </motion.span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
