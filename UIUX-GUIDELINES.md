# UIUX Guidelines

Design system and UI/UX standards for UNO Online.

---

## 0. 第一原则：这是游戏，不是网页

屏幕适配用**游戏画布思路**，不用响应式网页思路：

1. **固定逻辑尺寸**：每个页面的中心内容用固定 px 布局（逻辑画布），禁止 `vw` / `clamp` / 百分比流式尺寸。
2. **FitScaler 整体等比缩放**：外层用 `FitScaler`（`shared/components/FitScaler.tsx`）把逻辑画布 `transform: scale()` 缩放到可用区域，永不裁切。这等价于 Unity CanvasScaler 的 "scale with screen size"。
3. **断点只用于布局模式切换**：`portrait:`（横竖屏）和对局的 `useGameLayoutMode`（table / strip）只允许切换布局**形态**，不允许用 `max-sm:` / `md:` 做尺寸流式重排（遗留代码逐步清除）。
4. **HUD 四角锚定**：顶栏、状态栏、用户胶囊等 HUD 锚定屏幕边缘，各自用 `FitScaler mode="width"` 按宽度整体缩放，避免窄屏溢出。
5. **弹窗兜底**：内容超过 `max-h` 时内部滚动（`ui/Modal` 自带），滚动也是完整的可达性。

---

## 1. 样式体系结构

样式文件在 `packages/client/src/styles/` 下拆分，`index.css` 只做装配：

| 文件 | 内容 |
|------|------|
| `styles/tokens.css` | 全部设计 token（`@theme inline` + `:root` 语义值）——颜色/半径/间距/字号/阴影/z-index 的**唯一定义处** |
| `styles/utilities.css` | `@utility` 组件样式（glass-panel、themed-input、icon-button、gold-button-base 等） |
| `styles/effects.css` | 特效层原生 CSS（弹幕、反作弊 Toast、作弊遮罩） |

### Token 命名空间

| CSS 变量命名空间 | Tailwind 前缀 | 示例 |
|-------------------------------|------------------------|---------|
| `--spacing-*` | `w-*`, `h-*`, `p-*`, `m-*`, `gap-*` | `--spacing-card-w: 52px` → `w-card-w` |
| `--font-size-*` | `text-*` | `--font-size-card-number` → `text-card-number` |
| `--shadow-*` | `shadow-*` | `--shadow-card` → `shadow-card` |
| `--radius-*` | `rounded-*` | `--radius-panel-ui` → `rounded-panel-ui` |
| `--z-index-*` | `z-*` | `--z-index-modal: 100` → `z-modal` |
| `--color-*` | `bg-*`, `text-*`, `border-*` | `--color-uno-red` → `bg-uno-red` |
| `--animate-*` | `animate-*` | `--animate-shake` → `animate-shake` |
| `--font-*` (family) | `font-*` | `--font-game` → `font-game` |

### Token-First 规则

- **禁止硬编码颜色**（hex / rgba）：文字、背景、描边一律语义类（`text-primary` / `text-foreground` / `text-muted-foreground` / `bg-secondary` / `border-border` / `text-destructive`…）或 CSS 变量（`var(--gold)`）。
- **例外**：金色辉光氛围（`rgba(246,190,62,…)` 的 boxShadow / 渐变光晕）允许内联，属于"打光"不属于"颜色"。
- **禁止裸 z-index**（`z-[100]`、`z-50`）：只能用下表的 token。
- 一个值出现在两个以上组件中 → 先加 token 再用。

---

## 2. 颜色系统

### 语义色

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#070b16` | 主背景 |
| `card` | `#0b1021` | 卡片/面板 |
| `popover` / `muted` | `#12172b` | 次级表面 |
| `primary` | `#f6be3e` | 主强调（金色） |
| `destructive` | `#ff5c83` | 危险操作 |
| `foreground` | `#f4f7ff` | 主文字 |
| `muted-foreground` | `#8b95b3` | 次级文字 |
| `secondary` | `rgba(255,255,255,0.045)` | 微弱填充、chips、图标按钮 |

金色扩展（`:root` CSS 变量）：`--gold` / `--gold-2` / `--gold-3`（金色阶梯）、`--panel` / `--panel-strong`、`--line` / `--line-gold`。优先用建立在它们之上的 `@utility` 类。

### UNO 牌色

`uno-red #ff3366` / `uno-blue #4488ff` / `uno-green #33cc66` / `uno-yellow #fbbf24`

### 功能色

toast-info/error/success、voice-*（语音面板）、speaking、error-text、effect-skip、card-back-from/to、avatar-1~9（头像底色，按加入顺序分配）。

---

## 3. 字体

| Token | Stack | Usage |
|-------|-------|-------|
| `font-game` | `'Fredoka Variable', 'Microsoft YaHei', 'PingFang SC', sans-serif` | 游戏文字：牌面、标题、特效、按钮。Fredoka 自托管（`@fontsource-variable/fredoka`，`app/main.tsx` 引入），中文回落系统字体 |
| `font-ui`（默认） | `system-ui, -apple-system, sans-serif` | 界面元素：输入框、正文、标签 |

字号 token：`text-2xs/xs/sm/caption` + `text-heading-lg/xl` + 牌面专用（`text-card-number/symbol/draw/wild/wild4`）+ 特效（`text-effect/throw/timer-critical/uno-call`）。

---

## 4. 圆角

两套语义，不要混用：

