import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Spade, ChevronRight, ChevronLeft, Megaphone, Trophy } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

function MiniCard({ color, label }: { color: string; label: string }) {
  const bg: Record<string, string> = {
    red: 'bg-uno-red',
    blue: 'bg-uno-blue',
    green: 'bg-uno-green',
    yellow: 'bg-uno-yellow',
    wild: 'bg-wild-gradient',
    dark: 'bg-slate-700 border border-slate-500',
  };
  return (
    <div className={cn('inline-flex items-center justify-center w-8 h-11 rounded text-white text-2xs font-bold shrink-0', bg[color] ?? 'bg-slate-600')}>
      {label}
    </div>
  );
}

function CardRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1.5 my-1.5">{children}</div>;
}

interface PageDef {
  title: string;
  body: React.ReactNode;
}

const PAGES: PageDef[] = [
  {
    title: '欢迎来到 UNO Online',
    body: (
      <div className="flex flex-col gap-3.5">
        <p className="text-sm text-foreground/90 leading-relaxed">
          UNO 是一款经典的多人卡牌对战游戏，支持 2-10 人同时游戏。
          快速匹配、出牌、喊 UNO —— 最先打完手牌的玩家获胜！
        </p>
        <div className="flex justify-center gap-2 py-2">
          <MiniCard color="red" label="7" />
          <MiniCard color="blue" label="3" />
          <MiniCard color="green" label="⇆" />
          <MiniCard color="yellow" label="+2" />
          <MiniCard color="wild" label="W" />
          <MiniCard color="dark" label="+4" />
        </div>
        <div className="rounded-lg bg-white/5 p-3 text-xs text-slate-300 leading-relaxed space-y-1.5">
          <p>每人发 <strong className="text-foreground">7 张</strong>手牌，翻开一张作为弃牌堆起始。</p>
          <p>轮到你时，打出一张与弃牌堆顶<strong className="text-foreground">颜色</strong>或<strong className="text-foreground">数字/符号</strong>相同的牌。</p>
          <p>无牌可出时从牌堆<strong className="text-foreground">摸一张</strong>牌。</p>
        </div>
      </div>
    ),
  },
  {
    title: '卡牌图鉴',
    body: (
      <div className="flex flex-col gap-3 text-xs text-slate-300 leading-relaxed">
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-foreground text-xs font-bold mb-1">数字牌（0-9）</p>
          <CardRow>
            <MiniCard color="red" label="3" />
            <MiniCard color="blue" label="7" />
            <MiniCard color="green" label="1" />
            <MiniCard color="yellow" label="9" />
          </CardRow>
          <p>四种颜色各有 0-9 数字牌，匹配颜色或数字即可打出。</p>
        </div>

        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-foreground text-xs font-bold mb-1">功能牌</p>
          <CardRow>
            <MiniCard color="red" label="⊘" />
            <MiniCard color="green" label="⇆" />
            <MiniCard color="blue" label="+2" />
          </CardRow>
          <ul className="list-disc pl-4 space-y-1 mt-1">
            <li><strong className="text-foreground">跳过</strong> ⊘ — 下一位玩家被跳过，失去出牌机会</li>
            <li><strong className="text-foreground">反转</strong> ⇆ — 改变出牌方向，两人时等同跳过</li>
            <li><strong className="text-foreground">+2</strong> — 下家摸 2 张牌并跳过回合</li>
          </ul>
        </div>

        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-foreground text-xs font-bold mb-1">万能牌</p>
          <CardRow>
            <MiniCard color="wild" label="W" />
            <MiniCard color="dark" label="+4" />
          </CardRow>
          <ul className="list-disc pl-4 space-y-1 mt-1">
            <li><strong className="text-foreground">变色牌</strong> W — 任何时候都能打出，自选颜色</li>
            <li><strong className="text-foreground">+4</strong> — 选颜色并让下家摸 4 张，下家可质疑合法性</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    title: 'UNO 喊牌 & 计分',
    body: (
      <div className="flex flex-col gap-3 text-xs text-slate-300 leading-relaxed">
        <div className="rounded-lg bg-white/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Megaphone size={16} className="text-accent shrink-0" />
            <p className="text-foreground text-xs font-bold">UNO 喊牌</p>
          </div>
          <ul className="list-disc pl-4 space-y-1">
            <li>手中只剩 <strong className="text-foreground">1 张牌</strong>时，必须喊「UNO」</li>
            <li>未喊被其他玩家抓到，罚摸 <strong className="text-foreground">2 张</strong>牌</li>
            <li>其他玩家可以在你出下一张牌之前点击抓牌按钮</li>
          </ul>
        </div>

        <div className="rounded-lg bg-white/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={16} className="text-accent shrink-0" />
            <p className="text-foreground text-xs font-bold">胜利与计分</p>
          </div>
          <ul className="list-disc pl-4 space-y-1">
            <li>最先出完手牌的玩家赢得本轮</li>
            <li>赢家获得其他玩家手中剩余牌的分值总和</li>
          </ul>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-white/5 py-1.5">
              <p className="text-foreground font-bold text-sm">0-9</p>
              <p className="text-muted-foreground mt-0.5">面值分</p>
            </div>
            <div className="rounded bg-white/5 py-1.5">
              <p className="text-foreground font-bold text-sm">20</p>
              <p className="text-muted-foreground mt-0.5">功能牌</p>
            </div>
            <div className="rounded bg-white/5 py-1.5">
              <p className="text-foreground font-bold text-sm">50</p>
              <p className="text-muted-foreground mt-0.5">万能牌</p>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export default function TutorialModal() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);

  useEffect(() => { setOpen(true); }, []);

  const close = () => { setOpen(false); setPage(0); };
  const go = (next: number) => { setDir(next > page ? 1 : -1); setPage(next); };

  if (!open) return null;

  const current = PAGES[page]!;
  const isLast = page === PAGES.length - 1;

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
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-[440px] rounded-2xl bg-card shadow-2xl border border-white/[0.08]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
              <div className="flex items-center gap-2 text-lg font-bold font-game">
                <Spade size={18} className="text-accent" /> {current.title}
              </div>
            </div>

            <div className="min-h-[320px] max-h-[52vh] overflow-y-auto p-5 scrollbar-thin">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={page}
                  initial={{ opacity: 0, x: dir * 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: dir * -40 }}
                  transition={{ duration: 0.18 }}
                >
                  {current.body}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="border-t border-white/[0.08] px-5 py-3.5">
              <div className="flex justify-center gap-1.5 mb-3">
                {PAGES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => go(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === page ? 'w-5 bg-accent' : 'w-1.5 bg-white/20 hover:bg-white/40',
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-3">
                {page > 0 && (
                  <button
                    onClick={() => go(page - 1)}
                    className="flex-1 rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-white/5"
                  >
                    <ChevronLeft size={14} className="mr-1 inline" /> 上一页
                  </button>
                )}
                {isLast ? (
                  <button
                    onClick={close}
                    className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:opacity-90"
                  >
                    开始游戏
                  </button>
                ) : (
                  <button
                    onClick={() => go(page + 1)}
                    className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:opacity-90"
                  >
                    下一页 <ChevronRight size={14} className="ml-1 inline" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
