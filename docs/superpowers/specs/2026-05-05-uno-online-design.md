# UNO Online — 设计规格文档

## 概述

一款基于 Web 技术栈的在线多人 UNO 卡牌对战游戏，支持完整原版规则、32 条可配置村规、SFU 语音通话、卡通趣味视觉风格。

## 需求总结

- 2-10 人房间制对战（仅好友房间，房间码加入）
- 完整原版 UNO 规则 + 32 条可配置村规
- SFU 语音通话（mediasoup）
- GitHub OAuth 登录
- 桌面/移动双端响应式
- 卡通趣味视觉风格（圆润造型、弹跳动画、粗边框、活泼排版）

## 1. 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite |
| 状态管理 | Zustand |
| 动画 | CSS Animations + Framer Motion |
| 后端 | Fastify + TypeScript |
| 实时通信 | Socket.IO (WebSocket) |
| 语音 | mediasoup (SFU) |
| 数据库 | PostgreSQL (Prisma ORM) |
| 缓存 | Redis |
| 认证 | GitHub OAuth + JWT |
| Monorepo | pnpm workspace |

## 2. 项目结构

```
uno-online/
├── package.json              # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── client/               # React 前端 (Vite + React 18)
│   │   ├── src/
│   │   │   ├── components/   # UI 组件
│   │   │   ├── game/         # 游戏渲染、动画、交互
│   │   │   ├── voice/        # 语音通话 UI 与 mediasoup-client
│   │   │   ├── hooks/        # 自定义 hooks
│   │   │   ├── stores/       # Zustand 状态管理
│   │   │   ├── pages/        # 页面（大厅、房间、游戏）
│   │   │   └── styles/       # 全局样式、主题
│   │   └── package.json
│   ├── server/               # Node.js 后端 (Fastify)
│   │   ├── src/
│   │   │   ├── api/          # REST API（认证、房间 CRUD）
│   │   │   ├── ws/           # WebSocket 游戏通信
│   │   │   ├── voice/        # mediasoup SFU 集成
│   │   │   ├── game/         # 服务端游戏会话管理
│   │   │   ├── auth/         # GitHub OAuth + JWT
│   │   │   └── db/           # Prisma ORM
│   │   └── package.json
│   └── shared/               # 共享包
│       ├── src/
│       │   ├── rules/        # UNO 规则引擎（纯逻辑）
│       │   ├── types/        # 类型定义
│       │   └── constants/    # 游戏常量
│       └── package.json
```

## 3. UNO 规则引擎 (shared/rules)

### 3.1 卡牌定义

总计 108 张牌：

| 类别 | 说明 | 数量 |
|------|------|------|
| 数字 0 | 每色 1 张 × 4 色 | 4 |
| 数字 1-9 | 每色 2 张 × 4 色 | 72 |
| Skip | 每色 2 张 × 4 色 | 8 |
| Reverse | 每色 2 张 × 4 色 | 8 |
| Draw Two (+2) | 每色 2 张 × 4 色 | 8 |
| Wild (变色) | 无色 | 4 |
| Wild Draw Four (+4) | 无色 | 4 |

四色：Red, Blue, Green, Yellow

### 3.2 核心规则

- **出牌规则：** 必须与弃牌堆顶牌匹配颜色、数字或符号；万能牌任何时候可出
- **方向：** 默认顺时针，Reverse 翻转方向（2 人游戏中 Reverse 等同 Skip）
- **Skip：** 跳过下一个玩家
- **Draw Two：** 下一个玩家摸 2 张并跳过回合
- **Wild：** 出牌者选择接下来的颜色
- **Wild Draw Four：** 出牌者选颜色，下家摸 4 张跳过回合。只有当手中没有与当前颜色匹配的牌时才能合法使用（可被质疑）
- **质疑（Challenge）：** 下家可以质疑 Wild Draw Four 的合法性。质疑成功，出牌者摸 4 张；质疑失败，质疑者摸 6 张
- **摸牌：** 无法出牌时从牌堆摸 1 张，摸到可出的牌可以选择立即出（只能出刚摸到的牌，不能出手中其他牌）
- **UNO 喊话：** 手中剩 1 张牌时必须喊 UNO，被其他玩家抓到未喊则罚摸 2 张
- **胜利条件：** 出完所有手牌的玩家获胜
- **牌堆耗尽：** 保留弃牌堆顶牌，其余重新洗牌作为新牌堆
- **初始手牌：** 每人发 7 张

