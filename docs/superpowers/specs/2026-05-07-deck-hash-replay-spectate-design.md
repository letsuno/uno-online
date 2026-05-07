# 牌山校验、对局回放与观战系统设计

## 概述

为 UNO Online 新增三个关联功能：

1. **牌山 Hash 校验** — 每局开始时公布牌序的 SHA-256 哈希，游戏结束后可验证
2. **对局回放** — 基于事件溯源记录完整对局过程，支持逐步回放
3. **对战列表与观战** — 大厅展示进行中的对战，支持实时观战

三个功能共用事件溯源数据模型，回放和观战是同一事件流的两种消费方式（离线 vs 实时）。

## 一、牌山 Hash 校验

### 哈希算法

SHA-256（Web Crypto API 原生支持）。

### 哈希内容

洗牌后的完整牌序，序列化为 JSON 字符串。序列化格式：

```typescript
type CardIdentity = { color: Color | null; type: CardType; value?: number };
// 序列化: JSON.stringify(deck.map(c => cardToIdentity(c)))
```

不包含 `card_id`（运行时生成，不影响牌面内容）。

### 流程

1. `initializeGame()` 洗牌后，对完整 deck 计算 SHA-256，得到 `deckHash`
2. `deckHash` 存入 `GameState`，随 `game:state` 事件广播给所有玩家
3. 客户端在游戏开始时以 Toast 形式展示 hash 值（可复制）
4. 游戏结束时，完整初始牌序和 hash 一同持久化到 `game_records` 表
5. 回放页面提供"验证牌序"功能，前端用相同算法重新计算 hash 并与存储的 hash 对比

### 多轮处理

UNO 每轮结束后会重新洗牌开始新一轮。每轮都有独立的牌序和 hash：

- 每轮 `initializeGame()` 调用时都计算新的 `deckHash`
- `GameState.deckHash` 每轮更新
- 每轮的 `game_start` 事件都包含该轮的初始牌序和 hash
- 回放中每轮都可独立验证

### 哈希计算分层

shared 包提供纯同步的序列化函数 `serializeDeck(deck: Card[]): string`，不负责哈希计算：

- **服务端**：用 Node.js `crypto.createHash('sha256')` 同步计算（避免 `initializeGame()` 变成 async）
- **客户端**（回放验证时）：用 Web Crypto API `crypto.subtle.digest('SHA-256', ...)` 异步计算

### 实现位置

- `packages/shared/src/rules/deck.ts` — 新增 `serializeDeck(deck: Card[]): string` 和 `cardToIdentity(card: Card): CardIdentity`
- `packages/server/src/plugins/core/game/session.ts` — 新增 `computeDeckHash(serialized: string): string`（用 Node crypto）
- `packages/shared/src/types/game.ts` — `GameState` 新增 `deckHash: string` 字段

## 二、事件系统与对局回放

### 数据模型

#### 新增 SQLite 表 `game_events`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 自增主键 |
| game_id | TEXT NOT NULL | FK → game_records.id |
| seq | INTEGER NOT NULL | 局内序号，从 0 开始 |
| event_type | TEXT NOT NULL | 事件类型 |
| payload | TEXT NOT NULL | JSON，事件数据 |
| player_id | TEXT | 操作者 ID（系统事件为 NULL） |
| created_at | TEXT NOT NULL | ISO 8601 时间戳 |

索引：`(game_id, seq)` 联合索引，用于按序查询事件流。

#### `game_records` 表新增字段

| 字段 | 类型 | 说明 |
|---|---|---|
| deck_hash | TEXT | SHA-256 哈希值 |
| initial_deck | TEXT | 完整初始牌序 JSON |

### 事件类型

在 `packages/shared/src/types/` 中定义：

```typescript
enum GameEventType {
  GAME_START = 'game_start',
  PLAY_CARD = 'play_card',
  DRAW_CARD = 'draw_card',
  PASS = 'pass',
  CALL_UNO = 'call_uno',
  CATCH_UNO = 'catch_uno',
  CHALLENGE = 'challenge',
  ACCEPT = 'accept',
  CHOOSE_COLOR = 'choose_color',
  CHOOSE_SWAP_TARGET = 'choose_swap_target',
  ROUND_END = 'round_end',
  GAME_OVER = 'game_over',
}
```

各事件 payload 类型：

| 事件类型 | payload 内容 |
|---|---|
| `game_start` | initialDeck, playerHands, firstDiscard, direction, settings |
| `play_card` | cardId, card, chosenColor? |
| `draw_card` | card (摸到的牌) |
| `pass` | (空对象) |
| `call_uno` | (空对象) |
| `catch_uno` | targetPlayerId |
| `challenge` | success, penaltyCards |
| `accept` | drawnCards |
| `choose_color` | color |
| `choose_swap_target` | targetId |
| `round_end` | winnerId, scores |
| `game_over` | winnerId, finalScores, reason? |

### 事件记录机制

- `GameSession` 新增 `events: GameEvent[]` 内存缓冲区
- 每次游戏操作（出牌、摸牌等）处理后，调用 `session.recordEvent(type, payload, playerId)` 追加事件
- 游戏结束时（`persistGameResult` 中），批量将 `events` 写入 `game_events` 表
- 这样避免了游戏进行中频繁写库的性能问题

