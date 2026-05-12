import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Spade, ChevronRight, ChevronLeft, Megaphone, Trophy } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

function Card({ color, label }: { color: string; label: string }) {
  const bg: Record<string, string> = {
    red: 'bg-uno-red', blue: 'bg-uno-blue', green: 'bg-uno-green',
    yellow: 'bg-uno-yellow', wild: 'bg-wild-gradient',
    dark: 'bg-slate-700 border border-slate-500',
  };
  return (
    <div className={cn('inline-flex items-center justify-center w-14 h-20 rounded-lg text-white text-lg font-bold shrink-0 shadow-xl', bg[color] ?? 'bg-slate-600')}>
      {label}
    </div>
  );
}

function SmallCard({ color, label }: { color: string; label: string }) {
  const bg: Record<string, string> = {
    red: 'bg-uno-red', blue: 'bg-uno-blue', green: 'bg-uno-green',
    yellow: 'bg-uno-yellow', wild: 'bg-wild-gradient',
    dark: 'bg-slate-700 border border-slate-500',
  };
  return (
    <div className={cn('inline-flex items-center justify-center w-9 h-13 rounded text-white text-xs font-bold shrink-0 shadow-md', bg[color] ?? 'bg-slate-600')}>
      {label}
    </div>
  );
}

interface PageDef { title: string; subtitle: string; body: React.ReactNode }