### 3.3 起始牌特殊规则

翻开的第一张弃牌如果是功能牌：

| 牌面 | 处理 |
|------|------|
| 数字牌 | 正常开始 |
| Skip | 第一个玩家被跳过 |
| Reverse | 变为逆时针，从庄家开始出牌 |
| Draw Two | 第一个玩家摸 2 张并跳过 |
| Wild | 第一个玩家选颜色 |
| Wild Draw Four | 放回牌堆重新翻一张 |

### 3.4 计分系统

原版多轮制，赢家获得其他玩家手中剩余牌的分值：

| 牌 | 分值 |
|---|---|
| 数字牌 | 面值 |
| Skip / Reverse / Draw Two | 20 分 |
| Wild / Wild Draw Four | 50 分 |

累计先到目标分数（默认 500 分）的玩家赢得整场游戏。

### 3.5 最后一张出功能牌

赢家打出的最后一张牌是 Draw Two 或 Wild Draw Four 时，效果仍然生效——下家照样摸牌（影响计分）。

### 3.6 状态机

```
GameState:
  WAITING        → 等待玩家加入
  DEALING        → 发牌中
  PLAYING        → 游戏进行中
  CHOOSING_COLOR → 出万能牌后选颜色
  CHALLENGING    → 等待质疑 Wild Draw Four 的决定
  ROUND_END      → 一轮结束，计分
  GAME_OVER      → 游戏结束

PlayerAction:
  PLAY_CARD      → 出牌
  DRAW_CARD      → 摸牌
  CALL_UNO       → 喊 UNO
  CHALLENGE      → 质疑 +4
  ACCEPT         → 接受 +4 不质疑
  CHOOSE_COLOR   → 选择颜色
  CATCH_UNO      → 抓别人没喊 UNO
```

规则引擎设计为纯函数：`(currentState, action) => newState`，不依赖任何 I/O，方便单元测试。客户端用来做出牌合法性预判和 UI 提示，服务端用来做权威验证。

### 3.7 回合计时

- 每回合限时（可配置：15s / 30s / 60s）
- 超时自动摸牌并跳过
- 最后 10 秒倒计时变红闪烁

### 3.8 掉线处理

- 掉线后保留位置，给 60 秒重连时间
- 超时未重连则托管：自动摸牌跳过，不主动出牌
- 房间人数因掉线低于 2 人，游戏暂停或结束
- 最低开局人数：2 人

## 4. 可配置村规（32 条）

房主在开局前配置，提供预设模板：经典（全关）、派对（常见开启）、疯狂（全开）、自定义。

### 4.1 叠加规则

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 1 | +2 叠加 | 被 +2 时可出 +2 叠加给下家 | 关 |
| 2 | +4 叠加 | 被 +4 时可出 +4 叠加给下家 | 关 |
| 3 | +2 和 +4 互叠 | 被 +2 时可出 +4 叠加，反之亦然 | 关 |

### 4.2 反弹/挡罚

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 4 | Reverse 反弹 +2 | 被 +2 时出 Reverse 反弹给上家 | 关 |
| 5 | Reverse 反弹 +4 | 被 +4 时出 Reverse 反弹给上家 | 关 |
| 6 | Skip 挡罚 | 被 +2/+4 时出 Skip，惩罚转移给下家 | 关 |

### 4.3 出牌规则

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 7 | 0 牌交换手牌 | 打出 0 时所有人按方向传递手牌 | 关 |
| 8 | 7 牌指定交换 | 打出 7 时指定一人与自己交换手牌 | 关 |
| 9 | 同牌抢出（Jump-in） | 持有与弃牌堆顶完全相同的牌时可不等轮次直接抢出 | 关 |
| 10 | 同数字/符号全出 | 手中多张相同数字不同颜色可一次性全部打出 | 关 |
| 11 | 万能牌开局可出 | 第一回合可打出 Wild / Wild Draw Four | 关 |

### 4.4 摸牌规则

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 12 | 摸到能出为止 | 无牌可出时一直摸到能出的牌为止并打出 | 关 |
| 13 | 摸牌后必须出 | 摸到可出的牌时强制打出 | 关 |

### 4.5 手牌规则

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 14 | 手牌上限 | 超过数量（15/20/25）时强制出牌不能摸 | 关 |
| 15 | 强制出牌 | 有能出的牌就必须出，不能故意摸牌 | 关 |
| 16 | 手牌透明 | 手牌低于 3 张时对所有人可见 | 关 |