- **牌面**：`rounded-card`（14px）/ `rounded-card-md`（18px）/ `rounded-panel`（20px）
- **界面控件**：`rounded-btn`（18px）/ `rounded-input`（16px）/ `rounded-card-ui`（22px）/ `rounded-panel-ui`（28px）

通用刻度 `rounded-sm/md/lg/xl` 用于小组件。

---

## 5. 阴影

| Token | Usage |
|-------|-------|
| `shadow-card` / `shadow-card-sm` | 卡牌投影 |
| `shadow-card-playable` | 可出牌金色发光 |
| `shadow-glow-active` | 当前玩家头像发光 |
| `shadow-draw-ready` | 摸牌堆脉冲发光 |
| `shadow-toast` | 通知阴影 |
| `shadow-input-focus` | 输入框聚焦金环 |
| `shadow-tech` | 金色辉光 + 投影（重要面板） |

---

## 6. Z-Index（唯一合法集合）

| Token | Value | Usage |
|-------|-------|-------|
| `z-card` | 1 | 桌面卡牌、画布内容层 |
| `z-topbar` | 10 | 顶栏 HUD |
| `z-actions` | 20 | 游戏操作按钮、下拉菜单 |
| `z-fab` | 50 | 浮动按钮、信息抽屉 |
| `z-autopilot` | 60 | 托管遮罩 |
| `z-confetti` | 85 | 胜利彩带 |
| `z-effects` | 90 | 特效文字 |
| `z-timer-overlay` | 95 | 计时遮罩 |
| `z-modal` | 100 | 弹窗、抽屉遮罩 |
| `z-connection` | 200 | 断线重连遮罩 |
| `z-toast` | 300 | 通知 |
| `z-ace` | 310 | 反作弊 Toast |
| `z-cheat` | 400 | 作弊遮罩 |
| `z-cheat-flash` | 410 | 作弊闪屏 |

---

## 7. 屏幕适配（详见第 0 节）

### 布局模式

| Hook / 变体 | 用途 |
|------------|------|
| `useIsPortrait()`（shared/hooks） | 竖屏布局模式（房间页等） |
| `useGameLayoutMode()`（game/hooks） | 对局 `table` / `strip`：竖屏**或高度 < 560** → strip |
| `portrait:` Tailwind 变体 | CSS 层横竖屏切换（仅限画布尺寸切换，如 `w-[760px] portrait:w-[440px]`） |

### 对局页结构（单一组件树）

`GamePage` 只有一棵树：`GameHUD`（table/strip 两种密度）+ 中央区（table=椭圆牌桌 1200×720 逻辑画布 / strip=玩家条+牌区）+ 共享 `GameActions`/`PlayerHand` + 一份覆盖层。不要新增"桌面版/移动版"平行组件。

---

## 8. 基础组件（shared/components/ui/）

一律优先使用，不要手写重复样式：

| 组件 | 用途 |
|------|------|
| `Button`（CVA） | variant=primary/danger/secondary/ghost/outline/game，带 `sound` prop |
| `Input` | themed-input 封装，`icon` prop 左侧图标，`inputSize=sm/md/lg` |
| `IconButton` | 图标按钮，`size=sm/md/lg`，`active` 金色高亮 |
| `Modal` | 统一弹窗骨架：`open/onClose/title/footer/width`，毛玻璃背景 + glass-panel + 头/可滚内容/底部 |
| `Switch` | 金色开关，`size=sm/md`，`role="switch"` |
| `Tabs` | 下划线 Tab |

### 常用 @utility

`glass-panel` / `glass-panel-sm`（玻璃面板）、`glass-modal-backdrop`（弹窗背景）、`themed-input` / `glass-input`（输入框）、`icon-button`（图标按钮）、`gold-button-base`（金色主按钮）、`scrollbar-thin` / `scrollbar-hidden`、`text-shadow-*`、`bg-wild-gradient`、`font-game`。

### 交互态要求

所有可交互元素：hover 反馈、active 反馈、focus-visible 指示；触控目标逻辑尺寸 ≥ 40px（缩放前）。

---

## 9. 动画

| 类型 | 技术 |
|------|------|
| 进出场/布局变化 | framer-motion |
| 拖拽/手势 | framer-motion |
| 循环动画（脉冲、旋转） | CSS `@keyframes` + `animate-*` token |

弹簧默认值 `stiffness: 300, damping: 25`（卡牌按钮 400/20）；入场 200-400ms、出场 150-300ms；尊重 `prefers-reduced-motion`。

已有 keyframes：`shake` / `timerFlash` / `spin` / `drawReadyPulse` / `breathe`（index.css）+ 特效层（effects.css）。

---

## 10. 可访问性

- **色盲模式**：卡牌叠加图案纹理作为颜色之外的第二通道（设置中开关）。
- **键盘**：可交互元素必须可 Tab 到达；用原生 `<button>` / `<a>` / `<input>`，不用 `<div onClick>`。
- **图标按钮**必须有 `title` 或 `aria-label`。
- **语义 HTML**：section/aside/nav 优先于 div 堆叠。
- 游戏状态变化适当使用 `aria-live`。

---

## 11. E2E 视觉验证

`packages/e2e` 提供截图级验证（详见其 README/代码）：

```bash
cd packages/e2e
node visual.mjs --tag myrun                     # 8 种分辨率 × 全部场景
node visual.mjs --stages lobby,game --res 390x844,844x390
```

场景：login / lobby / room / settings / profile / game / scoreboard。输出 `output/<tag>-*.png` + `<tag>-report.json`（DOM 溢出检测 + console 错误）。**任何 UI 改动后都应跑一遍确认零溢出、零 console 错误。**
