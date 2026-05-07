# UNO Online 前后端通信协议文档

本文档整理了项目中所有 REST API 端点、Socket.IO 事件的完整协议定义，包括请求/响应类型、认证方式和数据格式。

---

## 一、认证机制

### JWT Token

- **格式**: Bearer Token，通过 `Authorization: Bearer <token>` 头部传递
- **有效期**: 7 天
- **Payload 结构**:

```typescript
interface TokenPayload {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string | null;
  role: UserRole;  // 'normal' | 'member' | 'vip' | 'admin'
}
```

### 客户端存储

| 客户端 | 存储 Key | 说明 |
|--------|---------|------|
| 前端 (client) | `localStorage.token` | 用户 JWT Token |
| 管理后台 (admin) | `localStorage.admin_token` | 管理员 JWT Token |

### Socket.IO 认证

Socket.IO 连接通过 `auth.token` 传递 JWT：

```typescript
io(apiUrl, { auth: { token } })
```

服务端中间件 `authenticateSocket` 验证后将 `TokenPayload` 挂载到 `socket.data.user`。

---

## 二、REST API 端点

### 2.1 健康检查

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/health` | 无 | 健康检查 |

**响应**: `{ status: 'ok' }`

### 2.2 服务器信息

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/server/info` | 无 | 获取服务器状态 |

**响应** (`ServerInfo`):
```typescript
{
  name: string;       // 服务器名称
  version: string;    // 版本号
  motd: string;       // 公告
  onlinePlayers: number;
  activeRooms: number;
  uptime: number;     // 运行时间（秒）
}
```

### 2.3 认证相关

#### GET `/auth/config`
获取认证配置（无需认证）。

**响应**:
```typescript
{ devMode: boolean; githubClientId: string }
```

#### POST `/auth/dev-login`（仅开发模式）
开发模式快速登录。

**请求**: `{ username: string }`
**响应**: `{ token: string; user: User }`

#### POST `/auth/register`（仅生产模式）
注册新用户。

**请求**: `{ username: string; password: string; nickname: string; avatar?: string }`
**响应**: `{ token: string; user: User }`
**错误**: `400`（验证失败）、`409`（用户名已被使用）

#### POST `/auth/login`（仅生产模式）
用户名密码登录。

**请求**: `{ username: string; password: string }`
**响应**: `{ token: string; user: User }`
**错误**: `400`（参数缺失）、`401`（用户名或密码错误）

#### GET `/auth/me`
获取当前用户信息（需要 JWT）。

**响应** (`User`):
```typescript
{ id: string; username: string; nickname: string; avatarUrl: string | null; role: string }
```

#### POST `/auth/set-password`（仅生产模式）
设置/修改密码（需要 JWT）。

**请求**: `{ password: string }`
**响应**: `{ success: true }`

#### GET `/auth/github`（仅生产模式）
重定向到 GitHub OAuth 授权页。

#### POST `/auth/callback`（仅生产模式）
GitHub OAuth 回调处理。

**请求**: `{ code: string }`
**响应（成功）**: `{ token: string; user: User; isNewUser?: boolean }`
**响应（需要绑定）**: `{ needsBind: true; username: string; githubId: string; githubAvatarUrl?: string }`

#### POST `/auth/bind-github`（仅生产模式）
将 GitHub 账号绑定到已有用户。

**请求**: `{ username: string; password: string; githubId: string; githubAvatarUrl?: string }`
**响应**: `{ token: string; user: User }`

### 2.4 个人资料

#### GET `/profile`
获取个人资料（需要 JWT，仅生产模式）。

**响应**:
```typescript
{
  user: {
    id: string;
    username: string;
    nickname: string;
    avatarUrl: string | null;
    totalGames: number;
    totalWins: number;
    githubId: string | null;
    role: string;
  };
  recentGames: Array<{
    id: string;
    game: { roomCode: string; createdAt: string };
    finalScore: number;
    placement: number;
  }>;
}
```

#### PATCH `/profile`
更新个人资料（需要 JWT，仅生产模式）。

**请求**: `{ nickname?: string; username?: string }`
**响应**: `{ success: true }`

#### POST `/profile/avatar`
上传/删除头像（需要 JWT，仅生产模式）。

**请求**: `{ avatar: string }`（base64 data URI，最大 100KB）
**响应**: `{ success: true; avatarUrl: string | null }`

#### GET `/avatar/:userId`
获取用户头像图片（无需认证，仅生产模式）。支持 `ETag` / `304 Not Modified`。

**响应**: 二进制图片数据（`Content-Type` 从 data URI 解析）

### 2.5 管理后台

所有管理后台 API 需要 `admin` 角色的 JWT。

#### GET `/admin/dashboard`
获取仪表盘统计。

