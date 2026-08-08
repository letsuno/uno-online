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
  isBot?: boolean;
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

### Passkey (WebAuthn) 认证

- **用途**: 已有用户可在个人设置中绑定 Passkey，之后可免密码登录
- **库**: `@simplewebauthn/server` + `@simplewebauthn/browser`
- **Challenge 存储**: KV Store，5 分钟过期
- **认证结果**: 验证通过后签发与密码登录相同格式的 JWT Token
- **多域名**: `WEBAUTHN_RP_ID` 和 `WEBAUTHN_ORIGIN` 支持逗号分隔多值

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
| `GET` | `/api/auth/config` | 全部 | 无 | 获取 `devMode`、GitHub Client ID、Turnstile Site Key |
| `POST` | `/api/auth/dev-login` | 仅 `DEV_MODE=true` | 无 | 开发模式临时用户登录 |
| `POST` | `/api/auth/dev-admin-login` | 仅 `DEV_MODE=true` | 无 | 管理后台临时管理员登录；生产模式不注册 |
| `GET` | `/api/auth/me` | 全部 | JWT | 获取当前用户 |
| `POST` | `/api/auth/register` | 仅生产模式 | 无 | 用户名密码注册（限流 5次/小时/IP） |
| `POST` | `/api/auth/login` | 仅生产模式 | 无 | 用户名密码登录（限流 10次/分钟/IP） |
| `POST` | `/api/auth/set-password` | 仅生产模式 | JWT | 设置或修改密码 |
| `GET` | `/api/auth/github` | 仅生产模式 | 无 | 重定向到 GitHub OAuth 授权页 |
| `POST` | `/api/auth/callback` | 仅生产模式 | 无 | GitHub OAuth code 换取登录态 |
| `POST` | `/api/auth/bind-github` | 仅生产模式 | 无 | 将 GitHub 账号绑定到已有账号（限流 10次/分钟/IP） |
| `POST` | `/api/auth/passkey/register-options` | 仅生产模式 | JWT | 生成 Passkey 注册选项（challenge） |
| `POST` | `/api/auth/passkey/register-verify` | 仅生产模式 | JWT | 验证 Passkey 注册响应，存储凭证 |
| `POST` | `/api/auth/passkey/login-options` | 仅生产模式 | 无 | 生成 Passkey 认证选项（challenge） |
| `POST` | `/api/auth/passkey/login-verify` | 仅生产模式 | 无 | 验证 Passkey 认证响应，签发 JWT（限流 10次/分钟/IP） |
| `GET` | `/api/auth/passkey/list` | 仅生产模式 | JWT | 列出当前用户的 Passkey |
| `DELETE` | `/api/auth/passkey/:id` | 仅生产模式 | JWT | 删除指定 Passkey |

主要请求/响应：

