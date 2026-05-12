import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Music, X, Play, Square } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { bgm } from '@/shared/sound/bgm-engine';
import { PLAYLISTS } from '@/shared/sound/songs/index';

const TABS = [
  { key: 'game' as const, label: '游戏曲目' },
  { key: 'lobby' as const, label: '大厅曲目' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  currentScene: string;
}

export default function MusicHallModal({ open, onClose, currentScene }: Props) {
  const [tab, setTab] = useState<'game' | 'lobby'>('game');
  const [playing, setPlaying] = useState<string | null>(null);

  const songs = PLAYLISTS[tab] ?? [];

  const play = (scene: string, index: number) => {
    const key = `${scene}:${index}`;
    if (playing === key) {
      bgm.start(currentScene);
      setPlaying(null);
    } else {
      bgm.playSingle(scene, index);
      setPlaying(key);
    }
  };

  const close = () => {
    if (playing) bgm.start(currentScene);
    setPlaying(null);
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-modal flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950"
        >
          <div className="flex items-center justify-between px-6 py-5 shrink-0">
            <div className="flex items-center gap-3 text-xl sm:text-2xl font-bold font-game text-foreground">
              <Music size={24} className="text-accent" /> 音乐厅
            </div>
            <button onClick={close} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex justify-center gap-1 px-6 mb-4 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-6 py-2.5 rounded-lg text-sm font-bold transition-all',
                  tab === t.key
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                )}
              >
                {t.label}
                <span className="ml-1.5 text-xs opacity-50">({(PLAYLISTS[t.key] ?? []).length})</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-2 scrollbar-thin">
            <div className="max-w-2xl mx-auto grid gap-2 sm:grid-cols-2">
              {songs.map((song, i) => {
                const key = `${tab}:${i}`;
                const isPlaying = playing === key;
                return (
                  <motion.button
                    key={key}
                    layout
                    onClick={() => play(tab, i)}
                    className={cn(
                      'flex items-center gap-4 rounded-xl px-5 py-4 text-left transition-all w-full',
                      isPlaying
                        ? 'bg-accent/10 border border-accent/25'
                        : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06]',
                    )}
                  >
                    <div className={cn(
                      'flex items-center justify-center w-11 h-11 rounded-full shrink-0 transition-colors',
                      isPlaying ? 'bg-accent text-white' : 'bg-white/10 text-muted-foreground',
                    )}>
                      {isPlaying ? <Square size={14} /> : <Play size={14} className="ml-0.5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-bold truncate', isPlaying && 'text-accent')}>
                          {song.name}
                        </span>
                        <span className="text-2xs text-muted-foreground shrink-0">— {song.meta.author}</span>
                        {isPlaying && (
                          <span className="flex gap-0.5 shrink-0">
                            {[0, 1, 2].map((j) => (
                              <motion.span
                                key={j}
                                className="inline-block w-0.5 bg-accent rounded-full"
                                animate={{ height: [4, 14, 4] }}
                                transition={{ duration: 0.6, repeat: Infinity, delay: j * 0.15 }}
                              />
                            ))}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{song.bpm} BPM</span>
                        <span className="opacity-30">·</span>
                        <span>{song.meta.key}</span>
                        <span className="opacity-30">·</span>
                        <span>{song.meta.style}</span>
                        <span className="opacity-30">·</span>
                        <span>{song.meta.wave}</span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 px-6 py-4">
            <p className="text-center text-xs text-muted-foreground/60">
              点击曲目试听 · 关闭后自动恢复背景音乐
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
