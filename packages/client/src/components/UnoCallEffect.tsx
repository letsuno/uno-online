import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/game-store';

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
          className="fixed top-[40%] left-1/2 -translate-x-1/2 z-[95] pointer-events-none font-game text-[64px] font-black text-accent [text-shadow:4px_5px_0px_rgba(0,0,0,0.4)]"
        >
          UNO!
        </motion.div>
      )}
    </AnimatePresence>
  );
}
