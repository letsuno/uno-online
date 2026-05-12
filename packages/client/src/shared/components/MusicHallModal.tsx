import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Music, X, Play, Square } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { bgm } from '@/shared/sound/bgm-engine';

interface SongMeta {
  name: string;
  bpm: string;
  key: string;
  style: string;
  wave: string;
}

const GAME_SONGS: SongMeta[] = [
  { name: 'UNO Bounce',  bpm: '138', key: 'C 大调', style: '弹跳琶音',   wave: '方波' },
  { name: 'Reverse!',    bpm: '128', key: 'A 小调', style: '切分律动',   wave: '方波' },
  { name: 'Draw Four!',  bpm: '144', key: 'A 小调', style: '高速连奏',   wave: '方波' },
  { name: 'Color Wheel', bpm: '120', key: 'C 大调', style: '回旋轮盘',   wave: '方波' },
  { name: 'Wild Card',   bpm: '148', key: 'A 小调', style: '极速冲刺',   wave: '方波' },
  { name: 'Blitz',       bpm: '135', key: 'G 大调', style: '进行曲',     wave: '锯齿波' },
  { name: 'Carnival',    bpm: '132', key: 'F 大调', style: '拉丁嘉年华', wave: '正弦波' },
  { name: 'Midnight',    bpm: '116', key: 'D 小调', style: '暗夜氛围',   wave: '方波' },
  { name: 'Pulse',       bpm: '140', key: 'A 小调', style: '纯节奏',     wave: '方波' },
  { name: 'Minuet',      bpm: '108', key: 'C 大调', style: '巴洛克小步舞', wave: '三角波' },
];

const LOBBY_SONGS: SongMeta[] = [
  { name: 'Shuffle',      bpm: '96', key: 'C 大调', style: '轻快摇曳',   wave: '方波' },
  { name: 'Daydream',     bpm: '88', key: 'C 大调', style: '空灵梦幻',   wave: '方波' },
  { name: 'Waiting Room', bpm: '92', key: 'C 大调', style: '温暖柔和',   wave: '方波' },
  { name: 'Breeze',       bpm: '84', key: 'G 大调', style: '田园清风',   wave: '正弦波' },
  { name: 'Sunset',       bpm: '78', key: 'F 大调', style: '日落音乐盒', wave: '三角波' },
  { name: 'Nocturne',     bpm: '72', key: 'Am/C',  style: '浪漫夜曲',   wave: '正弦波' },
];

const TABS = [
  { key: 'game' as const, label: '游戏曲目', songs: GAME_SONGS },
  { key: 'lobby' as const, label: '大厅曲目', songs: LOBBY_SONGS },
];

interface Props {
  open: boolean;
  onClose: () => void;
  currentScene: string;
}

export default function MusicHallModal({ open, onClose, currentScene }: Props) {
  const [tab, setTab] = useState<'game' | 'lobby'>('game');
  const [playing, setPlaying] = useState<string | null>(null);

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

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/55"
            onClick={close}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-[460px] rounded-2xl bg-card shadow-2xl border border-white/[0.08]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
              <div className="flex items-center gap-2 text-lg font-bold font-game">
                <Music size={18} className="text-accent" /> 音乐厅
              </div>
              <button onClick={close} className="p-1 text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="flex border-b border-white/[0.08]">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex-1 py-2.5 text-sm font-bold transition-colors',
                    tab === t.key
                      ? 'text-accent border-b-2 border-accent'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  <span className="ml-1 text-xs opacity-50">({t.songs.length})</span>
                </button>
              ))}
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-3 scrollbar-thin">
              <div className="flex flex-col gap-1.5">
                {current.songs.map((song, i) => {
                  const key = `${tab}:${i}`;
                  const isPlaying = playing === key;
                  return (
                    <button
                      key={key}
                      onClick={() => play(tab, i)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all w-full',
                        isPlaying
                          ? 'bg-accent/15 border border-accent/30'
                          : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06]',
                      )}
                    >
                      <div className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors',
                        isPlaying ? 'bg-accent text-white' : 'bg-white/10 text-muted-foreground',
                      )}>
                        {isPlaying ? <Square size={12} /> : <Play size={12} className="ml-0.5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-bold truncate', isPlaying && 'text-accent')}>
                            {song.name}
                          </span>
                          {isPlaying && (
                            <span className="flex gap-0.5 shrink-0">
                              {[0, 1, 2].map((j) => (
                                <motion.span
                                  key={j}
                                  className="inline-block w-0.5 bg-accent rounded-full"
                                  animate={{ height: [4, 12, 4] }}
                                  transition={{ duration: 0.6, repeat: Infinity, delay: j * 0.15 }}
                                />
                              ))}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-2xs text-muted-foreground">
                          <span>{song.bpm} BPM</span>
                          <span className="opacity-40">·</span>
                          <span>{song.key}</span>
                          <span className="opacity-40">·</span>
                          <span>{song.style}</span>
                          <span className="opacity-40">·</span>
                          <span>{song.wave}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-white/[0.08] px-5 py-3">
              <p className="text-center text-2xs text-muted-foreground">
                点击曲目试听，关闭后自动恢复背景音乐
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
