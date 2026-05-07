# Game Info Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side info drawer to the game page that consolidates rules, house rules, game log, and chat into tabbed panels with glassmorphism styling, plus a global scrollbar beautification utility.

**Architecture:** New `InfoDrawer` component with horizontal tabs, driven by two new fields in `game-store`. Desktop replaces scattered fixed panels; mobile adds a "gameplay" entry to existing MobileFAB. A new `GameRulesPanel` provides static UNO rules content. A new `scrollbar-thin` Tailwind utility replaces `scrollbar-hidden` where appropriate.

**Tech Stack:** React, Zustand, framer-motion, Tailwind CSS v4, lucide-react

---

### Task 1: Add `scrollbar-thin` utility to global CSS

**Files:**
- Modify: `packages/client/src/index.css:266-272` (after existing `scrollbar-hidden` utility)

- [ ] **Step 1: Add the `scrollbar-thin` utility**

In `packages/client/src/index.css`, add this new utility immediately after the existing `scrollbar-hidden` utility (after line 272):

```css
@utility scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.3);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(148, 163, 184, 0.5);
  }
}
```

- [ ] **Step 2: Replace `scrollbar-hidden` with `scrollbar-thin` on appropriate elements**

In `packages/client/src/features/game/components/GameLog.tsx` line 72, replace `scrollbar-hidden` with `scrollbar-thin`:

```tsx
// Before:
<div className="px-3 pb-3 max-h-[50vh] overflow-y-auto scrollbar-hidden">

// After:
<div className="px-3 pb-3 max-h-[50vh] overflow-y-auto scrollbar-thin">
```

In `packages/client/src/features/game/components/HouseRulesCard.tsx` line 141, replace `scrollbar-hidden` with `scrollbar-thin`:

```tsx
// Before:
<div className="hidden md:block fixed left-4 bottom-24 w-chat-w max-h-[60vh] overflow-y-auto scrollbar-hidden z-fab bg-card/80 backdrop-blur-sm rounded-xl border border-white/10 p-3">

// After:
<div className="hidden md:block fixed left-4 bottom-24 w-chat-w max-h-[60vh] overflow-y-auto scrollbar-thin z-fab bg-card/80 backdrop-blur-sm rounded-xl border border-white/10 p-3">
```

In `packages/client/src/features/game/components/PlayerListPanel.tsx` line 16, replace `scrollbar-hidden` with `scrollbar-thin`:

```tsx
// Before:
<div className="rounded-card-ui bg-card/80 backdrop-blur-sm shadow-card shadow-tech border border-white/10 w-48 max-h-64 overflow-y-auto scrollbar-hidden">

// After:
<div className="rounded-card-ui bg-card/80 backdrop-blur-sm shadow-card shadow-tech border border-white/10 w-48 max-h-64 overflow-y-auto scrollbar-thin">
```

Note: Keep `scrollbar-hidden` on `PlayerHand.tsx` — the horizontal card fan should not show a scrollbar.

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/index.css packages/client/src/features/game/components/GameLog.tsx packages/client/src/features/game/components/HouseRulesCard.tsx packages/client/src/features/game/components/PlayerListPanel.tsx
git commit -m "feat: 新增 scrollbar-thin 美化滚动条 utility 并替换相关组件"
```

---

### Task 2: Add drawer state to game store

**Files:**
- Modify: `packages/client/src/features/game/stores/game-store.ts`

- [ ] **Step 1: Add drawer type and state fields**

In `packages/client/src/features/game/stores/game-store.ts`, add the tab type alias and extend the `GameState` interface. After the `PlayerInfo` export (line 16), add:

```typescript
export type InfoDrawerTab = 'rules' | 'house-rules' | 'log' | 'chat';
```

Add these fields to the `GameState` interface (after `hasDrawnThisTurn: boolean;` on line 35):

```typescript
  infoDrawerOpen: boolean;
  infoDrawerTab: InfoDrawerTab;
  toggleInfoDrawer: () => void;
  setInfoDrawerTab: (tab: InfoDrawerTab) => void;
```

- [ ] **Step 2: Add default values and actions to the store**

In the `create<GameState>` call, add default values (after `hasDrawnThisTurn: false,` on line 59):

```typescript
  infoDrawerOpen: false,
  infoDrawerTab: 'rules' as InfoDrawerTab,
  toggleInfoDrawer: () => set((state) => ({ infoDrawerOpen: !state.infoDrawerOpen })),
  setInfoDrawerTab: (tab: InfoDrawerTab) => set({ infoDrawerTab: tab }),
```

Add `infoDrawerOpen` and `infoDrawerTab` to the `clearGame` reset (after `hasDrawnThisTurn: false,` inside `clearGame`):

```typescript
      infoDrawerOpen: false,
      infoDrawerTab: 'rules' as InfoDrawerTab,
```

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/game/stores/game-store.ts
git commit -m "feat: 在 game-store 中新增 InfoDrawer 状态管理"
```

---

### Task 3: Create `GameRulesPanel` component

**Files:**
- Create: `packages/client/src/features/game/components/GameRulesPanel.tsx`

