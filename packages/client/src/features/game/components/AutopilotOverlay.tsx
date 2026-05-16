import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand, Bot } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { getSocket } from '@/shared/socket';

const COOLDOWN_MS = 3000;

export default function AutopilotOverlay() {
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const userId = useEffectiveUserId();
  const myAutopilot = players.find((p) => p.id === userId)?.autopilot ?? false;
  const [cooldown, setCooldown] = useState(false);

  const handleTakeOver = () => {
    if (cooldown) return;
    setCooldown(true);
    getSocket().emit('player:toggle-autopilot', () => {});
    setTimeout(() => setCooldown(false), COOLDOWN_MS);
  };

  const visible = myAutopilot
    && (phase === 'playing' || phase === 'choosing_color' || phase === 'challenging' || phase === 'choosing_swap_target');

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-0 inset-x-0 z-autopilot pointer-events-none"
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        >
          <div className="flex items-center justify-center gap-3 bg-black/85 backdrop-blur-lg border-t border-white/[0.08] px-5 py-3 pointer-events-auto">
            <button
              onClick={handleTakeOver}
              disabled={cooldown}
              className="flex items-center gap-2.5 rounded-lg border border-white/25 bg-white/[0.08] px-5 py-2.5 text-sm font-game text-white/90 transition-all hover:bg-white/15 hover:border-white/40 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              <Hand size={16} className="opacity-80" />
              <span>接管游戏</span>
            </button>

            <div className="h-4 w-px bg-white/15 mx-1 shrink-0" />

            <div className="flex items-center gap-5 text-xs text-white/50 min-w-0">
              <span className="inline-flex items-center gap-2 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                </span>
                <span>牌局正常运行中</span>
              </span>
              <span className="inline-flex items-center gap-2 shrink-0">
                <Bot size={13} className="text-accent/70" />
                <span>代理托管作战正常运行中</span>
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
