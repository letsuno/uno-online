# UNO Online 前后端通信协议文档

本文档按当前代码整理 REST API、Socket.IO 事件、认证方式和核心数据结构。除 Socket.IO 连接外，所有 HTTP API 均挂载在 `/api` 前缀下。

---

## 一、认证机制

### JWT Token

- **格式**: `Authorization: Bearer <token>`
- **有效期**: 7 天
- **签发位置**: `packages/server/src/auth/jwt.ts`
- **Payload**:

```typescript
interface TokenPayload {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string | null;
  role: UserRole; // 'normal' | 'member' | 'vip' | 'admin'
}
```

### 客户端存储

| 客户端 | 存储 Key | 说明 |
|--------|---------|------|
| 前端 (`packages/client`) | `localStorage.token` | 用户 JWT Token |
| 管理后台 (`packages/admin`) | `localStorage.admin_token` | 管理员 JWT Token；初始化时也会尝试复用主站 `token` |

### API Key 认证（MCP 客户端）

- **格式**: `uno_ak_` + 32 字符 base64url 随机串
- **存储**: 数据库只保存 SHA-256 哈希和脱敏预览，明文仅在创建时返回一次
- **用途**: MCP 客户端使用 API Key 直连 Socket.IO，不需要 JWT
- **管理限制**: 每用户最多 10 个，名称最长 50 字符
- **验证限流**: `/api/api-keys/verify` 每 IP 每分钟 10 次

### Socket.IO 认证

Socket.IO 连接通过 `auth.token` 传递凭证：

```typescript
// Web 客户端：JWT
io(serverUrl, { auth: { token: jwtToken } });

// MCP 客户端：API Key
io(serverUrl, { auth: { token: 'uno_ak_...' } });
```

服务端中间件 `authenticateSocketAsync` 会根据 `uno_ak_` 前缀区分 API Key 和 JWT。认证通过后，`TokenPayload` 挂载到 `socket.data.user`。

---

## 二、REST API 端点

### 2.1 通用端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/health` | 无 | 健康检查 |
| `GET` | `/api/server/info` | 无 | 获取服务器公开状态，并返回 `Access-Control-Allow-Origin: *` |

`/api/health` 响应：

```typescript
{ status: 'ok' }
```

`/api/server/info` 响应：

```typescript
interface ServerInfo {
  name: string;
  version: string;
  motd: string;
  onlinePlayers: number;
  activeRooms: number;
  uptime: number; // 秒
}
```

### 2.2 认证相关

| 方法 | 路径 | 模式 | 认证 | 说明 |
|------|------|------|------|------|
| `GET` | `/api/auth/config` | 全部 | 无 | 获取 `devMode` 和 GitHub Client ID |
| `POST` | `/api/auth/dev-login` | 仅 `DEV_MODE=true` | 无 | 开发模式临时用户登录 |
| `GET` | `/api/auth/me` | 全部 | JWT | 获取当前用户 |
| `POST` | `/api/auth/register` | 仅生产模式 | 无 | 用户名密码注册 |
| `POST` | `/api/auth/login` | 仅生产模式 | 无 | 用户名密码登录 |
| `POST` | `/api/auth/set-password` | 仅生产模式 | JWT | 设置或修改密码 |
| `GET` | `/api/auth/github` | 仅生产模式 | 无 | 重定向到 GitHub OAuth 授权页 |
| `POST` | `/api/auth/callback` | 仅生产模式 | 无 | GitHub OAuth code 换取登录态 |
| `POST` | `/api/auth/bind-github` | 仅生产模式 | 无 | 将 GitHub 账号绑定到已有账号 |

主要请求/响应：

```typescript
// POST /api/auth/dev-login
{ username: string }
// -> { token: string; user: User }

// POST /api/auth/register
{ username: string; password: string; nickname: string; avatar?: string }
// -> { token: string; user: User }

// POST /api/auth/login
{ username: string; password: string }
// -> { token: string; user: User }

// POST /api/auth/callback
{ code: string }
// -> { token: string; user: User; isNewUser?: boolean }
// -> { needsBind: true; username: string; githubId: string; githubAvatarUrl?: string }

// POST /api/auth/bind-github
{ username: string; password: string; githubId: string; githubAvatarUrl?: string }
// -> { token: string; user: User }
```

