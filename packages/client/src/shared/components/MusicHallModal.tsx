import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Music, X, Play, Square, Volume2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { bgm } from '@/shared/sound/bgm-engine';
import { PLAYLISTS } from '@/shared/sound/songs/index';
import { useSettingsStore } from '@/shared/stores/settings-store';

const TABS = [
  { key: 'game' as const, label: '游戏曲目' },
  { key: 'lobby' as const, label: '大厅曲目' },
];

function SoundBars({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-end gap-[2px] h-3', className)}>
      {[0, 1, 2, 3].map((j) => (
        <motion.span
          key={j}
          className="inline-block w-[3px] bg-accent rounded-full"
          animate={{ height: [3, 12, 5, 10, 3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: j * 0.12, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentScene: string;
}

export default function MusicHallModal({ open, onClose, currentScene }: Props) {
  const [tab, setTab] = useState<'game' | 'lobby'>('game');
  const [playing, setPlaying] = useState<string | null>(null);
  const bgmVolume = useSettingsStore((s) => s.bgmVolume);
  const setBgmVolume = useSettingsStore((s) => s.setBgmVolume);

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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setBgmVolume(v);
    bgm.setVolume(v);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal glass-modal-backdrop"
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-modal flex items-center justify-center pointer-events-none"
          >
            <div
              className="pointer-events-auto flex flex-col glass-panel w-[90vw] max-w-xl h-[min(80vh,36rem)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                <div className="flex items-center gap-2.5 text-lg font-bold font-game text-foreground">
                  <Music size={20} className="text-accent" />
                  音乐厅
                  <span className="text-xs font-normal text-muted-foreground">({songs.length} 首)</span>
                </div>
                <button onClick={close} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-4 px-5 shrink-0 border-b border-white/5">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'pb-2.5 text-sm font-medium transition-all relative',
                      tab === t.key
                        ? 'text-accent'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.label}
                    {tab === t.key && (
                      <motion.div layoutId="music-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              {/* Song list */}
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 scrollbar-thin">
                <div className="flex flex-col gap-1">
                  {songs.map((song, i) => {
                    const key = `${tab}:${i}`;
                    const isPlaying = playing === key;
                    return (
                      <button
                        key={key}
                        onClick={() => play(tab, i)}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all w-full group',
                          isPlaying
                            ? 'bg-accent/10'
                            : 'hover:bg-white/[0.04]',
                        )}
                      >
                        {/* Index / Play indicator */}
                        <div className="w-8 h-8 flex items-center justify-center shrink-0">
                          {isPlaying ? (
                            <SoundBars />
                          ) : (
                            <>
                              <span className="text-xs text-muted-foreground group-hover:hidden">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <Play size={14} className="text-muted-foreground hidden group-hover:block" />
                            </>
                          )}
                        </div>

                        {/* Song info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('text-sm font-medium truncate', isPlaying ? 'text-accent' : 'text-foreground')}>
                              {song.name}
                            </span>
                            <span className="text-2xs text-muted-foreground/60 shrink-0">{song.meta.author}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {[`${song.bpm} BPM`, song.meta.key, song.meta.style, song.meta.wave].map((tag, ti) => (
                              <span key={ti} className="text-2xs text-muted-foreground/50 bg-white/[0.04] rounded px-1.5 py-0.5">{tag}</span>
                            ))}
                          </div>
                        </div>

                        {/* Stop button when playing */}
                        {isPlaying && (
                          <div className="shrink-0 p-1">
                            <Square size={12} className="text-accent" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer with volume control */}
              <div className="shrink-0 px-5 py-3 border-t border-white/5 flex items-center gap-3">
                <Volume2 size={14} className="text-muted-foreground shrink-0" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={bgmVolume}
                  onChange={handleVolumeChange}
                  className="flex-1 h-1 accent-accent bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent"
                />
                <span className="text-2xs text-muted-foreground/60 w-8 text-right shrink-0">{Math.round(bgmVolume * 100)}%</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