### 回放 API

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/games` | GET | 近期对局列表（分页），query: page, limit(默认20) |
| `/api/games/:id` | GET | 对局详情 + 完整事件流 |
| `/api/games/:id/verify` | GET | 返回 initialDeck 和 deckHash 供前端验证 |

`GET /api/games` 返回格式：

```typescript
interface GameListItem {
  id: string;
  roomCode: string;
  players: { userId: string; nickname: string; placement: number; finalScore: number }[];
  winnerId: string;
  winnerName: string;
  playerCount: number;
  rounds: number;
  duration: number;
  deckHash: string;
  createdAt: string;
}
```

`GET /api/games/:id` 返回格式：

```typescript
interface GameDetail extends GameListItem {
  events: GameEvent[];
  settings: RoomSettings;
}
```

### 客户端回放

- **大厅展示**：LobbyPage 新增"近期对局"卡片列表，展示最近对局摘要
- **回放页面**：新增路由 `/replay/:gameId`
- **回放器功能**：
  - 逐步播放事件流，每个事件驱动一次状态变更
  - 播放控制：播放/暂停、快进（2x/4x）、逐步前进/后退、跳转到指定步骤
  - 进度条显示当前位置
  - 所有玩家手牌全部可见（回放视角 = 上帝视角）
- **积分展示**：每轮结束时的积分变化，以表格形式展示
- **hash 验证**：页面提供"验证牌序公平性"按钮，点击后前端计算 hash 并与存储值比较，显示验证结果

## 三、对战列表与观战

### 正在进行的对战列表

**数据来源**：KV 存储中已有的房间数据（`room:{code}` hash）。

**API**：`GET /api/rooms/active`

返回所有 `status='playing'` 且 `allowSpectators=true` 的房间：

```typescript
interface ActiveRoom {
  roomCode: string;
  players: { nickname: string; avatarUrl?: string }[];
  playerCount: number;
  startedAt: string;
  currentRound: number;
  spectatorCount: number;
  spectatorMode: 'full' | 'hidden';
}
```

**客户端**：

- LobbyPage 新增"正在进行的对战"卡片列表
- 每个卡片显示玩家头像、人数、当前轮次、观战人数
- 提供"观战"按钮
- 30 秒定时轮询刷新列表

### 观战功能

#### 房间设置扩展

`RoomSettings` 新增：

```typescript
interface RoomSettings {
  // ... 现有字段
  allowSpectators: boolean;   // 是否允许观战，默认 true
  spectatorMode: 'full' | 'hidden';  // 全透视 / 只看出牌，默认 'hidden'
}
```

房主在房间设置面板中可配置这两个选项。

#### Socket.IO 事件

新增事件：
- `room:spectate` (client → server) — 以观战者身份加入房间
- `room:spectator_joined` / `room:spectator_left` (server → client) — 通知房间观战者变动
- 观战者复用 `game:state` 和 `game:update` 事件，但收到的是观战者视图

#### 观战者视图

扩展 `GameSession.getPlayerView()`，新增 `getSpectatorView(mode)` 方法：

- `full` 模式：返回所有玩家的完整手牌
- `hidden` 模式：手牌为空数组，只返回手牌数量（`handCount` 字段）

#### 观战者约束

- 不能执行任何游戏操作（出牌、摸牌、挑战等），服务端拒绝并返回错误
- 可以发送聊天消息，消息带"观战"角色标记
- 可以使用扔道具功能
- 断线后可重新以观战者身份加入

#### 客户端路由

- 对战列表点击"观战" → 进入 `/game/:roomCode?spectate=true`
- 复用 GamePage 组件，根据 spectate 参数：
  - 隐藏操作按钮（出牌、摸牌、UNO、挑战）
  - 显示"观战中"状态栏
  - 根据 spectatorMode 展示或隐藏手牌

## 四、数据清理策略

- `game_events` 表数据量较大，按 `created_at` 定期清理
- 默认保留最近 30 天的对局事件数据
- `game_records` 和 `game_players` 长期保留（数据量小）
- 可通过服务器配置调整保留天数

## 五、影响范围

### packages/shared

- `types/game.ts` — GameState 新增 deckHash
- `types/` 新增 `event.ts` — GameEventType, GameEvent 类型
- `types/` 或 `types/game.ts` — RoomSettings 新增 allowSpectators, spectatorMode
- `rules/deck.ts` — 新增 hashDeck(), cardToIdentity()

### packages/server

- `db/database.ts` — 新增 game_events 表迁移，game_records 表新增字段
- `db/` 新增 `game-event-repo.ts` — 事件读写
- `db/` 新增 `game-repo.ts` — 对局列表查询（可能已有部分逻辑在 user-repo 中）
- `plugins/core/game/session.ts` — 事件记录缓冲区
- `ws/game-events.ts` — 操作时记录事件
- `ws/room-events.ts` — 观战加入/离开处理
- `ws/socket-handler.ts` — 观战者连接管理
- 新增 REST 路由：`/api/games`, `/api/games/:id`, `/api/games/:id/verify`, `/api/rooms/active`

### packages/client

- `features/lobby/pages/LobbyPage.tsx` — 新增对战列表和近期对局区域
- 新增 `features/replay/` — 回放页面和回放器组件
- `features/game/pages/GamePage.tsx` — 观战模式支持
- `features/game/store/` — 观战状态管理
- `app/router.tsx` — 新增 `/replay/:gameId` 路由
- `shared/socket.ts` — 新增观战相关事件监听