### 2.3 个人资料

> 个人资料 HTTP 路由只在生产模式注册；`DEV_MODE=true` 时服务端不会注册这些端点。

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/profile` | JWT | 获取个人资料 |
| `PATCH` | `/api/profile` | JWT | 更新 `nickname` / `username` |
| `POST` | `/api/profile/avatar` | JWT | 上传或删除头像 |
| `GET` | `/api/avatar/:userId` | 无 | 获取头像二进制，支持 `ETag` / `304` |

```typescript
// GET /api/profile
{
  user: {
    id: string;
    username: string;
    nickname: string;
    avatarUrl: string | null;
    githubId: string | null;
    role: string;
  };
}

// PATCH /api/profile
{ nickname?: string; username?: string }
// -> { success: true }

// POST /api/profile/avatar
{ avatar: string } // base64 data URI；空值表示删除头像
// -> { success: true; avatarUrl: string | null }
```

### 2.4 管理后台

管理后台 API 需要 `admin` 角色 JWT。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/admin/dashboard` | 统计总用户数和活跃房间数 |
| `GET` | `/api/admin/users` | 分页用户列表，支持 `search` / `page` / `limit` |
| `PATCH` | `/api/admin/users/:id/role` | 修改用户角色 |
| `PATCH` | `/api/admin/users/:id/profile` | 修改用户 `username` / `nickname` |
| `GET` | `/api/admin/rooms` | 管理端房间列表 |
| `DELETE` | `/api/admin/rooms/:code` | 强制解散房间数据 |
| `POST` | `/api/admin/rooms/:code/cheat` | 触发反作弊全屏警告并解散房间 |

```typescript
// GET /api/admin/dashboard
{ totalUsers: number; activeRooms: number }

// GET /api/admin/users
{
  users: Array<{ id: string; username: string; nickname: string; role: string; createdAt: string }>;
  total: number;
  page: number;
  limit: number;
}

// PATCH /api/admin/users/:id/role
{ role: UserRole }
// -> { success: true }

// PATCH /api/admin/users/:id/profile
{ username?: string; nickname?: string }
// -> { success: true }

// GET /api/admin/rooms
{
  rooms: Array<{
    code: string;
    ownerId: string;
    status: string;
    playerCount: number;
    players: Array<{ userId: string; nickname: string }>;
    createdAt: string;
  }>;
}
```

### 2.5 观战房间列表

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/rooms/active` | JWT | 获取允许观战且正在游戏中的房间 |

响应是数组，不包裹 `{ rooms }`：

```typescript
Array<{
  roomCode: string;
  players: Array<{ nickname: string; avatarUrl?: string | null }>;
  playerCount: number;
  startedAt: string;
  spectatorCount: number;
  spectatorMode: 'full' | 'hidden';
}>
```

### 2.6 API Key 管理

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/api/api-keys` | JWT | 创建 API Key |
| `GET` | `/api/api-keys` | JWT | 列出当前用户 API Key |
| `DELETE` | `/api/api-keys/:id` | JWT | 删除自己的 API Key |
| `POST` | `/api/api-keys/verify` | 无 | 验证 API Key 并返回用户信息 |

```typescript
// POST /api/api-keys
{ name: string }
// -> 201 { id: string; key: string; name: string; userId: string; createdAt: string }

// GET /api/api-keys
Array<{ id: string; name: string; keyPreview: string; createdAt: string; lastUsedAt: string | null }>

// POST /api/api-keys/verify
{ key: string }
// -> { userId: string; username: string; nickname: string; avatarUrl: string | null; role: string }
```

---

## 三、Socket.IO 事件协议

### 3.1 通用约定