```typescript
// POST /api/auth/dev-login
{ username: string }
// -> { token: string; user: User }

// POST /api/auth/dev-admin-login
{ username: string }
// -> { token: string; user: User } // role 固定为 admin，仅开发模式

// GET /api/auth/config
// -> { devMode: boolean; githubClientId: string; turnstileSiteKey: string | null; passkeyEnabled: boolean }

// POST /api/auth/register
{ username: string; password: string; nickname: string; avatar?: string; turnstileToken?: string }
// -> { token: string; user: User }
// 密码要求：≥8 字符，必须同时包含字母和数字
// 昵称要求：去除不可见字符后 1-20 字符，至少含一个字母或数字
// 头像：服务端通过 sharp 统一处理为 256x256 WebP，bodyLimit 10MB

// POST /api/auth/login
{ username: string; password: string; turnstileToken?: string }
// -> { token: string; user: User }

// POST /api/auth/callback
{ code: string }
// -> { token: string; user: User; isNewUser?: boolean }
// -> { needsBind: true; username: string; githubId: string; githubAvatarUrl?: string }

// POST /api/auth/set-password
{ password: string }
// -> { success: true }

// POST /api/auth/bind-github
{ username: string; password: string; githubId: string; githubAvatarUrl?: string }
// -> { token: string; user: User }

// POST /api/auth/passkey/register-options（需 JWT）
// -> PublicKeyCredentialCreationOptionsJSON

// POST /api/auth/passkey/register-verify（需 JWT）
{ credential: RegistrationResponseJSON; name: string }
// -> { success: true; passkey: { id: string; name: string; createdAt: string } }

// POST /api/auth/passkey/login-options
// -> { options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }

// POST /api/auth/passkey/login-verify
{ credential: AuthenticationResponseJSON; challengeId: string }
// -> { token: string; user: User }

// GET /api/auth/passkey/list（需 JWT）
// -> Array<{ id: string; name: string; createdAt: string }>

// DELETE /api/auth/passkey/:id（需 JWT）
// -> { success: true }
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

// POST /api/profile/avatar（bodyLimit 10MB）
{ avatar: string } // base64 data URI；空值表示删除头像
// -> { success: true; avatarUrl: string | null }
// 服务端通过 sharp 解码验证 → 取第一帧 → 256x256 cover crop → WebP q80
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
| `GET` | `/api/admin/ai-plugins` | 查看启动时加载的内建 AI、社区插件、权限和失败信息 |
| `PATCH` | `/api/admin/ai-plugins/:id` | 启用或停用一个已加载的社区插件；载荷 `{ enabled: boolean }` |

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

### 2.5 API Key 管理

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
- **重连窗口**: 断线 30 秒内可恢复；超时后进入托管
- **全员断线清理**: 游戏中所有玩家断线 5 分钟后解散房间
- **类型定义**: `packages/shared/src/types/socket-events.ts`

### 3.2 客户端 -> 服务端事件

#### 通用/房间

| 事件名 | 载荷 | 回调响应 |
|--------|------|---------|
| `user:current_room` | 无 | `{ roomCode: string \| null }` |
| `ping:latency` | 无 | 空回调（用于测量延迟） |
| `room:create` | `Partial<RoomSettings>` | `{ success, roomCode?, players?, room?, voiceChannelId?, error? }` |
| `room:join` | `roomCode: string` | `{ success, players?, room?, rejoin?, voiceChannelId?, error? }` |
| `room:rejoin` | `roomCode: string` | `{ success, gameState?, seats?, spectators?, room?, isSpectator?, error? }` |
| `room:leave` | 无 | `{ success, dissolved?, error? }` |
| `room:ready` | `ready: boolean` | `{ success, error? }` |
| `room:update_settings` | `Partial<RoomSettings>` | `{ success, room?, error? }` |
| `room:dissolve` | 无 | `{ success, error? }` |
| `room:transfer_owner` | `{ targetId: string }` | `{ success, error? }` |
| `room:kick` | `{ targetId: string }` | `{ success, error? }` |
| `room:add_bot` | 普通人机：`{ difficulty: RuleBotDifficulty; seatIndex? }`；AI：`{ difficulty: 'rl'; aiProviderId: string; seatIndex? }` | `{ success, botId?, error? }` |
| `room:remove_bot` | `{ botId: string }` | `{ success, error? }` |
| `room:set_bot_difficulty` | `{ botId: string; difficulty: RuleBotDifficulty }` | `{ success, error? }` |
| `room:set_bot_ai` | `{ botId: string; providerId: string }` | `{ success, error? }` — 通用 AI 提供者接口 |
| `room:list_ai_providers` | `{ intent: 'add' \| 'switch' }` | `{ success: true, providers }` 或 `{ success: false, error }` — 按新增后人数或当前人数及村规过滤的已启用 AI 列表（ID、名称、公平性） |
| `seat:take` | `seatIndex: number` | `{ success, error? }` — 入座指定座位（0-9） |
| `seat:leave` | 无 | `{ success, error? }` — 离开座位回到观战席 |
| `seat:swap_request` | `targetUserId: string` | `{ success, error? }` — 请求与目标玩家交换座位（Bot 目标直接交换） |
| `seat:swap_respond` | `{ requesterId, accept }` | `{ success, error? }` — 响应换座请求 |

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

#### 大厅

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `lobby:rooms` | `ActiveRoomInfo[]` | 未加入房间时推送可观战房间列表 |

`ActiveRoomInfo` 类型：

```typescript
interface ActiveRoomInfo {
  roomCode: string;
  players: Array<{ nickname: string; avatarUrl?: string | null }>;
  playerCount: number;
  gameStartedAt: number;
  spectatorCount: number;
  spectatorMode: 'full' | 'hidden';
}
```

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
| `game:back_to_room` | `{ seats: (RoomSeatPlayer \| null)[]; spectators: RoomSpectator[]; room: RoomData }` | game over 后房主返回房间 |
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
| `room:updated` | `{ room: RoomData }` | 房间设置变更（不含座位/玩家变化，座位变化通过 `seat:updated` 推送） |
| `room:ready_changed` | `{ playerId: string; ready: boolean }` | 玩家准备状态变化 |
| `seat:updated` | `{ seats: (RoomSeatPlayer \| null)[], spectators: RoomSpectator[] }` | 座位或观战席变更 |
| `seat:swap_requested` | `{ requesterId, requesterName, requesterSeatIndex, targetSeatIndex }` | 收到换座请求 |
| `seat:swap_resolved` | `{ accepted, requesterId?, targetUserId?, reason? }` | 换座结果 |
| `room:dissolved` | `{ reason?: string }` | 房间被解散 |
| `room:rejoin_redirect` | `{ roomCode: string }` | 已在进行中房间，提示客户端跳转 |
| `room:spectator_joined` | `{ nickname: string; spectators: SpectatorInfo[] }` | 观众加入 |
| `room:spectator_left` | `{ nickname: string; spectators: SpectatorInfo[] }` | 观众离开 |
| `room:spectator_list` | `{ spectators: SpectatorInfo[] }` | 当前观众列表 |
| `room:bot_added` | `{ botId: string; name: string; difficulty: BotDifficulty; personality: BotPersonality }` | 机器人加入房间 |
| `room:bot_removed` | `{ botId: string }` | 机器人离开房间 |
| `room:bot_updated` | `{ botId: string; difficulty: BotDifficulty }` | 机器人难度更新 |
| `room:owner_transfer_pending` | `{ transferAt: number }` | 房主转让倒计时开始 |
| `room:owner_transfer_cancelled` | 无 | 房主转让取消 |
| `player:timeout` | `{ playerId: string }` | 玩家超时 |
| `player:disconnected` | `{ playerId: string }` | 玩家断线 |
| `player:reconnected` | `{ playerId: string }` | 玩家重连 |
| `player:autopilot` | `{ playerId: string; enabled: boolean }` | 托管状态变化 |
| `auth:kicked` | `{ reason: string }` | 同账号多端登录导致旧连接被踢 |
| `server:version` | `{ version: string; serverTime: number }` | 连接时发送；`version` 当前为服务端启动时间字符串 |

`SpectatorInfo` 是观众广播时使用的精简视图：

```typescript
interface SpectatorInfo {
  nickname: string;
  avatarUrl?: string | null;
  connected: boolean;
}
```

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

### 4.3 HouseRules

```typescript
interface HouseRules {
  stackDrawTwo: boolean;
  stackDrawFour: boolean;
  crossStack: boolean;
  reverseDeflectDrawTwo: boolean;
  reverseDeflectDrawFour: boolean;
  skipDeflect: boolean;
  zeroRotateHands: boolean;
  sevenSwapHands: boolean;
  jumpIn: boolean;
  multiplePlaySameNumber: boolean;
  wildFirstTurn: boolean;
  drawUntilPlayable: boolean;
  forcedPlayAfterDraw: boolean;
  handLimit: number | null;
  forcedPlay: boolean;
  handRevealThreshold: number | null;
  unoPenaltyCount: 2 | 4 | 6;
  strictUnoCall: boolean;
  misplayPenalty: boolean;
  fastMode: boolean;
  noHints: boolean;
  elimination: boolean;
  blitzTimeLimit: number | null;
  revengeMode: boolean;
  silentUno: boolean;
  teamMode: boolean;
  noFunctionCardFinish: boolean;
  noWildFinish: boolean;
  doubleScore: boolean;
  noChallengeWildFour: boolean;
  blindDraw: boolean;
  bombCard: boolean;
  shuffleSeats: boolean;
}
```

### 4.4 RoomData / RoomSeatPlayer / RoomSpectator

```typescript
interface RoomData {
  ownerId: string;
  status: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;
  createdAt: string;
  lastActivityAt: string;
}

