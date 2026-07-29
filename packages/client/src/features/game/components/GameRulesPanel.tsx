import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useGameStore } from '../stores/game-store';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-bold text-foreground bg-secondary cursor-pointer text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div className="px-3 py-2 text-xs text-muted-foreground leading-relaxed">{children}</div>}
    </div>
  );
}

function MiniCard({ color, label }: { color: string; label: string }) {
  const bgMap: Record<string, string> = {
    red: 'bg-uno-red',
    blue: 'bg-uno-blue',
    green: 'bg-uno-green',
    yellow: 'bg-uno-yellow',
    pink: 'bg-uno-pink',
    teal: 'bg-uno-teal',
    orange: 'bg-uno-orange',
    purple: 'bg-uno-purple',
    wild: 'bg-wild-gradient',
    dark: 'bg-[#232a45] border border-white/25',
  };

  return (
    <div className={cn('inline-flex items-center justify-center w-8 h-11 rounded text-white text-2xs font-bold shrink-0', bgMap[color] ?? 'bg-muted')}>
      {label}
    </div>
  );
}

function FlipSections() {
  return (
    <>
      <Section title="UNO Flip 玩法">
        <ul className="list-disc pl-4 flex flex-col gap-1">
          <li>每张牌都是<strong>双面</strong>的：亮面（红蓝绿黄）和暗面（粉青橙紫）</li>
          <li>打出 <strong>Flip 卡</strong>，整局翻面——牌堆、弃牌堆、所有人手牌一起翻</li>
          <li>翻面后弃牌堆会整体倒转，新顶牌是本轮<strong>第一张</strong>弃牌</li>
          <li>你能看到<strong>对手手牌的背面</strong>，但看不到自己的——这是本模式的核心博弈</li>
          <li>Flip 牌组<strong>没有 0 牌</strong>，数字只有 1-9</li>
        </ul>
      </Section>

      <Section title="亮面卡牌">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">数字牌（1-9）</p>
            <div className="flex gap-1 mb-1">
              <MiniCard color="red" label="3" />
              <MiniCard color="blue" label="7" />
              <MiniCard color="green" label="1" />
              <MiniCard color="yellow" label="9" />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">+1 / Skip / Reverse</p>
            <div className="flex items-center gap-1 mb-1">
              <MiniCard color="red" label="+1" />
              <MiniCard color="blue" label="⊘" />
              <MiniCard color="green" label="⇆" />
            </div>
            <p>下家摸 1 张并跳过 / 跳过下家 / 反转方向。</p>
          </div>
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">Flip / 万能牌 / 万能 +2</p>
            <div className="flex items-center gap-1 mb-1">
              <MiniCard color="yellow" label="⇅" />
              <MiniCard color="wild" label="W" />
              <MiniCard color="dark" label="+2" />
            </div>
            <p>翻面 / 指定颜色 / 指定颜色且下家摸 2 张（可质疑）。</p>
          </div>
        </div>
      </Section>

      <Section title="暗面卡牌" defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">数字牌（1-9）</p>
            <div className="flex gap-1 mb-1">
              <MiniCard color="pink" label="3" />
              <MiniCard color="teal" label="7" />
              <MiniCard color="orange" label="1" />
              <MiniCard color="purple" label="9" />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">+5（Draw Five）</p>
            <div className="flex items-center gap-1 mb-1"><MiniCard color="orange" label="+5" /></div>
            <p>下家摸 <strong>5 张</strong>并跳过回合。</p>
          </div>
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">跳过全体（Skip Everyone）</p>
            <div className="flex items-center gap-1 mb-1"><MiniCard color="pink" label="⊘⊘" /></div>
            <p><strong>所有人</strong>都被跳过，轮次回到你自己——等于连出两张。</p>
          </div>
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">摸到指定色（Wild Draw Color）</p>
            <div className="flex items-center gap-1 mb-1"><MiniCard color="dark" label="+?" /></div>
            <p>指定一个颜色，下家<strong>一直摸到摸出该颜色为止</strong>并跳过回合。可质疑。</p>
          </div>
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">Flip / 万能牌</p>
            <div className="flex items-center gap-1 mb-1">
              <MiniCard color="purple" label="⇅" />
              <MiniCard color="wild" label="W" />
            </div>
            <p>翻回亮面 / 指定颜色。</p>
          </div>
        </div>
      </Section>

      <Section title="Flip 计分" defaultOpen={false}>
        <ul className="list-disc pl-4 flex flex-col gap-1">
          <li>按<strong>结算时所处的那一面</strong>计分</li>
          <li>数字牌：面值分（1-9 分）</li>
          <li>+1：10 分</li>
          <li>Skip / Reverse / +5 / Flip：各 20 分</li>
          <li>跳过全体：30 分</li>
          <li>万能牌：40 分 · 万能 +2：50 分 · 摸到指定色：60 分</li>
        </ul>
      </Section>
    </>
  );
}

