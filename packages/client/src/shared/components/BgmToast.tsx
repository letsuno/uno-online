import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Music } from 'lucide-react';

interface Props {
  songName: string | null;
}

export default function BgmToast({ songName }: Props) {
  const [visible, setVisible] = useState(false);
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!songName) return;
    setDisplay(songName);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [songName]);

  return (
    <AnimatePresence>
      {visible && display && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="fixed top-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm pointer-events-none"
        >
          <Music size={12} className="text-accent shrink-0" />
          <span className="text-xs text-white/80">{display}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