- **认证**: `auth.token`，支持 JWT 和 `uno_ak_` API Key
- **回调响应**: 带 callback 的事件一般返回 `{ success: boolean; error?: string; ...data }`
- **全局限流**: 每连接每秒 20 条 Socket 消息
- **聊天限流**: 每用户 5 秒 10 条
- **单用户连接**: 同一用户新连接会踢掉旧连接，并发送 `auth:kicked`
- **重连窗口**: 断线 60 秒内可恢复；超时后进入托管
- **全员断线清理**: 游戏中所有玩家断线 5 分钟后解散房间
- **类型定义**: `packages/shared/src/types/socket-events.ts`

### 3.2 客户端 -> 服务端事件

#### 通用/房间

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `user:current_room` | 无 | `{ roomCode: string \| null }` |
| `room:create` | `Partial<RoomSettings>` | `{ success, roomCode?, players?, room?, voiceChannelId?, error? }` |
| `room:join` | `roomCode: string` | `{ success, players?, room?, rejoin?, voiceChannelId?, error? }` |
| `room:rejoin` | `roomCode: string` | `{ success, gameState?, players?, room?, isSpectator?, error? }` |
| `room:leave` | 无 | `{ success, dissolved?, error? }` |
| `room:ready` | `ready: boolean` | `{ success, error? }` |
| `room:toggle_spectator` | `spectator: boolean` | `{ success, error? }` |
| `room:update_settings` | `Partial<RoomSettings>` | `{ success, room?, error? }` |
| `room:dissolve` | 无 | `{ success, error? }` |
| `room:transfer_owner` | `{ targetId: string }` | `{ success, error? }` |
| `room:kick` | `{ targetId: string }` | `{ success, error? }` |
| `room:spectate` | `roomCode: string` | `{ success, error? }`，成功时会额外推送 `game:state` |

#### 游戏操作

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `game:start` | 无 | `{ success, gameState?, error? }` |
| `game:play_card` | `{ cardId: string; chosenColor?: Color }` | `{ success, error? }` |
| `game:draw_card` | `{ side?: 'left' \| 'right' }` | `{ success, error? }` |
| `game:pass` | 无 | `{ success, error? }` |
| `game:call_uno` | 无 | `{ success, error? }` |
| `game:catch_uno` | `{ targetPlayerId: string }` | `{ success, error? }` |
| `game:challenge` | 无 | `{ success, error? }` |
| `game:accept` | 无 | `{ success, error? }` |
| `game:choose_color` | `{ color: Color }` | `{ success, error? }` |
| `game:choose_swap_target` | `{ targetId: string }` | `{ success, error? }` |
| `game:next_round` | 无 | `{ success, started?, vote?, error? }` |
| `game:kick_player` | `{ targetId?: string }` | `{ success, error? }` |
| `game:spectator_join` | 无 | `{ success, queued?, error? }` |
| `game:leave_to_spectate` | 无 | `{ success, error? }` |
| `game:back_to_room` | 无 | `{ success, error? }` |
| `game:autopilot_once` | 无 | `{ success, error? }` |
| `player:toggle-autopilot` | 无 | `{ success, autopilot?, error? }` |

#### 聊天、互动、语音

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `chat:message` | `{ text: string }` | 无 |
| `throw:item` | `{ targetId: string; item: string }` | `{ success, error? }` |
| `voice:channel:get` | 无 | `{ success, voiceChannelId?: number \| null }` |
| `voice:presence:get` | 无 | `Record<string, VoicePresence>` |
| `voice:presence` | `Partial<VoicePresence>` | `{ success, error? }` |
| `voice:force_mute` | `{ targetId: string; muted: boolean }` | `{ success, error? }` |

有效投掷物品：`['🥚', '🍅', '🌹', '💩', '👍', '💖']`。

### 3.3 服务端 -> 客户端事件

