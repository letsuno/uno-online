import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack';

interface DrawCardAnimationProps {
  trigger: number;
  targetX?: number;
  targetY?: number;
}

export default function DrawCardAnimation({ trigger, targetX = 0, targetY = 220 }: DrawCardAnimationProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;
    setShow(true);
    const timer = setTimeout(() => setShow(false), 700);
    return () => clearTimeout(timer);
  }, [trigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={trigger}
          initial={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          animate={{ opacity: 0, y: targetY, x: targetX, scale: 0.7 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.62, ease: 'easeInOut' }}
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