- [ ] **Step 1: Create the GameRulesPanel component**

Create `packages/client/src/features/game/components/GameRulesPanel.tsx`:

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-bold text-foreground bg-slate-800/50 cursor-pointer text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div className="px-3 py-2 text-xs text-slate-300 leading-relaxed">{children}</div>}
    </div>
  );
}

function MiniCard({ color, label }: { color: string; label: string }) {
  const bgMap: Record<string, string> = {
    red: 'bg-uno-red',
    blue: 'bg-uno-blue',
    green: 'bg-uno-green',
    yellow: 'bg-uno-yellow',
    wild: 'bg-wild-gradient',
    dark: 'bg-slate-700 border border-slate-500',
  };

  return (
    <div className={cn('inline-flex items-center justify-center w-8 h-11 rounded text-white text-2xs font-bold shrink-0', bgMap[color] ?? 'bg-slate-600')}>
      {label}
    </div>
  );
}

export default function GameRulesPanel() {
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

      <Section title="卡牌图鉴">
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
      </Section>

      <Section title="UNO 喊牌">
        <ul className="list-disc pl-4 flex flex-col gap-1">
          <li>当手中只剩 <strong>1 张牌</strong>时，必须喊 「UNO」</li>
          <li>未喊被其他玩家抓到，需罚摸牌（默认 2 张）</li>
          <li>其他玩家可以在你出下一张牌之前点击抓牌按钮</li>
        </ul>
      </Section>

      <Section title="胜利与计分">
        <ul className="list-disc pl-4 flex flex-col gap-1">
          <li>最先出完手牌的玩家赢得本轮</li>
          <li>赢家获得所有其他玩家手中剩余牌的分值总和</li>
          <li className="mt-1"><strong>计分规则：</strong></li>
          <li>数字牌：面值分（0-9 分）</li>
          <li>功能牌（跳过/反转/+2）：每张 20 分</li>
          <li>万能牌（Wild / +4）：每张 50 分</li>
          <li>达到目标分数的玩家赢得整局游戏</li>
        </ul>
      </Section>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/game/components/GameRulesPanel.tsx
git commit -m "feat: 新增 GameRulesPanel 玩法介绍组件"
```

---

### Task 4: Create `InfoDrawer` component

**Files:**
- Create: `packages/client/src/features/game/components/InfoDrawer.tsx`

- [ ] **Step 1: Create the InfoDrawer component**

Create `packages/client/src/features/game/components/InfoDrawer.tsx`:

```tsx
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useGameStore } from '../stores/game-store';
import type { InfoDrawerTab } from '../stores/game-store';
import HouseRulesCard from './HouseRulesCard';
import GameLog from './GameLog';
import ChatBox from './ChatBox';
import GameRulesPanel from './GameRulesPanel';

const TABS: { key: InfoDrawerTab; label: string }[] = [
  { key: 'rules', label: '玩法' },
  { key: 'house-rules', label: '村规' },
  { key: 'log', label: '日志' },
  { key: 'chat', label: '聊天' },
];

