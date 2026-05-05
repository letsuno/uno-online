import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/game-store.js';

export default function UnoCallEffect() {
  const [show, setShow] = useState(false);
  const [callerName, setCallerName] = useState('');
  const players = useGameStore((s) => s.players);

  useEffect(() => {
    const caller = players.find((p) => p.calledUno && p.handCount <= 2);
    if (caller) {
      setCallerName(caller.name);
      setShow(true);
      const timer = setTimeout(() => setShow(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [players.map((p) => p.calledUno).join(',')]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
          style={{
            position: 'fixed', top: '40%', left: '50%', transform: 'translateX(-50%)',
            zIndex: 95, pointerEvents: 'none',
            fontFamily: 'var(--font-game)', fontSize: 64, fontWeight: 900,
            color: 'var(--text-accent)', textShadow: '4px 5px 0px rgba(0,0,0,0.4)',
          }}
        >
          UNO!
        </motion.div>
      )}
    </AnimatePresence>
  );
}
