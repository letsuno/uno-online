# UNO Online — 前端开发规范

## 技术栈

- **框架**: React 19 + TypeScript (strict)
- **构建**: Vite 8 + @vitejs/plugin-react
- **样式**: Tailwind CSS v4 (CSS-native 配置，无 tailwind.config.js)
- **状态管理**: Zustand 5
- **路由**: React Router DOM 7 + React.lazy 代码分割
- **动画**: Framer Motion 12
- **图标**: Lucide React
- **实时通信**: Socket.IO Client 4.8
- **头像裁切**: react-easy-crop（圆形裁切 + 缩放）
- **人机验证**: react-turnstile（Cloudflare Turnstile）

## 目录结构

```
packages/client/src/
  app/                    # 应用入口
    App.tsx               # 根组件（字体设置 + 主题 + Toast + ChangelogModal）
    main.tsx              # ReactDOM 渲染入口
    router.tsx            # 路由组装（lazy 加载各 feature）
  features/               # 功能模块（每个功能域独立）
    auth/
      pages/              # 页面组件
      stores/             # Zustand store
      components/         # 功能专属组件
      routes.tsx          # 路由定义（导出 RouteObject[]）
    game/
      pages/
      stores/             # game-store, game-log-store, chat-store
      components/         # GameTable, PlayerNode, DrawPile, DiscardPile,
                          # DirectionIndicator, TurnIndicator, HandSwapAnimation,
                          # Seat（空位/已入座/Bot/断线状态）, SeatCircle（圆桌座位环形布局）,
                          # SpectatorBar（观战席横排）, SettingsDrawer（右侧滑出设置面板）,
                          # SwapRequestDialog（换座请求确认弹窗）等
      hooks/              # usePlayableCardIds, usePlayerLayout, useDrawAnimation,
                          # useChatBubbles 等
      routes.tsx
    lobby/
    profile/
  shared/                 # 跨功能共享模块
    components/ui/        # 通用 UI 组件（Button, Input, IconButton, Modal, Switch, Tabs, AiBadge, GoogleRing）
    hooks/                # 跨功能 hook（useIsPortrait）
    components/           # 共享布局组件（Toast, ProtectedRoute, ServerButton, ServerSelectModal, ChangelogModal）
    lib/                  # 工具函数（cn, getRoleColor）
    stores/               # 全局 store（toast, settings, room, server）；room store 包含 `seats: RoomSeats`、`spectators: RoomSpectator[]`（替代原 `players: RoomPlayer[]`）
    utils/                # 工具函数（card-images, playable-cards, image-compress）
    data/                 # 静态数据（changelog）
    sound/                # 音效管理
    voice/                # 语音通话（mumble-web gateway 架构）
    api.ts                # HTTP 请求封装
    socket.ts             # Socket.IO 单例
    env.ts                # 环境变量
    build-info.ts         # 构建版本与时间
  index.css               # 样式装配入口（@import tailwindcss + styles/*）
  styles/                 # 设计系统：tokens.css（token 唯一定义处）、utilities.css（@utility）、effects.css（特效层）
```

> 屏幕适配与 UI 规范详见根目录 [UIUX-GUIDELINES.md](../UIUX-GUIDELINES.md)：游戏画布思路（FitScaler 整体等比缩放 + 布局模式切换），禁止断点流式重排。

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| React 组件文件 | PascalCase.tsx | `PlayerNode.tsx`, `ChatBox.tsx` |
| 非组件文件 | kebab-case.ts | `game-store.ts`, `sound-manager.ts` |
| Hook 文件 | camelCase.ts (use 前缀) | `useEffectiveUserId.ts` |
| 组件导出 | `export default function Name()` | `export default function Card()` |
| 变量/函数 | camelCase | `canPlayCard`, `handleDraw` |
| 常量 | UPPER_SNAKE_CASE | `AVATAR_COLORS`, `CHAT_LIMIT` |
| 类型/接口 | PascalCase | `PlayerInfo`, `GameState` |
| CSS 自定义属性 | --kebab-case | `--color-uno-red`, `--font-game` |

## 类型定义

- **对象结构**: 用 `interface`
- **联合类型/字面量**: 用 `type`
- **类型导入**: 始终使用 `import type { ... }`（由 `verbatimModuleSyntax` 强制）
- **跨包类型**: 从 `@uno-online/shared` 导入，不要在客户端重新定义

