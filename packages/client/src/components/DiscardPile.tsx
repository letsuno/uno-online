import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';

/**
 * Compute the initial animation offset based on the seat position
 * of the player who played the card.
 * Self (bottom) → handled by layoutId shared animation.
 * Opponents → fly from their approximate screen direction.
 */
function getPlayOrigin(
  playerId: string | undefined,
  players: { id: string }[],
  selfId: string | undefined,
): { x: number; y: number } {
  if (!playerId || playerId === selfId) return { x: 0, y: 120 }; // self: from bottom
  const opponents = players.filter((p) => p.id !== selfId);
  const idx = opponents.findIndex((p) => p.id === playerId);
  if (idx < 0) return { x: 0, y: -120 };
  const count = opponents.length;
  const arcStart = -150 * (Math.PI / 180);
  const arcEnd = 150 * (Math.PI / 180);
  const angle = count === 1 ? 0 : arcStart + ((arcEnd - arcStart) / (count - 1)) * idx;
  // Map angle to screen offset (sin = horizontal, -cos = vertical from top)
  return { x: Math.sin(angle) * 200, y: -Math.cos(angle) * 160 };
}

export default function DiscardPile() {
  const discardPile = useGameStore((s) => s.discardPile);
  const drawStack = useGameStore((s) => s.drawStack);
  const lastAction = useGameStore((s) => s.lastAction);
  const players = useGameStore((s) => s.players);
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const selfId = viewerId ?? authUserId;
  const topCard = discardPile[discardPile.length - 1];
  if (!topCard) return null;

  const playedBy = lastAction?.type === 'PLAY_CARD' ? lastAction.playerId : undefined;
  const origin = getPlayOrigin(playedBy, players, selfId);
  const isSelf = playedBy === selfId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1, position: 'relative' }}>
      <div style={{ position: 'relative', width: 70, height: 100 }}>
      <AnimatePresence>
        <motion.div
          key={topCard.id}
          layoutId={isSelf ? topCard.id : undefined}
          initial={{ opacity: 0, x: origin.x, y: origin.y, scale: 0.6 }}
          animate={{ scale: 1, rotate: 3, opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.15 } }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <Card card={topCard} />
        </motion.div>
      </AnimatePresence>
      </div>
      {drawStack > 0 && (
        <motion.div
          key={`stack-${drawStack}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            position: 'absolute', top: -12, right: -12,
            background: 'var(--color-red)', color: '#fff',
            borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 14, fontFamily: 'var(--font-game)',
            border: '2px solid #fff',
            boxShadow: '2px 3px 0px rgba(0,0,0,0.3)',
          }}
        >
          +{drawStack}
        </motion.div>
      )}
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>弃牌堆</span>
    </div>
  );
}