**响应**: `{ totalUsers: number; totalGames: number; activeRooms: number }`

#### GET `/admin/users`
获取分页用户列表。

**查询参数**: `search?: string; page?: string; limit?: string`
**响应**:
```typescript
{
  users: Array<{ id, username, nickname, role, totalGames, totalWins, createdAt }>;
  total: number;
  page: number;
  limit: number;
}
```

#### PATCH `/admin/users/:id/role`
修改用户角色。

**请求**: `{ role: UserRole }`（`'normal' | 'member' | 'vip' | 'admin'`）
**响应**: `{ success: true }`

#### GET `/admin/rooms`
获取活跃房间列表。

**响应**:
```typescript
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

#### DELETE `/admin/rooms/:code`
强制解散房间。

**响应**: `{ success: true }`

---

## 三、Socket.IO 事件协议

### 3.1 通用约定

- **回调响应格式**: 所有带回调的事件统一返回 `{ success: boolean; error?: string; ...data }`
- **速率限制**: 全局 20 消息/秒/连接
- **重连**: 最多 5 次，延迟 1s~10s

### 3.2 客户端 → 服务端事件

#### 房间管理

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `room:create` | `settings: Partial<RoomSettings>` | `{ success, roomCode, players, room }` |
| `room:join` | `roomCode: string` | `{ success, players?, room?, rejoin?, error? }` |
| `room:rejoin` | `roomCode: string` | `{ success, gameState?, players?, room?, error? }` |
| `room:leave` | _(无)_ | `{ success, error? }` |
| `room:ready` | `ready: boolean` | `{ success }` |
| `room:update_settings` | `settings: Partial<RoomSettings>` | `{ success, room?, error? }` |
| `room:dissolve` | _(无)_ | `{ success, error? }` |
| `game:start` | _(无)_ | `{ success, gameState?, error? }` |

#### 游戏操作

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `game:play_card` | `{ cardId: string; chosenColor?: Color }` | `{ success, error? }` |
| `game:draw_card` | _(无)_ | `{ success, error? }` |
| `game:pass` | _(无)_ | `{ success, error? }` |
| `game:call_uno` | _(无)_ | `{ success, error? }` |
| `game:catch_uno` | `{ targetPlayerId: string }` | `{ success, error? }` |
| `game:challenge` | _(无)_ | `{ success, error? }` |
| `game:accept` | _(无)_ | `{ success, error? }` |
| `game:choose_color` | `{ color: Color }` | `{ success, error? }` |
| `game:choose_swap_target` | `{ targetId: string }` | `{ success, error? }` |
| `game:next_round` | _(无)_ | `{ success, error? }` |
| `game:rematch` | _(无)_ | `{ success, error? }` |

#### 玩家操作

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `player:toggle-autopilot` | _(无)_ | `{ success, autopilot?: boolean, error? }` |

#### 聊天与互动

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `chat:message` | `{ text: string }` | _(无回调)_ |
| `throw:item` | `{ targetId: string; item: string }` | `{ success, error? }` |

有效物品列表: `['🥚', '🍅', '🌹', '💩', '👍', '💖']`

#### 语音通话

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `voice:join` | _(无)_ | `{ success, rtpCapabilities, sendTransportOptions, recvTransportOptions }` |
| `voice:connect-transport` | `{ transportType: 'send'\|'recv'; dtlsParameters }` | `{ success }` |
| `voice:produce` | `{ kind: MediaKind; rtpParameters }` | `{ success, producerId, existingProducers }` |
| `voice:consume` | `{ producerPeerId: string; rtpCapabilities }` | `{ success, id, producerId, kind, rtpParameters }` |
| `voice:leave` | _(无)_ | `{ success }` |

### 3.3 服务端 → 客户端事件

#### 房间状态

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `room:updated` | `{ players?: RoomPlayer[]; room?: RoomData }` | 房间状态变更通知 |
| `room:dissolved` | _(无)_ | 房间被房主解散 |
| `room:rejoin_redirect` | `{ roomCode: string }` | 提示客户端跳转到游戏中的房间 |

#### 游戏状态

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `game:state` | `PlayerView` | 完整游戏状态（初始化、新回合时发送） |
| `game:update` | `PlayerView` | 增量游戏状态更新 |
| `game:card_drawn` | `{ card: Card }` | 通知抽牌者抽到的卡（仅发给抽牌者） |
| `game:opponent_drew` | `{ playerId: string }` | 通知其他玩家有人抽牌 |
| `game:action_rejected` | `{ action: string; reason: string }` | 操作被拒绝 |
| `game:over` | `{ winnerId: string; scores: Record<string, number>; reason?: string }` | 游戏结束 |
| `game:round_end` | `{ winnerId: string; scores: Record<string, number> }` | 回合结束 |

#### 玩家状态

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `player:timeout` | `{ playerId: string }` | 玩家超时 |
| `player:disconnected` | `{ playerId: string }` | 玩家掉线 |
| `player:reconnected` | `{ playerId: string }` | 玩家重连 |
| `player:autopilot` | `{ playerId: string; enabled: boolean }` | 玩家进入/退出托管模式 |

#### 聊天与互动

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `chat:message` | `{ userId, nickname, text, timestamp, role }` | 聊天消息广播 |
| `chat:rate_limited` | `{ message: string }` | 聊天频率限制提示 |
| `throw:item` | `{ fromId: string; targetId: string; item: string }` | 投掷物品动画广播 |

#### 认证

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `auth:kicked` | `{ reason: string }` | 被踢出（多终端登录） |

#### 语音通话

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `voice:peer_joined` | `{ peerId: string }` | 有人加入语音 |
| `voice:peer_left` | `{ peerId: string }` | 有人离开语音 |

---

## 四、核心数据类型

### 4.1 PlayerView（游戏视图）

服务端通过 `game:state` 和 `game:update` 事件发送的玩家视角游戏状态：

```typescript
interface PlayerView {
  viewerId: string;
  phase: GamePhase;
  players: Array<{
    id: string;
    name: string;
    hand: Card[];      // 仅自己和符合 handRevealThreshold 的玩家可见
    handCount: number;  // 所有玩家的手牌数量
    score: number;
    connected: boolean;
    autopilot: boolean; // 是否处于托管模式（掉线超时或手动开启）
    calledUno: boolean;
    eliminated?: boolean;
    teamId?: number;
    avatarUrl?: string | null;
    role?: string;
  }>;
  currentPlayerIndex: number;
  direction: 'clockwise' | 'counter_clockwise';
  discardPile: Card[];       // 仅最后 1 张
  currentColor: Color | null;
  drawStack: number;
  deckCount: number;         // 牌堆剩余数量
  roundNumber: number;
  winnerId: string | null;
  settings: RoomSettings;
  pendingDrawPlayerId: string | null;
  lastAction: GameAction | null;
}
```

### 4.2 RoomSettings

```typescript
interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500;
  houseRules: HouseRules;
}
```

### 4.3 RoomData

```typescript
// 服务端定义
interface RoomData {
  ownerId: string;
  status: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;
  createdAt: string;
}
```

### 4.4 RoomPlayer

```typescript
interface RoomPlayer {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  ready: boolean;
  role?: string;
}
```

### 4.5 User

```typescript
interface User {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: string;
}
```

### 4.6 GameAction（游戏动作）

```typescript
type GameAction =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: Color }
  | { type: 'DRAW_CARD'; playerId: string }
  | { type: 'PASS'; playerId: string }
  | { type: 'CALL_UNO'; playerId: string }
  | { type: 'CATCH_UNO'; catcherId: string; targetId: string }
  | { type: 'CHALLENGE'; playerId: string }
  | { type: 'ACCEPT'; playerId: string }
  | { type: 'CHOOSE_COLOR'; playerId: string; color: Color }
  | { type: 'CHOOSE_SWAP_TARGET'; playerId: string; targetId: string };