#### 游戏状态

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `game:state` | `PlayerView` | 完整游戏状态，初始化、重连、新回合时发送 |
| `game:update` | `PlayerView` | 游戏状态更新 |
| `game:card_drawn` | `{ card: Card }` | 仅发给摸牌者；暗牌模式不会发送 |
| `game:action_rejected` | `{ action?: string; reason: string }` | 操作被拒绝 |
| `game:next_round_vote` | `{ votes: number; required: number; voters: string[] }` | 下一轮投票状态 |
| `game:over` | `{ winnerId, scores, reason?, gameOverAt }` | 游戏结束；类型见下方 |
| `game:round_end` | `{ winnerId, scores, roundEndAt }` | 回合结束；类型见下方 |
| `game:kicked` | `{ reason: string; toSpectator?: boolean }` | 被房主移出或移至观战席 |
| `game:back_to_room` | `{ players: Record<string, unknown>[]; room: Record<string, unknown> }` | game over 后房主返回房间 |
| `game:spectator_queue` | `{ queue: string[]; nickname: string; joined: boolean }` | 观众申请加入下一轮队列 |
| `game:cheat_detected` | 无 | 触发反作弊全屏警告 |

`game:over` / `game:round_end` 载荷类型：

```typescript
{ winnerId: string | null; scores: Record<string, number>; reason?: string; gameOverAt: number }  // game:over
{ winnerId: string | null; scores: Record<string, number>; roundEndAt: number }                    // game:round_end
```

#### 房间、玩家、认证

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `room:updated` | `Record<string, unknown>` | 房间状态或玩家列表更新 |
| `room:dissolved` | `{ reason?: string }` | 房间被解散 |
| `room:rejoin_redirect` | `{ roomCode: string }` | 已在进行中房间，提示客户端跳转 |
| `room:spectator_joined` | `{ nickname: string; spectators: SpectatorInfo[] }` | 观众加入 |
| `room:spectator_left` | `{ nickname: string; spectators: SpectatorInfo[] }` | 观众离开 |
| `room:spectator_list` | `{ spectators: SpectatorInfo[] }` | 当前观众列表 |
| `player:timeout` | `{ playerId: string }` | 玩家超时 |
| `player:disconnected` | `{ playerId: string }` | 玩家断线 |
| `player:reconnected` | `{ playerId: string }` | 玩家重连 |
| `player:autopilot` | `{ playerId: string; enabled: boolean }` | 托管状态变化 |
| `auth:kicked` | `{ reason: string }` | 同账号多端登录导致旧连接被踢 |
| `server:version` | `{ version: string; serverTime: number }` | 连接时发送；`version` 当前为服务端启动时间字符串 |

#### 聊天、互动、语音

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `chat:message` | `ChatMessage` | 聊天消息 |
| `chat:history` | `ChatMessage[]` | 加入房间/观战/重连时推送 |
| `chat:cleared` | 无 | 聊天历史被清空 |
| `chat:rate_limited` | `{ message: string }` | 聊天限流提示 |
| `throw:item` | `{ fromId: string; targetId: string; item: string }` | 投掷物品动画 |
| `voice:presence` | `Record<string, VoicePresence>` | 语音状态广播 |

---

## 四、核心数据类型

### 4.1 User

```typescript
interface User {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: string;
}
```

### 4.2 RoomSettings

```typescript
interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500 | 1000;
  houseRules: HouseRules;
  allowSpectators: boolean;
  spectatorMode: 'full' | 'hidden';
}
```

### 4.3 RoomData / RoomPlayer

```typescript
interface RoomData {
  ownerId: string;
  status: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;
  createdAt: string;
  lastActivityAt: string;
}

interface RoomPlayer {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  ready: boolean;
  spectator: boolean;
  role?: string;
  isBot: boolean;
}
```

### 4.4 PlayerView

```typescript
interface PlayerViewPlayer {
  id: string;
  name: string;
  hand: Card[];
  handCount: number;
  score: number;
  roundWins?: number;
  connected: boolean;
  autopilot: boolean;
  calledUno: boolean;
  unoCaught?: boolean;
  eliminated?: boolean;
  teamId?: number;
  avatarUrl?: string | null;
  role?: string;
  isBot: boolean;
}

interface PlayerView {
  viewerId: string;
  phase: GamePhase;
  players: PlayerViewPlayer[];
  currentPlayerIndex: number;
  direction: 'clockwise' | 'counter_clockwise';
  discardPile: Card[];
  currentColor: Color | null;
  drawStack: number;
  pendingPenaltyDraws?: number;
  deckLeftCount: number;
  deckRightCount: number;
  roundNumber: number;
  winnerId: string | null;
  settings: RoomSettings;
  pendingDrawPlayerId: string | null;
  lastAction: GameAction | null;
  deckHash?: string;
}
```