### 4.6 惩罚规则

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 17 | 不喊 UNO 罚摸数量 | 可选 2/4/6 张 | 2 |
| 18 | 误操作惩罚 | 出非法牌罚摸 1 张 | 关 |

### 4.7 节奏规则

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 19 | 死亡抽牌 | 牌堆无上限，洗完继续洗继续摸 | 关 |
| 20 | 快速模式 | 回合时间减半 | 关 |
| 21 | 无提示模式 | 关闭可出牌高亮 | 关 |

### 4.8 对局模式

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 22 | 淘汰制 | 不计分，每轮手牌最多者淘汰 | 关 |
| 23 | 限时闪电战 | 设定总时间，到时手牌最少者胜 | 关 |
| 24 | 复仇模式 | 被 +2/+4/Skip 攻击后，下回合出的 +2 变为 +4，出的 +4 变为 +8 | 关 |

### 4.9 社交/终局规则

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 25 | 静默 UNO | 取消 UNO 喊话机制 | 关 |
| 26 | 团队模式（2v2/3v3） | 偶数玩家时对面玩家是队友 | 关 |
| 27 | 空手赢不算 | 最后一张不能是功能牌（+2/+4） | 关 |
| 28 | 末牌限制 | 最后一张不能是万能牌 | 关 |
| 29 | 积分翻倍 | 赢家分数翻倍 | 关 |

### 4.10 趣味规则

| # | 规则 | 说明 | 默认 |
|---|------|------|------|
| 30 | 无质疑 +4 | 关闭 +4 质疑机制 | 关 |
| 31 | 暗牌模式 | 摸牌看不到牌面，出牌才翻开，不合法收回罚摸 1 张 | 关 |
| 32 | 炸弹牌 | 同回合打出 3 张以上同数字时所有其他人各摸 1 张 | 关 |

> 注：总计 32 条可配置村规。

### 4.11 房间设置（非村规）

| 设置 | 选项 | 默认 |
|------|------|------|
| 回合时间 | 15s / 30s / 60s | 30s |
| 目标分数 | 200 / 300 / 500 | 500 |
| 村规预设 | 经典 / 派对 / 疯狂 / 自定义 | 经典 |

## 5. 网络通信架构

### 5.1 连接方式

- **REST API (Fastify)** — 认证、用户信息、房间创建/列表等低频操作
- **WebSocket (Socket.IO)** — 游戏实时通信，房间内所有游戏事件
- **mediasoup (WebRTC SFU)** — 语音通话，信令走 WebSocket 通道

### 5.2 客户端-服务端同步模型

权威服务器 + 客户端预测模式：

```
客户端                          服务端
  │                               │
  ├─ 点击出牌                      │
  ├─ 本地规则引擎预判 → 合法       │
  ├─ 乐观更新 UI（牌飞出动画）     │
  ├──── PLAY_CARD ───────────────→│
  │                               ├─ 服务端规则引擎验证
  │                               ├─ 合法 → 更新权威状态
  │←──── STATE_UPDATE ────────────┤
  ├─ 确认，保持 UI                 │
  │                               │
  │  若服务端判定非法:              │
  │←──── ACTION_REJECTED ─────────┤
  ├─ 回滚 UI，提示非法             │
```

### 5.3 事件定义

**客户端 → 服务端：**

| 事件 | 说明 |
|------|------|
| room:create | 创建房间 |
| room:join | 加入房间（房间码） |
| room:leave | 离开房间 |
| game:start | 房主开始游戏 |
| game:play_card | 出牌 { cardId, chosenColor? } |
| game:draw_card | 摸牌 |
| game:call_uno | 喊 UNO |
| game:catch_uno | 抓人没喊 UNO { targetPlayerId } |
| game:challenge | 质疑 +4 |
| game:accept | 接受 +4 不质疑 |
| game:choose_color | 选颜色 { color } |
| voice:join | 加入语音 |
| voice:leave | 退出语音 |
| chat:message | 发送文字聊天 |

**服务端 → 客户端：**