```

### 4.7 GamePhase

```typescript
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

---

## 五、配置常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `MIN_PLAYERS` | 2 | 最少玩家数 |
| `MAX_PLAYERS` | 10 | 最多玩家数 |
| `INITIAL_HAND_SIZE` | 7 | 初始手牌数 |
| `ROOM_CODE_LENGTH` | 6 | 房间码长度 |
| `DEFAULT_TARGET_SCORE` | 500 | 默认目标分数 |
| `DEFAULT_TURN_TIME_LIMIT` | 30 | 默认回合时限（秒） |
| `UNO_PENALTY_CARDS` | 2 | UNO 惩罚抽牌数 |
| `RECONNECT_TIMEOUT_MS` | 60000 | 掉线重连窗口（毫秒），超时后进入托管 |
| `AUTOPILOT_THINK_MS` | 2000 | 托管模式出牌思考时间（毫秒） |
| `CHAT_LIMIT` | 2 | 聊天频率上限（条数/窗口） |
| `CHAT_WINDOW_MS` | 5000 | 聊天频率窗口（毫秒） |
| `MAX_MESSAGES_PER_SECOND` | 20 | Socket 全局频率限制 |

---

## 六、前后端不一致问题

### 问题 1：`game:over` 和 `game:round_end` 事件客户端未监听

**服务端**（`game-events.ts:82`）会在回合结束或游戏结束时发送 `game:over` 或 `game:round_end` 事件。