### 4.5 GameAction / GamePhase

```typescript
type GameAction =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: Color; isJumpIn?: boolean }
  | { type: 'DRAW_CARD'; playerId: string; side: 'left' | 'right' }
  | { type: 'PASS'; playerId: string }
  | { type: 'CALL_UNO'; playerId: string }
  | { type: 'CATCH_UNO'; catcherId: string; targetId: string; catcherName?: string }
  | { type: 'CHALLENGE'; playerId: string; succeeded?: boolean; penaltyPlayerId?: string; penaltyCount?: number }
  | { type: 'ACCEPT'; playerId: string }
  | { type: 'CHOOSE_COLOR'; playerId: string; color: Color }
  | { type: 'CHOOSE_SWAP_TARGET'; playerId: string; targetId: string };

type GamePhase =
  | 'waiting'
  | 'dealing'
  | 'playing'
  | 'choosing_color'
  | 'challenging'
  | 'choosing_swap_target'
  | 'round_end'
  | 'game_over';
```

### 4.6 ChatMessage / VoicePresence

```typescript
interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  timestamp: number;
  role?: string;
  isSpectator?: boolean;
}

interface VoicePresence {
  inVoice: boolean;
  micEnabled: boolean;
  speakerMuted: boolean;
  speaking: boolean;
  forceMuted: boolean;
}
```

---

## 五、配置常量

| 常量 | 值 | 来源 | 说明 |
|------|-----|------|------|
| `MIN_PLAYERS` | 2 | `packages/shared/src/constants/deck.ts` | 最少玩家数 |
| `MAX_PLAYERS` | 10 | `packages/shared/src/constants/deck.ts` | 玩家席最多人数；观战席不计入 |
| `INITIAL_HAND_SIZE` | 7 | `packages/shared/src/constants/deck.ts` | 初始手牌数 |
| `ROOM_CODE_LENGTH` | 6 | `packages/shared/src/constants/deck.ts` | 房间码长度 |
| `DEFAULT_TARGET_SCORE` | 1000 | `packages/shared/src/constants/scoring.ts` | 默认目标分数 |
| `DEFAULT_TURN_TIME_LIMIT` | 30 | `packages/shared/src/constants/scoring.ts` | 默认回合时限（秒） |
| `UNO_PENALTY_CARDS` | 2 | `packages/shared/src/constants/scoring.ts` | UNO 惩罚抽牌数 |
| `RECONNECT_TIMEOUT_MS` | 60000 | `packages/server/src/ws/socket-handler.ts` | 掉线重连窗口 |
| `AUTOPILOT_THINK_MS` | 2000 | `packages/server/src/ws/socket-handler.ts` | 托管循环间隔 |
| `MAX_MESSAGES_PER_SECOND` | 20 | `packages/server/src/ws/rate-limiter.ts` | Socket 全局频率限制 |
| `CHAT_LIMIT` | 10 | `packages/server/src/ws/game-events.ts` | 聊天窗口内消息数 |
| `CHAT_WINDOW_MS` | 5000 | `packages/server/src/ws/game-events.ts` | 聊天限流窗口 |

---

## 六、设计取舍

### API 前缀

服务端在 `plugin-loader.ts` 中将所有 HTTP 插件注册到 `/api` 下。Vite 开发代理不能重写 `/api`，否则服务端路由无法匹配。

### `game:over` / `game:round_end` 与 `game:update`

回合或游戏结束时服务端会同时发送终态事件和 `game:update`。客户端主要通过 `game:update.phase` 驱动 UI，终态事件用于冷却计时、重连补发和 MCP 通知。

### Wild 选色

协议支持 `game:play_card` 携带 `chosenColor`，但 Web 客户端通常先出 Wild 牌进入 `choosing_color` 阶段，再发送 `game:choose_color`。

### 管理后台部署

管理后台 API 基址固定为 `/api`，需要与服务端同域或由 Caddy 反向代理到服务端。
