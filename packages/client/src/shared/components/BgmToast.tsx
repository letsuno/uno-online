import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Music } from 'lucide-react';
import type { SongInfo } from '@/shared/sound/bgm-engine';

interface Props {
  song: SongInfo | null;
}

export default function BgmToast({ song }: Props) {
  const [visible, setVisible] = useState(false);
  const [display, setDisplay] = useState<SongInfo | null>(null);

  useEffect(() => {
    if (!song) return;
    setDisplay(song);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [song]);

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
          <span className="text-xs text-white/80">{display.name}</span>
          <span className="text-2xs text-white/40">— {display.meta.author}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
