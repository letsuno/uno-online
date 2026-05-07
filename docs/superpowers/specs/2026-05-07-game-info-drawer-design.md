# 游戏侧边信息抽屉设计

日期：2026-05-07

## 概述

为游戏页面新增右侧滑出式信息抽屉，整合玩法介绍、村规说明、游戏日志和聊天功能，使用水平 Tab 分页组织。桌面端替代原本分散的固定面板，移动端保持现有 BottomSheet 模式并新增玩法入口。

## 需求

- 桌面端：统一信息中心，收纳原本分散的 HouseRulesCard、GameLog、ChatBox
- 新增"玩法介绍"内容面板（UNO 基本规则 + 卡牌图鉴）
- 触发方式：TopBar 按钮 + 键盘快捷键
- 视觉：毛玻璃半透明风格，窄宽无遮罩
- 全局滚动条美化

## 架构设计

### 组件层级

```
GamePage
├── TopBar — 新增 InfoDrawer 触发按钮（? 图标）
├── InfoDrawer — 抽屉容器（仅桌面端渲染）
│   ├── InfoDrawerHeader — 标题 + 关闭按钮
│   ├── InfoDrawerTabs — 水平 Tab 栏
│   └── Tab 内容区（条件渲染）
│       ├── GameRulesPanel — 新增，玩法介绍
│       ├── HouseRulesCard — 复用，embedded 模式
│       ├── GameLog — 复用，embedded 模式
│       └── ChatBox — 复用，embedded 模式
├── MobileFAB — 新增"玩法"入口（仅移动端）
│   └── BottomSheet → GameRulesPanel embedded
└── （其余现有组件不变）
```

### 桌面端改动

移除 GamePage 中以下固定面板的独立渲染：
- 左侧 `HouseRulesCard`（`hidden md:block fixed left-4 bottom-24`）
- 右侧 `GameLog`（`hidden md:block fixed right-4 bottom-24`）
- 右下 `ChatBox`（`hidden md:flex fixed`）

这三者统一迁入 InfoDrawer 的对应 Tab 中。

### 移动端改动

保持现有 `MobileFAB` + `BottomSheet` 模式不变。在 MobileFAB 的 Panel 联合类型中新增 `'gameplay'`，对应打开 `GameRulesPanel`（embedded 模式）。

## 详细设计

### InfoDrawer 组件

**位置与尺寸：**
- 固定定位，右侧贴边，全高（`fixed right-0 top-0 bottom-0`）
- 宽度 `w-[360px]`（约 25vw）
- z-index 使用现有 `z-panel`（低于 modal）

**视觉风格：**
- 背景 `bg-slate-950/85 backdrop-blur-xl`
- 左边缘 `border-l border-white/15`
- 内部卡片复用现有 `bg-slate-800/50 border border-white/10 rounded-lg` 风格

**动画：**
- framer-motion `AnimatePresence` + `motion.div`
- 从右侧滑入：`initial={{ x: '100%' }}` → `animate={{ x: 0 }}`
- 过渡：`type: 'spring', damping: 25, stiffness: 300`

**触发方式：**
- TopBar 新增 `HelpCircle`（lucide-react）图标按钮
- 键盘快捷键：`h` 或 `?` 键，通过 `useEffect` + `keydown` 监听
- 快捷键仅在无输入框聚焦时生效（排除聊天输入等场景）

### InfoDrawerTabs 组件

**布局：**
- 水平排列，`flex gap-0`，底部 `border-b border-white/10` 分隔线
- 每个 Tab：`px-3.5 py-2 text-sm cursor-pointer`
- 激活态：`text-blue-500 font-medium` + 底部 `border-b-2 border-blue-500`
- 非激活态：`text-slate-500 hover:text-slate-300`

**Tab 列表：**

| key | 标签 | 内容组件 |
|-----|------|----------|
| `rules` | 玩法 | GameRulesPanel |
| `house-rules` | 村规 | HouseRulesCard（embedded） |
| `log` | 日志 | GameLog（embedded） |
| `chat` | 聊天 | ChatBox（embedded） |

默认激活 `rules` Tab。

### GameRulesPanel 组件（新增）

唯一需要完全新建的内容面板。

**内容分区（可折叠 section）：**

1. **基本规则**
   - 出牌规则：匹配颜色或数字/符号
   - 摸牌规则：无牌可出时摸一张
   - 回合流程：出牌 → 下一位

2. **卡牌图鉴**
   - 数字牌（0-9，四色）：迷你卡面 + "匹配数字或颜色即可出"
   - 跳过牌（Skip）：效果说明
   - 反转牌（Reverse）：效果说明
   - +2 牌（Draw Two）：效果说明
   - 万能牌（Wild）：效果说明
   - +4 万能牌（Wild Draw Four）：效果说明 + 质疑规则

3. **UNO 喊牌**
   - 剩 1 张时必须喊 UNO
   - 被抓罚摸牌数量
   - 抓牌时机

4. **胜利与计分**
   - 出完手牌获胜
   - 计分方式（数字牌面值，功能牌 20 分，万能牌 50 分）
   - 目标分数

**实现：** 纯静态中文文案，硬编码在组件内，不依赖后端。每个 section 用 `disclosure` 模式（点击标题展开/折叠），默认全部展开。

### 状态管理

在 `game-store.ts` 中新增：

```typescript
infoDrawerOpen: boolean       // 默认 false
infoDrawerTab: 'rules' | 'house-rules' | 'log' | 'chat'  // 默认 'rules'
toggleInfoDrawer: () => void
setInfoDrawerTab: (tab: InfoDrawerTab) => void
```

### 全局滚动条美化

在 `index.css` 中新增 Tailwind v4 utility：

```css
@utility scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.3) transparent;

  &::-webkit-scrollbar {
    width: 6px;
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

应用范围：
- InfoDrawer 内容区
- GameLog 滚动区
- ChatBox 消息列表
- HouseRulesCard 内容区
- 其他现有使用 `scrollbar-hidden` 的地方视情况替换

## 文件清单

### 新增文件
- `packages/client/src/features/game/components/InfoDrawer.tsx` — 抽屉容器 + Tab 栏
- `packages/client/src/features/game/components/GameRulesPanel.tsx` — 玩法介绍面板

### 修改文件
- `packages/client/src/features/game/pages/GamePage.tsx` — 引入 InfoDrawer，移除桌面端独立面板渲染
- `packages/client/src/features/game/components/TopBar.tsx` — 新增触发按钮
- `packages/client/src/features/game/components/MobileFAB.tsx` — 新增 `gameplay` Panel 类型
- `packages/client/src/features/game/stores/game-store.ts` — 新增 drawer 状态
- `packages/client/src/index.css` — 新增 `scrollbar-thin` utility

## 不做的事

- 不改变移动端 BottomSheet 的基本交互模式
- 不新增后端 API（全部为客户端静态内容或复用现有组件）
- 不引入新依赖库
- 不做抽屉宽度可拖拽调整
