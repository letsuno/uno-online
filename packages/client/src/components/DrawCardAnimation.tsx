import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack.js';

/**
 * Overlay animation: a card-back flies from the draw pile area
 * down toward the player's hand whenever a draw event fires.
 */
export default function DrawCardAnimation({ trigger }: { trigger: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;
    setShow(true);
    const timer = setTimeout(() => setShow(false), 450);
    return () => clearTimeout(timer);
  }, [trigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={trigger}
          initial={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          animate={{ opacity: 0, y: 220, x: 0, scale: 0.7 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeIn' }}
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            marginLeft: -35,
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          <CardBack />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