interface RoomSeatPlayer {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  ready: boolean;
  connected: boolean;
  role?: string;
  isBot: boolean;
  botConfig?: BotConfig;
}

type RoomSeats = (RoomSeatPlayer | null)[];  // 固定长度 10

interface RoomSpectator {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  role?: string;
  connected: boolean;
  disconnectedAt?: number;
}
```

### 4.5 PlayerView

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
  botConfig?: BotConfig;
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
  discardPileCount?: number;
  gameStartedAt?: number;
  turnStartedAt?: number;
}
```

### 4.6 GameAction / GamePhase

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

### 4.7 BotConfig

```typescript
type BotDifficulty = 'novice' | 'easy' | 'normal' | 'hard';
type BotPersonality = 'aggressive' | 'defensive' | 'chaotic' | 'strategic' | 'balanced';

interface BotConfig {
  difficulty: BotDifficulty;
  personality: BotPersonality;
}
```

### 4.8 ChatMessage / VoicePresence

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
| `SEAT_COUNT` | 10 | `packages/shared/src/constants/deck.ts` | 座位总数（固定） |
| `SWAP_COOLDOWN_MS` | 5000 | `packages/shared/src/constants/deck.ts` | 换座冷却时间 |
| `SWAP_REQUEST_TIMEOUT_MS` | 15000 | `packages/shared/src/constants/deck.ts` | 换座请求超时时间 |
| `AUTOPILOT_TOGGLE_COOLDOWN_MS` | 3000 | `packages/shared/src/constants/deck.ts` | 托管开关冷却时间 |
| `DEFAULT_TARGET_SCORE` | 1000 | `packages/shared/src/constants/scoring.ts` | 默认目标分数 |
| `DEFAULT_TURN_TIME_LIMIT` | 30 | `packages/shared/src/constants/scoring.ts` | 默认回合时限（秒） |
| `UNO_PENALTY_CARDS` | 2 | `packages/shared/src/constants/scoring.ts` | UNO 惩罚抽牌数 |
| `RECONNECT_TIMEOUT_MS` | 30000 | `packages/server/src/ws/socket-handler.ts` | 掉线重连窗口 |
| `AUTOPILOT_THINK_MS` | 2000 | `packages/server/src/ws/socket-handler.ts` | 托管循环间隔 |
| `ROOM_IDLE_SWEEP_MS` | 60000 | `packages/server/src/ws/socket-handler.ts` | 空闲房间清理检查间隔 |
| `ALL_DISCONNECT_TIMEOUT_MS` | 300000 | `packages/server/src/ws/socket-handler.ts` | 全员断线后解散房间的超时时间 |
| `MAX_MESSAGES_PER_SECOND` | 20 | `packages/server/src/ws/rate-limiter.ts` | Socket 全局频率限制 |
| `CHAT_LIMIT` | 10 | `packages/server/src/ws/game-events.ts` | 聊天窗口内消息数 |
| `CHAT_WINDOW_MS` | 5000 | `packages/server/src/ws/game-events.ts` | 聊天限流窗口 |
| `NEXT_ROUND_COOLDOWN_MS` | 10000 | `packages/server/src/ws/game-events.ts` | 下一轮/返回房间操作冷却时间 |
| `AUTOPILOT_JUMP_IN_DELAY_MS` | 2000 | `packages/server/src/ws/game-events.ts` | 托管模式抢出牌延迟 |
| `MIN_THROW_INTERVAL_MS` | 300 | `packages/server/src/plugins/core/interaction/ws.ts` | 投掷物品最小间隔 |

---

## 六、设计取舍

### API 前缀

服务端在 `plugin-loader.ts` 中将所有 HTTP 插件注册到 `/api` 下。Vite 开发代理不能重写 `/api`，否则服务端路由无法匹配。

### 观战房间列表

可观战房间列表通过 Socket.IO `lobby:rooms` 事件实时推送给未加入房间的连接，不提供 HTTP 端点。

### `game:over` / `game:round_end` 与 `game:update`

回合或游戏结束时服务端会同时发送终态事件和 `game:update`。客户端主要通过 `game:update.phase` 驱动 UI，终态事件用于冷却计时、重连补发和 MCP 通知。

### Wild 选色

协议支持 `game:play_card` 携带 `chosenColor`，但 Web 客户端通常先出 Wild 牌进入 `choosing_color` 阶段，再发送 `game:choose_color`。

### 管理后台部署

管理后台 API 基址固定为 `/api`，需要与服务端同域或由 Caddy 反向代理到服务端。