export default function GameRulesPanel() {
  const isFlip = useGameStore((s) => s.settings?.gameMode) === 'flip';

  return (
    <div className="flex flex-col gap-2">
      <Section title="基本规则">
        <ul className="list-disc pl-4 flex flex-col gap-1">
          <li>每人发 7 张手牌，翻开一张作为弃牌堆起始</li>
          <li>轮到你时，打出一张与弃牌堆顶<strong>颜色</strong>或<strong>数字/符号</strong>相同的牌</li>
          <li>无牌可出时从牌堆摸一张牌</li>
          <li>最先出完所有手牌的玩家获得本轮胜利</li>
        </ul>
      </Section>

      {isFlip && <FlipSections />}

      {!isFlip && <Section title="卡牌图鉴">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">数字牌（0-9）</p>
            <div className="flex gap-1 mb-1">
              <MiniCard color="red" label="3" />
              <MiniCard color="blue" label="7" />
              <MiniCard color="green" label="1" />
              <MiniCard color="yellow" label="9" />
            </div>
            <p>四种颜色各有 0-9 数字牌，匹配颜色或数字即可打出。</p>
          </div>

          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">跳过牌（Skip）</p>
            <div className="flex items-center gap-1 mb-1">
              <MiniCard color="red" label="⊘" />
            </div>
            <p>下一位玩家被跳过，失去本回合出牌机会。</p>
          </div>

          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">反转牌（Reverse）</p>
            <div className="flex items-center gap-1 mb-1">
              <MiniCard color="green" label="⇆" />
            </div>
            <p>改变出牌方向。两人游戏时效果等同于跳过。</p>
          </div>

          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">+2 牌（Draw Two）</p>
            <div className="flex items-center gap-1 mb-1">
              <MiniCard color="blue" label="+2" />
            </div>
            <p>下家必须摸 2 张牌并跳过回合。</p>
          </div>

          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">万能牌（Wild）</p>
            <div className="flex items-center gap-1 mb-1">
              <MiniCard color="wild" label="W" />
            </div>
            <p>可在任何时候打出，并选择接下来的颜色。</p>
          </div>

          <div>
            <p className="text-muted-foreground text-2xs font-bold mb-1">+4 万能牌（Wild Draw Four）</p>
            <div className="flex items-center gap-1 mb-1">
              <MiniCard color="dark" label="+4" />
            </div>
            <p>选择颜色并让下家摸 4 张牌。仅在没有同色牌时可合法打出，下家可质疑。</p>
          </div>
        </div>
      </Section>}

      <Section title="UNO 喊牌">
        <ul className="list-disc pl-4 flex flex-col gap-1">
          <li>当手中只剩 <strong>1 张牌</strong>时，必须喊 「UNO」</li>
          <li>未喊被其他玩家抓到，需罚摸牌（默认 2 张）</li>
          <li>其他玩家可以在你出下一张牌之前点击抓牌按钮</li>
        </ul>
      </Section>

      {!isFlip && <Section title="胜利与计分">
        <ul className="list-disc pl-4 flex flex-col gap-1">
          <li>最先出完手牌的玩家赢得本轮</li>
          <li>赢家获得所有其他玩家手中剩余牌的分值总和</li>
          <li className="mt-1"><strong>计分规则：</strong></li>
          <li>数字牌：面值分（0-9 分）</li>
          <li>功能牌（跳过/反转/+2）：每张 20 分</li>
          <li>万能牌（Wild / +4）：每张 50 分</li>
          <li>达到目标分数的玩家赢得整局游戏</li>
        </ul>
      </Section>}
      {isFlip && (
        <Section title="胜利">
          <ul className="list-disc pl-4 flex flex-col gap-1">
            <li>最先出完手牌的玩家赢得本轮</li>
            <li>赢家获得其他玩家手中剩余牌的分值总和</li>
            <li>达到目标分数（Flip 官方为 500 分）的玩家赢得整局</li>
          </ul>
        </Section>
      )}
    </div>
  );
}