**客户端**（`socket.ts`）没有注册这两个事件的监听器。客户端依赖 `game:update` 中的 `phase` 字段（`'round_end'` / `'game_over'`）来判断游戏状态。

**影响**: 低。`game:over` 和 `game:round_end` 携带的 `winnerId` 和 `scores` 信息已经包含在 `game:update` 的 `PlayerView` 中。但这意味着服务端发送了冗余事件，客户端忽略了它们。

**建议**: 保持现状可接受（客户端已通过 `game:update` 获取完整状态），或者如果后续需要在回合/游戏结束时触发特殊 UI 效果（如结算动画），可以添加这两个事件的监听。

### 问题 2：`room:rejoin_redirect` 事件客户端未监听

**服务端**（`room-events.ts:49`）在玩家加入一个进行中游戏的房间时发送 `room:rejoin_redirect` 事件。

**客户端** 没有监听此事件。但 `LobbyPage.tsx` 在 `room:join` 的回调中检查 `res.rejoin` 字段来处理跳转。

**影响**: 低。客户端已通过回调参数处理了重连跳转逻辑，`room:rejoin_redirect` 事件是冗余的。

### 问题 3：`/auth/me` 返回格式不一致

**开发模式**（`auth/routes.ts:43`）返回:
```typescript
{ id, username, nickname, avatarUrl, role }
```

**生产模式**（`auth/routes.ts:170-174`）通过 `userResponse()` 返回:
```typescript
{ id, username, nickname, avatarUrl, role }
```

但生产模式的 `GET /auth/me` 如果用户不存在，返回的是 `{ error: 'User not found' }` 而非返回 HTTP 错误码。开发模式则直接返回 TokenPayload 中的数据（不查库）。

**影响**: 中。如果用户在生产环境中被删除，客户端收到 `200 { error: 'User not found' }` 会被 `auth-store.ts` 的 `apiGet<User>` 当作 `User` 对象解析，导致 `user.id` 为 `undefined`。

**建议**: 生产模式的 `/auth/me` 应在用户不存在时返回 `reply.code(404).send({ error: 'User not found' })`。

### 问题 4：客户端 `game:play_card` 未传递 `chosenColor`

**客户端**（`GamePage.tsx:174`）发送 `game:play_card` 时:
```typescript
getSocket().emit('game:play_card', { cardId }, () => {});
```

未包含 `chosenColor` 字段。当打出 Wild 卡时，颜色选择是通过 `game:choose_color` 事件单独处理的，所以 `chosenColor` 在 `game:play_card` 中是可选的。

**影响**: 无实际问题。服务端正确处理了这种分步流程（先打卡进入 `choosing_color` 阶段，再选色）。但协议类型定义 `GameAction.PLAY_CARD.chosenColor` 是可选的，服务端 `game-events.ts:112` 也正确转发了 `payload.chosenColor`，只是客户端目前不使用这个一步式打卡+选色的快捷方式。

### 问题 5：`room:update_settings` 客户端只发 `houseRules`

**客户端**（`RoomPage.tsx:105`）发送:
```typescript
getSocket().emit('room:update_settings', { houseRules: rules });
```

仅发送 `houseRules` 字段。

**服务端**（`room-events.ts:87`）期望 `settings: Partial<RoomSettings>`，可包含 `turnTimeLimit`、`targetScore`、`houseRules`。

**影响**: 低。前端 UI 只暴露了村规设置，未提供修改 `turnTimeLimit` 和 `targetScore` 的入口。当前行为是正确的（保留服务端已有的值），但如果后续需要修改回合时限或目标分数，需要扩展客户端 UI。

### 问题 6：客户端 `RoomData` 缺少 `createdAt` 字段

**服务端** `RoomData` 接口包含 `createdAt: string` 字段，通过 `room:updated` 事件发送。

**客户端** `room-store.ts` 的 `RoomData` 类型没有 `createdAt` 字段：
```typescript
interface RoomData {
  ownerId: string;
  status: string;    // 服务端是 'waiting' | 'playing' | 'finished'
  settings: RoomSettings;
  // 缺少 createdAt
}
```

**影响**: 低。客户端当前不显示房间创建时间，`createdAt` 数据会被静默丢弃。但 `status` 字段类型也较宽泛（`string` vs 服务端的联合类型）。

### 问题 7：管理后台 `API_BASE` 硬编码为空字符串

**管理后台**（`admin/src/lib/api.ts:1`）:
```typescript
const API_BASE = '';
```

这意味着管理后台必须与服务端部署在同一域名下（或通过反向代理）。而主客户端使用了动态 `getApiUrl()` 支持多服务器。

**影响**: 中。管理后台无法连接到不同域名的服务端，部署灵活性受限。

**建议**: 添加环境变量 `VITE_API_URL` 支持，与主客户端保持一致。