const PAGES: PageDef[] = [
  {
    title: '欢迎来到 UNO Online',
    subtitle: '经典多人卡牌对战 · 支持 2-10 人同时游戏',
    body: (
      <div className="flex flex-col items-center gap-8 w-full max-w-xl">
        <div className="flex justify-center items-end gap-3 sm:gap-4">
          {[
            { color: 'red', label: '7', rotate: -12 },
            { color: 'blue', label: '3', rotate: -6 },
            { color: 'green', label: '⇆', rotate: 0 },
            { color: 'yellow', label: '+2', rotate: 6 },
            { color: 'wild', label: 'W', rotate: 12 },
            { color: 'dark', label: '+4', rotate: 18 },
          ].map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30, rotate: 0 }}
              animate={{ opacity: 1, y: 0, rotate: c.rotate }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <Card color={c.color} label={c.label} />
            </motion.div>
          ))}
        </div>
        <div className="w-full grid gap-3 sm:grid-cols-3">
          {[
            { n: '1', text: <>每人发 <strong className="text-foreground">7 张</strong>手牌，翻开一张作为起始</> },
            { n: '2', text: <>出与弃牌堆顶<strong className="text-foreground">颜色</strong>或<strong className="text-foreground">数字</strong>相同的牌</> },
            { n: '3', text: <>最先打完所有手牌的玩家<strong className="text-foreground">获胜</strong></> },
          ].map((step) => (
            <div key={step.n} className="flex items-start gap-3 rounded-xl bg-white/5 p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-accent text-sm font-bold shrink-0">{step.n}</span>
              <p className="text-sm text-slate-300 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: '卡牌图鉴',
    subtitle: '了解每种卡牌的效果',
    body: (
      <div className="w-full max-w-xl grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <SmallCard color="red" label="3" />
            <SmallCard color="blue" label="7" />
            <SmallCard color="green" label="1" />
            <SmallCard color="yellow" label="9" />
          </div>
          <p className="text-sm font-bold text-foreground">数字牌 (0-9)</p>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">四种颜色各有 0-9 数字牌，匹配颜色或数字即可打出</p>
        </div>
        <div className="rounded-xl bg-white/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <SmallCard color="red" label="⊘" />
            <SmallCard color="green" label="⇆" />
            <SmallCard color="blue" label="+2" />
          </div>
          <p className="text-sm font-bold text-foreground">功能牌</p>
          <div className="text-xs text-slate-400 mt-1.5 leading-relaxed space-y-1">
            <p><strong className="text-slate-200">⊘ 跳过</strong> — 下家失去出牌机会</p>
            <p><strong className="text-slate-200">⇆ 反转</strong> — 改变出牌方向</p>
            <p><strong className="text-slate-200">+2</strong> — 下家摸 2 张并跳过回合</p>
          </div>
        </div>
        <div className="rounded-xl bg-white/5 p-5 sm:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <SmallCard color="wild" label="W" />
            <SmallCard color="dark" label="+4" />
          </div>
          <p className="text-sm font-bold text-foreground">万能牌</p>
          <div className="text-xs text-slate-400 mt-1.5 leading-relaxed sm:flex sm:gap-6">
            <p><strong className="text-slate-200">W 变色</strong> — 任何时候打出，自由选择接下来的颜色</p>
            <p className="mt-1 sm:mt-0"><strong className="text-slate-200">+4</strong> — 选颜色 + 下家摸 4 张牌，下家可以质疑合法性</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'UNO 喊牌 & 计分',
    subtitle: '掌握规则，赢得胜利',
    body: (
      <div className="w-full max-w-xl grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone size={20} className="text-accent shrink-0" />
            <p className="text-base font-bold text-foreground">UNO 喊牌</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-xs font-bold shrink-0">!</span>
              <p className="text-sm text-slate-300">手中只剩 <strong className="text-foreground">1 张牌</strong>时必须喊「UNO」</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-red-400 text-xs font-bold shrink-0">!</span>
              <p className="text-sm text-slate-300">未喊被抓到 → 罚摸 <strong className="text-foreground">2 张</strong></p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={20} className="text-accent shrink-0" />
            <p className="text-base font-bold text-foreground">胜利与计分</p>
          </div>
          <p className="text-sm text-slate-400 mb-4">赢家获得其他玩家手中剩余牌的分值总和</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white/5 py-3">
              <p className="text-foreground font-bold text-lg">0-9</p>
              <p className="text-2xs text-muted-foreground mt-1">面值分</p>
            </div>
            <div className="rounded-lg bg-white/5 py-3">
              <p className="text-foreground font-bold text-lg">20</p>
              <p className="text-2xs text-muted-foreground mt-1">功能牌</p>
            </div>
            <div className="rounded-lg bg-white/5 py-3">
              <p className="text-foreground font-bold text-lg">50</p>
              <p className="text-2xs text-muted-foreground mt-1">万能牌</p>
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-modal flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950"
        >
          <div className="flex flex-col flex-1 items-center justify-center px-6 py-6 overflow-hidden">
            <div className="flex flex-col items-center gap-2 mb-8">
              <motion.div
                key={`title-${page}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 text-xl sm:text-2xl font-bold font-game text-foreground"
              >
                <Spade size={24} className="text-accent" />
                {current.title}
              </motion.div>
              <p className="text-sm text-muted-foreground">{current.subtitle}</p>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page}
                initial={{ opacity: 0, x: dir * 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -60 }}
                transition={{ duration: 0.2 }}
                className="flex justify-center w-full"
              >
                {current.body}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="shrink-0 px-6 pb-8 pt-4">
            <div className="flex justify-center gap-2 mb-5">
              {PAGES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => go(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === page ? 'w-8 bg-accent' : 'w-2 bg-white/20 hover:bg-white/40',
                  )}
                />
              ))}
            </div>
            <div className="flex gap-3 max-w-xs mx-auto">
              {page > 0 && (
                <button
                  onClick={() => go(page - 1)}
                  className="flex-1 rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-foreground transition-colors hover:bg-white/5"
                >
                  <ChevronLeft size={14} className="mr-1 inline" /> 上一页
                </button>
              )}
              <button
                onClick={isLast ? close : () => go(page + 1)}
                className="flex-1 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition-colors hover:opacity-90"
              >
                {isLast ? '开始游戏' : <>下一页 <ChevronRight size={14} className="ml-1 inline" /></>}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