| 事件 | 说明 |
|------|------|
| room:updated | 房间状态变更 |
| game:state | 完整游戏状态同步（加入/重连时） |
| game:update | 增量游戏状态更新 |
| game:action_rejected | 动作被拒绝 + 原因 |
| game:card_drawn | 摸牌结果（仅发给摸牌者） |
| game:opponent_drew | 对手摸牌（广播，不含牌面） |
| game:round_end | 回合结束 + 计分 |
| game:over | 游戏结束 |
| player:timeout | 玩家超时自动操作 |
| player:disconnected | 玩家掉线通知 |
| player:reconnected | 玩家重连通知 |
| voice:peer_joined | 语音成员加入 |
| voice:peer_left | 语音成员离开 |
| chat:message | 广播文字聊天 |

### 5.4 信息安全

- 每个玩家只收到自己的手牌信息，对手手牌只同步数量
- 服务端是唯一的规则权威，客户端预判仅用于 UI 响应
- 房间码 6 位字母数字，随机生成，避免顺序猜测

## 6. 数据模型

### 6.1 PostgreSQL (Prisma)

```prisma
model User {
  id         String       @id @default(uuid())
  githubId   String       @unique
  username   String
  avatarUrl  String?
  totalGames Int          @default(0)
  totalWins  Int          @default(0)
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
  gamePlayers GamePlayer[]
}

model GameRecord {
  id          String       @id @default(uuid())
  roomCode    String
  playerCount Int
  winnerId    String
  rounds      Int
  duration    Int          // 秒
  createdAt   DateTime     @default(now())
  players     GamePlayer[]
}

model GamePlayer {
  id        String     @id @default(uuid())
  gameId    String
  userId    String
  finalScore Int
  placement Int        // 名次
  createdAt DateTime   @default(now())
  game      GameRecord @relation(fields: [gameId], references: [id])
  user      User       @relation(fields: [userId], references: [id])
}
```

### 6.2 Redis (临时游戏数据)

| Key | 类型 | 说明 |
|-----|------|------|
| room:{roomCode} | Hash | 房间元信息（房主、设置、状态） |
| room:{roomCode}:players | List | 玩家列表及准备状态 |
| game:{roomCode}:state | Hash | 当前游戏状态（方向、当前玩家、弃牌堆顶） |
| game:{roomCode}:deck | List | 牌堆 |
| game:{roomCode}:discard | List | 弃牌堆 |
| game:{roomCode}:hand:{playerId} | List | 玩家手牌 |
| game:{roomCode}:scores | Hash | 各玩家累计分数 |
| game:{roomCode}:timer | String | 当前回合超时时间戳 |

游戏结束时将结果写入 PostgreSQL，然后清理 Redis 中该房间所有 key。

## 7. 语音通话系统

### 7.1 架构

```
玩家A 浏览器              服务端 (mediasoup)           玩家B 浏览器
  │                           │                           │
  ├─ 麦克风采集                │                           │
  ├─ mediasoup-client          │                           │
  ├── Producer (上行) ────────→│ Router                    │
  │                           ├── Consumer (下行) ────────→│
  │                           │                           ├─ 扬声器播放
  │←──── Consumer ────────────┤←── Producer ──────────────┤
```

### 7.2 关键设计

- mediasoup 作为 SFU 引擎，每个房间创建一个 Router
- 信令复用游戏 WebSocket 连接
- 只传输音频，不支持视频
- 音频编码用 Opus

### 7.3 用户控制

- 进入房间时语音默认关闭，手动加入
- 支持麦克风静音/取消静音
- 支持扬声器静音（全部或单独屏蔽某人）
- UI 显示谁在说话（音量检测指示器）

### 7.4 容错

- 语音连接失败不影响游戏进行
- 语音断线自动重连，最多重试 3 次
- 玩家掉线时自动清理其 Producer/Consumer 资源

## 8. UI 布局设计

### 8.1 游戏界面布局

- **顶栏** — 房间号、回合计时器、语音状态
- **对手行** — 头像 + 手牌数展示在顶部一排，当前玩家金色高亮，最多 9 人自动排列
- **中央区域** — 牌堆 + 弃牌堆 + 方向指示环
- **操作按钮** — "喊 UNO!" 和 "抓!" 按场景出现
- **手牌区** — 底部扇形手牌，可出的牌金色发光并上浮
- **语音控制** — 右侧边栏麦克风/静音/设置
- **移动端** — 同布局响应式缩放，手牌区可左右滑动

### 8.2 视觉风格

卡通趣味风格：

- 圆润造型（大圆角卡牌 border-radius: 18px）
- 粗白色边框（border: 4px solid white）
- 卡通字体（Comic Sans MS / 类似风格）
- 硬阴影（box-shadow 偏移，无模糊）
- 明亮饱和的颜色
- 弹跳、抖动、缩放动画
- 深色渐变游戏背景