## 导入顺序

```typescript
// 1. 第三方库
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '@uno-online/shared';

// 2. 共享模块（@/ 别名路径）
import { cn } from '@/shared/lib/utils';
import { useGameStore } from '@/features/game/stores/game-store';

// 3. 相对路径（同 feature 内部）
import Card from './Card';
import type { PlayerInfo } from '../stores/game-store';
```

## 路径别名

- `@/*` → `./src/*`
- Feature 内部用相对路径
- 跨 Feature 或引用 shared 用 `@/shared/...` 或 `@/features/.../...`

## 组件规范

### 样式
- 使用 Tailwind 工具类，不写行内 CSS（除非动态计算的值）
- 条件类名用 `cn()` 工具函数
- 组件变体用 `class-variance-authority`（cva）
- 自定义主题 token 在 `styles/tokens.css` 的 `@theme inline` 中定义，颜色/层级/半径一律用 token，禁止硬编码

### 状态管理
- 全局状态用 Zustand store
- 组件局部状态用 `useState`
- 派生值用 `useMemo`
- 从 store 读取时使用选择器：`useGameStore((s) => s.phase)` 而非 `useGameStore()`
- 跨组件复用的计算逻辑提取为自定义 hook

### 路由
- 每个 feature 导出 `routes.tsx`，使用 `React.lazy()` 包装页面组件
- 路由在 `app/router.tsx` 中统一组装
- 受保护路由通过 `ProtectedRoute` 组件（使用 `<Outlet />`）

### Socket 事件
- 全局事件（影响 store 的事件）在 `shared/socket.ts` 中统一监听
- 组件级事件（仅影响单个组件状态）在组件内通过 `useEffect` 监听
- 必须在 `useEffect` 的 cleanup 中 `socket.off()`
- 玩家状态事件: `player:timeout`, `player:disconnected`, `player:reconnected`, `player:autopilot`（托管状态变更）
- Socket 实例使用泛型参数绑定类型：`Socket<ServerToClientEvents, ClientToServerEvents>`，事件类型定义在 `@uno-online/shared` 的 `socket-events.ts`

## 样式主题

### 颜色系统

| Token | 用途 |
|-------|------|
| `--background` / `--foreground` | 主背景 / 主文字 |
| `--primary` / `--primary-foreground` | 强调色（金色 #fbbf24） |
| `--muted-foreground` | 次要文字 |
| `--destructive` | 错误 / 危险 |
| `--card` | 卡片背景 |
| `--color-uno-red/blue/green/yellow` | UNO 卡牌颜色 |

### Z-index 分层

```
card(1) → topbar(10) → actions(20) → fab(50) → confetti(85)
→ effects(90) → timer-overlay(95) → modal(100) → connection(200) → toast(300)
```

### 卡面主题资源

内置卡面主题（复古经典 / 极简扁平 / 霓虹暗黑）由生成脚本产出，**产物提交进仓库**，构建部署零感知：

- 生成脚本：`packages/client/scripts/generate-card-themes.mjs` —— 单一设计源（模板函数），数字/字母用 Fredoka 经 fontkit 转为路径（`<img>` 内 SVG 无法使用页面 webfont，转路径保证全设备一致）
- 产物：`public/card-themes/<key>.zip`（54 张 SVG，索引与 `shared/utils/card-images.ts` 的 `cardToImageIndex` 严格一致：0-3 +2、4-43 数字 9→0、44 +4、45 万能、46-49 禁止、50-53 转向）+ `<key>-preview.svg`（选择器缩略图）
- 运行时：`loadBuiltinTheme()` fetch zip → 复用自定义资源包管线（unzip → blob URL → `<img>`）；SVG 卡面带 `isSvg` 标记，自带圆角与角标，跳过容器裁切与角标叠加
- 修改主题设计后：改模板 → 重新运行脚本 → 提交新 zip；卡面圆角须保持与默认卡面一致的 26% 宽度比例
- 选择 `<img>` 而非内联 SVG 是性能决策：浏览器栅格化一次即缓存，避免辉光滤镜成为逐帧 DOM 滤镜（移动端发热教训）

## 测试

当前客户端无测试框架。新增测试时使用 Vitest + React Testing Library。