export default function InfoDrawer() {
  const open = useGameStore((s) => s.infoDrawerOpen);
  const activeTab = useGameStore((s) => s.infoDrawerTab);
  const toggleInfoDrawer = useGameStore((s) => s.toggleInfoDrawer);
  const setInfoDrawerTab = useGameStore((s) => s.setInfoDrawerTab);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'h' || e.key === 'H' || e.key === '?') {
        e.preventDefault();
        toggleInfoDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleInfoDrawer]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="hidden md:flex fixed right-0 top-0 bottom-0 w-[360px] z-fab flex-col border-l border-white/15 bg-slate-950/85 backdrop-blur-xl"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-sm font-bold text-foreground">游戏信息</span>
            <button
              onClick={toggleInfoDrawer}
              className="w-7 h-7 rounded-md bg-slate-800/60 flex items-center justify-center text-slate-400 hover:text-foreground cursor-pointer transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-4 border-b border-white/10">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setInfoDrawerTab(tab.key)}
                className={cn(
                  'px-3.5 py-2 text-sm cursor-pointer transition-colors bg-transparent border-0',
                  activeTab === tab.key
                    ? 'text-blue-500 font-medium border-b-2 border-blue-500'
                    : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
            {activeTab === 'rules' && <GameRulesPanel />}
            {activeTab === 'house-rules' && <HouseRulesCard embedded />}
            {activeTab === 'log' && <GameLog embedded />}
            {activeTab === 'chat' && <ChatBox embedded />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/game/components/InfoDrawer.tsx
git commit -m "feat: 新增 InfoDrawer 侧边抽屉组件"
```

---

### Task 5: Add trigger button to TopBar

**Files:**
- Modify: `packages/client/src/features/game/components/TopBar.tsx`

- [ ] **Step 1: Add the HelpCircle import and drawer toggle**

In `packages/client/src/features/game/components/TopBar.tsx`, update the lucide-react import on line 1 to include `HelpCircle`:

```tsx
import { Eye, Volume2, VolumeX, Spade, DoorOpen, Bot, HelpCircle } from 'lucide-react';
```

Add the game store import after line 5:

```tsx
import { useGameStore } from '../stores/game-store';
```

- [ ] **Step 2: Add the toggle call and button**

Inside the `TopBar` component function, after the `const isHost = ...` line (line 16), add:

```tsx
  const toggleInfoDrawer = useGameStore((s) => s.toggleInfoDrawer);
```

In the right-side button group (inside `<div className="flex items-center gap-3">`), add a new button as the first child — before the autoPlay toggle button (before line 31):

```tsx
        <button
          onClick={toggleInfoDrawer}
          className="hidden md:inline bg-transparent border-none text-sm cursor-pointer text-muted-foreground hover:text-accent transition-colors"
          title="游戏信息 (H)"
        >
          <HelpCircle size={16} />
        </button>
```

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/game/components/TopBar.tsx
git commit -m "feat: TopBar 新增信息抽屉触发按钮"
```

---

### Task 6: Integrate InfoDrawer into GamePage and remove desktop-only panels

**Files:**
- Modify: `packages/client/src/features/game/pages/GamePage.tsx`

- [ ] **Step 1: Add InfoDrawer import**

In `packages/client/src/features/game/pages/GamePage.tsx`, add the import after line 25 (after `import MobileFAB`):

```tsx
import InfoDrawer from '../components/InfoDrawer';
```

- [ ] **Step 2: Remove desktop-only standalone panels and add InfoDrawer**

In the return JSX, replace the three standalone component renders:

```tsx
      <ChatBox />
```
```tsx
      <HouseRulesCard />
```
```tsx
      <GameLog />
```

with:

```tsx
      <InfoDrawer />
```

This means lines 363-366 in the current file change from:

```tsx
      <ChatBox />
      <VoicePanel />
      <HouseRulesCard />
      <GameLog />
```

to:

```tsx
      <VoicePanel />
      <InfoDrawer />
```

Also remove the now-unused imports at the top. Remove `ChatBox` (line 18), `HouseRulesCard` (line 23), and `GameLog` (line 24) imports since they're no longer directly used in GamePage (they're used inside InfoDrawer and MobileFAB instead).

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/features/game/pages/GamePage.tsx
git commit -m "feat: GamePage 集成 InfoDrawer，移除桌面端独立面板"
```

---

### Task 7: Add "玩法" entry to MobileFAB

**Files:**
- Modify: `packages/client/src/features/game/components/MobileFAB.tsx`

- [ ] **Step 1: Add GameRulesPanel import**

In `packages/client/src/features/game/components/MobileFAB.tsx`, add the import after line 6:

```tsx
import GameRulesPanel from './GameRulesPanel';
```

- [ ] **Step 2: Update Panel type and button/title configs**

Update the `Panel` type on line 8:

```tsx
type Panel = 'gameplay' | 'rules' | 'log' | 'chat' | null;
```

Update `FAB_BUTTONS` (line 10-14) to add the new entry at the beginning:

```tsx
const FAB_BUTTONS: { panel: Exclude<Panel, null>; emoji: string; label: string }[] = [
  { panel: 'gameplay', emoji: '\u{1F3AE}', label: 'Gameplay' },
  { panel: 'rules', emoji: '\u{1F4CB}', label: 'House Rules' },
  { panel: 'log', emoji: '\u{1F4D6}', label: 'Game Log' },
  { panel: 'chat', emoji: '\u{1F4AC}', label: 'Chat' },
];
```

Update `PANEL_TITLES` (line 16-20) to add the new entry:

```tsx
const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
  gameplay: '\u{1F3AE} 玩法介绍',
  rules: '\u{1F4CB} 本局村规',
  log: '\u{1F4D6} 游戏日记',
  chat: '\u{1F4AC} 聊天',
};
```

- [ ] **Step 3: Add GameRulesPanel rendering in the BottomSheet content**

In the conditional rendering section (around line 52-54), add the new panel:

```tsx
          {activePanel === 'gameplay' && <GameRulesPanel />}
          {activePanel === 'rules' && <HouseRulesCard embedded />}
          {activePanel === 'log' && <GameLog embedded />}
          {activePanel === 'chat' && <ChatBox embedded />}
```

- [ ] **Step 4: Verify the build compiles**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/game/components/MobileFAB.tsx
git commit -m "feat: MobileFAB 新增玩法介绍入口"
```

---

### Task 8: Visual verification and final commit

**Files:**
- No new files

- [ ] **Step 1: Start the dev server and verify**

Run:
```bash
pnpm --filter client dev
```

Open the game page in a browser and verify:
1. TopBar shows the `?` (HelpCircle) icon on desktop
2. Clicking it opens the right-side drawer with glassmorphism effect
3. All 4 tabs work: 玩法 / 村规 / 日志 / 聊天
4. Pressing `H` or `?` key toggles the drawer
5. Scrollbars in panels show thin styled scrollbar (not hidden)
6. On mobile viewport: MobileFAB shows new 🎮 button, opens gameplay BottomSheet
7. The drawer does not block game interaction (no backdrop overlay)

- [ ] **Step 2: Run type check**

Run: `pnpm --filter client exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `pnpm --filter client build`
Expected: Build succeeds