## 9. 页面流程与路由

```
/                   → 首页（未登录显示 GitHub 登录按钮）
/auth/callback      → GitHub OAuth 回调
/lobby              → 大厅（创建房间 / 输入房间码加入）
/room/:roomCode     → 房间等待页（玩家列表、准备状态、房主开始按钮）
/game/:roomCode     → 游戏页面
/profile            → 个人信息 + 历史战绩
```

### 9.1 页面说明

- **首页** — 品牌展示 + GitHub 一键登录，登录后跳转大厅
- **大厅** — 两个核心操作：创建房间（获取房间码）、输入 6 位房间码加入
- **房间等待页** — 玩家列表（头像+昵称），准备按钮，村规设置面板，全员准备后房主可点开始，可在此加入语音
- **游戏页** — 游戏主界面，结束后显示计分面板，可选"再来一局"或"返回大厅"
- **个人信息** — 用户名、头像、总场次、胜率、最近对局记录

## 10. 动画与交互

| 动画 | 说明 |
|------|------|
| 出牌 | 手牌飞向弃牌堆，带旋转和缩放，落地弹跳 |
| 摸牌 | 牌从牌堆飞向手牌区，翻转揭牌效果 |
| Skip | 禁止符号飞过被跳过玩家 |
| Reverse | 方向环旋转翻转 |
| +2/+4 | 数字弹出动画 |
| UNO 喊话 | 屏幕中央大号 "UNO!" 文字，抖动+缩放 |
| 抓人成功 | 被抓玩家头像抖动，罚牌飞入动画 |
| 选颜色 | 四色选择盘弹出，选中后颜色扩散到弃牌堆 |
| 胜利 | 彩纸纷飞效果 + 胜者头像放大 |
| 回合切换 | 当前玩家指示器平滑滑动 |
| 倒计时警告 | 最后 10 秒计时器变红闪烁 |

使用 CSS Animations + Framer Motion 实现，保证 60fps。

## 11. 音效系统

- 出牌音效（不同功能牌不同音效）
- 摸牌音效
- UNO 喊话语音效果
- 倒计时滴答声
- 胜利/失败音效
- 玩家加入/离开提示音
- 支持音量调节和静音

## 12. 文字聊天

- 简单文字聊天框 + 快捷表情
- 作为语音通话的补充
- 通过 WebSocket chat:message 事件通信

## 13. 错误处理与边界情况

### 13.1 网络异常

- **WebSocket 断线** — 自动重连（指数退避，最多 5 次），重连后服务端推送完整游戏状态同步
- **重连期间** — UI 显示"连接中..."遮罩，游戏状态冻结
- **重连失败** — 提示刷新页面，通过 JWT 恢复身份后重新加入房间

### 13.2 玩家行为

- **中途刷新页面** — 等同断线重连，通过 userId + roomCode 恢复
- **关闭标签页** — 触发 beforeunload 确认，确认离开则进入掉线托管
- **房主掉线** — 自动转移房主权限给下一个玩家
- **所有人掉线** — 游戏状态在 Redis 中保留 5 分钟，超时清理

### 13.3 游戏边界

- **牌堆耗尽** — 弃牌堆（除顶牌）洗牌后作为新牌堆，播放洗牌动画
- **同时操作** — 服务端按消息到达顺序处理，后到的无效操作返回 ACTION_REJECTED
- **UNO 抓人时机** — 从出倒数第二张牌到下一个玩家出牌前，窗口期内任何人可点"抓"

### 13.4 安全防护

- **频率限制** — 每个 WebSocket 连接限制消息频率
- **状态校验** — 所有客户端动作经服务端规则引擎验证
- **房间隔离** — 玩家只能收到自己所在房间的消息

### 13.5 多标签页/多设备

- 同一账号只允许一个活跃连接，新连接踢掉旧连接
- 旧标签页显示"已在其他地方登录"

## 14. 色盲友好

- 卡牌上增加颜色符号标识（红=♦ 蓝=♠ 绿=♣ 黄=♥）
- 设置中可开启色盲模式，使用纹理/图案区分颜色

## 15. 浏览器兼容性

- 支持 Chrome 74+、Firefox 68+、Safari 14+、Edge 79+
- 不支持的浏览器语音功能降级禁用，游戏本身仍可玩
