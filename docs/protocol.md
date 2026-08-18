# UNO Online 通信协议

本文档描述当前代码唯一支持的 REST 与 Socket.IO 协议。它面向 Web 客户端、管理后台、MCP 客户端和服务端实现者，不是旧版本迁移指南。

## 1. 适用范围与真源

协议真源按以下优先级核对：

1. Socket 类型：`packages/shared/src/types/socket-events.ts` 及其引用的共享类型。
2. Socket 运行时行为：`packages/server/src/ws/` 与对应核心插件。
3. HTTP 路由：`packages/server/src/plugins/core/*/routes.ts`、`packages/server/src/app.ts`。
4. 客户端恢复流程：`packages/client` 与 `packages/mcp` 的连接封装。

通用约定：

- 除 Socket.IO 握手外，后端 HTTP 路由统一使用 `/api` 前缀。
- JSON 字段名、事件名和联合类型值区分大小写。
- 数字时间戳均为 Unix epoch 毫秒；标为 `string` 的日期时间由 SQLite 或 `Date#toISOString()` 生成。
- 当前 Socket 对象载荷和房间设置补丁拒绝未知字段。调用方不得发送旧字段、额外字段或依赖服务端补默认响应字段。
- 当前 `PROTOCOL_VERSION` 为 `2`。客户端和服务端必须完全相等，不协商降级，也不保留旧协议分支。
- 兼容部署恢复当前 Redis 房间快照；破坏性运行时发布递增代码内代次，新服务启动时自动清空固定 namespace，不读取、补齐或迁移旧数据。详见第 7 节。

## 2. 认证

### 2.1 JWT

HTTP 使用请求头 `Authorization: Bearer <token>`。Token 默认有效期为 7 天，载荷为：

```typescript
type UserRole = 'normal' | 'member' | 'vip' | 'admin';

interface TokenPayload {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  isBot: boolean;
}
```

普通登录签发的 `isBot` 固定为 `false`。它只用于标识由服务端驱动、带 `botConfig` 的内置机器人，不代表 API Key 或 MCP 用户。

### 2.2 API Key

- 格式：`uno_ak_` 加 32 个 base64url 字符。
- 用途：MCP 客户端可用 API Key 直接完成 Socket.IO 认证，无需 JWT。
- 存储：SQLite 只保存 SHA-256 哈希及脱敏预览；明文只在创建响应中出现一次。
- 限制：每个持久用户最多 10 个；名称 trim 后必须为 1～50 个字符。
- 验证：`POST /api/api-keys/verify` 每 IP 每分钟最多 10 次。

### 2.3 Passkey（WebAuthn）

- 已有持久用户可注册 Passkey，认证成功后签发与密码登录相同的 JWT。
- Challenge 存在 KV 中，TTL 为 5 分钟；验证时即消费。
- `WEBAUTHN_RP_ID` 和 `WEBAUTHN_ORIGIN` 支持逗号分隔多个值。
- 六个 Passkey 路由在开发和生产模式都会注册。
- `DEV_MODE=true` 的 `dev-login` 用户是没有 SQLite 记录的临时身份，不应注册持久 Passkey；使用数据库中的持久账号登录 Passkey 不受此限制。

### 2.4 Socket.IO 握手

```typescript
// Web：JWT
io(serverUrl, {
  auth: { token: jwtToken, protocolVersion: PROTOCOL_VERSION },
});

// MCP：API Key
io(serverUrl, {
  auth: { token: 'uno_ak_...', protocolVersion: PROTOCOL_VERSION },
});
```

握手顺序为：拒绝停机期新连接 → 校验 `protocolVersion` → 按 `uno_ak_` 前缀选择 API Key 或 JWT 认证 → 初始化 `socket.data`。失败通过 Socket.IO `connect_error` 返回以下当前消息之一：

- `Server shutting down`
- `Protocol mismatch`
- `Authentication failed`

成功连接后服务端发送 `server:version`，但该事件不是版本协商；版本不匹配的连接此前已经被拒绝。

### 2.5 浏览器存储

| 客户端   | Key                        | 内容                         |
| -------- | -------------------------- | ---------------------------- |
| 主站 Web | `localStorage.token`       | 用户 JWT                     |
| 管理后台 | `localStorage.admin_token` | 管理员 JWT；不复用主站登录态 |

## 3. REST API

### 3.1 公共约定

- 除 OAuth 重定向和头像二进制外，请求与响应均为 JSON。
- 业务校验、认证和限流错误使用 `{ error: string }`。客户端应把 `error` 当作可展示但不稳定的消息，不按文案分支。
- 未捕获异常由 Fastify 返回 `500`；其框架错误体不保证只有 `{ error: string }`。
- JWT 缺失或无效返回 `401`；管理端 JWT 角色不是 `admin` 返回 `403`。
- 下表的状态码列列出正常结果和显式处理的业务分支；任何异步依赖失败仍可能返回 `500`。
- 注册、密码登录和 OAuth 绑定仅在生产模式注册；开发登录仅在 `DEV_MODE=true` 注册。
- `register` 使用独立的 5 次/小时/IP 限额；`login` 与 `bind-github` 合计共享 10 次/分钟/IP；Passkey 登录验证另有独立的 10 次/分钟/IP 限额。这三类 `429` 都带 `Retry-After`。
- API Key 验证另用 10 次/分钟/IP 限额，其 `429` 当前不带 `Retry-After`。
- 配置 Turnstile secret 后，注册和密码登录还要求有效 `turnstileToken`。

公共响应类型：

```typescript
interface User {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
}

interface AuthSuccess {
  token: string;
  user: User;
}

type OAuthCallbackResponse =
  | { token: string; user: User; isNewUser: boolean }
  | {
      needsBind: true;
      username: string;
      githubId: string;
      githubAvatarUrl: string;
    };
```

本地注册、设置密码和普通用户资料修改的输入约束：

- `username`：3～20 个字符，只允许 ASCII 字母、数字和下划线；服务端不自动 trim。
- `password`：8～128 个字符，至少包含一个 ASCII 字母和一个数字。
- `nickname`：trim 后以去掉 Unicode `\p{C}` 控制/不可见字符的视图进行校验，长度 1～20，且至少包含一个 Unicode 字母或数字。调用方不应提交控制字符。
- 注册头像和个人头像请求 body 上限均为 10 MiB；服务端取第一帧、`256×256` cover crop，输出 WebP quality 80。

开发登录不使用上述本地用户名规则，只要求 `username` trim 后非空；GitHub OAuth 用户名也来自 GitHub，不承诺符合本地用户名字符集。

### 3.2 健康与服务器信息

| 方法  | 路径               | 认证 | 成功响应     | 显式状态码 |
| ----- | ------------------ | ---- | ------------ | ---------- |
| `GET` | `/api/health`      | 无   | `{status}`   | `200`      |
| `GET` | `/api/server/info` | 无   | `ServerInfo` | `200`      |

```typescript
interface HealthResponse {
  status: 'ok';
}
```

```typescript
interface ServerInfo {
  name: string;
  version: string;
  motd: string;
  onlinePlayers: number;
  activeRooms: number;
  uptime: number;
}
```

`onlinePlayers` 是 Socket.IO Engine 当前连接数，不是去重用户数；`activeRooms` 是所有房间根记录数量，不只统计正在游戏的房间；`uptime` 单位为秒。`/api/server/info` 额外返回 `Access-Control-Allow-Origin: *`。

### 3.3 登录与认证

| 方法     | 路径                                 | 模式   | 认证 | 成功响应                                 | 显式状态码           |
| -------- | ------------------------------------ | ------ | ---- | ---------------------------------------- | -------------------- |
| `GET`    | `/api/auth/config`                   | 全部   | 无   | `AuthConfig`                             | `200`                |
| `POST`   | `/api/auth/dev-login`                | 仅开发 | 无   | `AuthSuccess`                            | `200, 400`           |
| `POST`   | `/api/auth/dev-admin-login`          | 仅开发 | 无   | `AuthSuccess`                            | `200, 400`           |
| `GET`    | `/api/auth/me`                       | 全部   | JWT  | `User`                                   | `200, 401`           |
| `POST`   | `/api/auth/register`                 | 仅生产 | 无   | `AuthSuccess`                            | `200, 400, 409, 429` |
| `POST`   | `/api/auth/login`                    | 仅生产 | 无   | `AuthSuccess`                            | `200, 400, 401, 429` |
| `POST`   | `/api/auth/set-password`             | 仅生产 | JWT  | `{ success: true }`                      | `200, 400, 401`      |
| `GET`    | `/api/auth/github`                   | 仅生产 | 无   | `Location` 重定向                        | `302`                |
| `POST`   | `/api/auth/callback`                 | 仅生产 | 无   | `OAuthCallbackResponse`                  | `200, 400`           |
| `POST`   | `/api/auth/bind-github`              | 仅生产 | 无   | `AuthSuccess`                            | `200, 400, 401, 429` |
| `POST`   | `/api/auth/passkey/register-options` | 全部   | JWT  | `PublicKeyCredentialCreationOptionsJSON` | `200, 401`           |
| `POST`   | `/api/auth/passkey/register-verify`  | 全部   | JWT  | `{ success: true, passkey }`             | `200, 400, 401`      |
| `POST`   | `/api/auth/passkey/login-options`    | 全部   | 无   | `{ options, challengeId }`               | `200`                |
| `POST`   | `/api/auth/passkey/login-verify`     | 全部   | 无   | `AuthSuccess`                            | `200, 400, 401, 429` |
| `GET`    | `/api/auth/passkey/list`             | 全部   | JWT  | `PasskeySummary[]`                       | `200, 401`           |
| `DELETE` | `/api/auth/passkey/:id`              | 全部   | JWT  | `{ success: true }`                      | `200, 401, 404`      |

```typescript
interface AuthConfig {
  devMode: boolean;
  githubClientId: string;
  turnstileSiteKey: string | null;
  passkeyEnabled: boolean;
}

interface PasskeySummary {
  id: string;
  name: string;
  createdAt: string;
}

// POST /api/auth/dev-login 和 /dev-admin-login
interface DevLoginRequest {
  username: string;
}

// POST /api/auth/register
interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
  avatar?: string;
  turnstileToken?: string;
}

// POST /api/auth/login
interface LoginRequest {
  username: string;
  password: string;
  turnstileToken?: string;
}

// POST /api/auth/callback
interface OAuthCallbackRequest {
  code: string;
}

// POST /api/auth/bind-github
interface BindGithubRequest {
  username: string;
  password: string;
  githubId: string;
  githubAvatarUrl?: string;
}

// POST /api/auth/passkey/register-verify
interface PasskeyRegisterVerifyRequest {
  credential: RegistrationResponseJSON;
  name: string;
}

// POST /api/auth/passkey/login-verify
interface PasskeyLoginVerifyRequest {
  credential: AuthenticationResponseJSON;
  challengeId: string;
}
```

Passkey 注册成功响应中的 `passkey` 为 `PasskeySummary`。`GET /api/auth/me` 直接返回扁平 `User`，不是 `{ user: User }`。

### 3.4 个人资料与头像

生产模式注册全部四个路由；开发模式只注册只读的 `GET /api/profile`。开发临时用户不写入 SQLite。

| 方法    | 路径                  | 模式   | 认证 | 成功响应                  | 显式状态码           |
| ------- | --------------------- | ------ | ---- | ------------------------- | -------------------- |
| `GET`   | `/api/profile`        | 全部   | JWT  | `{ user: ProfileUser }`   | `200, 401`           |
| `PATCH` | `/api/profile`        | 仅生产 | JWT  | `{ success: true }`       | `200, 400, 401, 409` |
| `POST`  | `/api/profile/avatar` | 仅生产 | JWT  | `{ success, avatarUrl }`  | `200, 400, 401`      |
| `GET`   | `/api/avatar/:userId` | 仅生产 | 无   | 头像二进制或空 `304` 响应 | `200, 304, 404`      |

```typescript
interface ProfileUser extends User {
  githubId: string | null;
}

interface ProfilePatch {
  nickname?: string;
  username?: string;
}

interface AvatarRequest {
  avatar: string;
}
```

- `PATCH /api/profile` 使用第 3.1 节的普通用户名和昵称规则。
- `avatar` 为空字符串时删除头像；非空值必须是可处理的 base64 data URI。
- 上传成功的 `avatarUrl` 为 `/api/avatar/<userId>`，删除成功为 `null`。
- 头像 `200` 响应带 `Content-Type`、`Cache-Control: public, max-age=86400` 和 `ETag`；`If-None-Match` 命中返回 `304`。

### 3.5 管理后台

所有管理端点都要求 `admin` 角色 JWT，并共同可能返回 `401` 或 `403`。

| 方法     | 路径                           | 请求                       | 成功响应                 | 额外显式状态码  |
| -------- | ------------------------------ | -------------------------- | ------------------------ | --------------- |
| `GET`    | `/api/admin/dashboard`         | 无                         | `AdminDashboard`         | 无              |
| `GET`    | `/api/admin/users`             | `search?, page?, limit?`   | `AdminUserPage`          | 无              |
| `PATCH`  | `/api/admin/users/:id/role`    | `{ role: UserRole }`       | `{ success: true }`      | `400, 404`      |
| `PATCH`  | `/api/admin/users/:id/profile` | `{ username?, nickname? }` | `{ success: true }`      | `400, 404, 409` |
| `GET`    | `/api/admin/rooms`             | 无                         | `{ rooms: AdminRoom[] }` | 无              |
| `DELETE` | `/api/admin/rooms/:code`       | 无                         | `{ success: true }`      | `404, 503`      |
| `POST`   | `/api/admin/rooms/:code/cheat` | 无                         | `{ success: true }`      | `404, 503`      |
| `GET`    | `/api/admin/ai-plugins`        | 无                         | `AiRegistrySnapshot`     | 无              |
| `PATCH`  | `/api/admin/ai-plugins/:id`    | `{ enabled: boolean }`     | `AiRegistrySnapshot`     | `400, 404`      |

```typescript
interface AdminDashboard {
  totalUsers: number;
  activeRooms: number;
}

interface AdminUserSummary {
  id: string;
  username: string;
  nickname: string;
  role: UserRole;
  createdAt: string;
}

interface AdminUserPage {
  users: AdminUserSummary[];
  total: number;
  page: number;
  limit: number;
}

interface AdminRoom {
  code: string;
  ownerId: string;
  status: RoomStatus;
  playerCount: number;
  players: Array<{ userId: string; nickname: string }>;
  createdAt: string;
}

type AiPluginDataAccess =
  'candidate-features' | 'public-state' | 'own-hand' | 'opponent-hands' | 'draw-piles' | 'chat-history';

interface AiRegistrySnapshot {
  initializedAt: string;
  communityPluginsDirectory: string;
  providers: Array<{
    id: string;
    displayName: string;
    version: string;
    source: 'builtin' | 'community';
    usesOnnx: boolean;
    dataAccess: AiPluginDataAccess[];
    fairness: 'fair' | 'privileged' | 'cheat';
    capabilities: {
      minPlayers: number;
      maxPlayers: number;
      supportedHouseRules: 'all' | string[];
    };
    enabled: boolean;
  }>;
  loadFailures: Array<{
    packageDirectory: string;
    message: string;
  }>;
}
```

管理端细节：

- 用户分页 `page` 默认 1、最小 1；`limit` 默认 20、范围 1～100；`search` 会 trim，并同时模糊匹配用户名和昵称。
- 管理面板的 `activeRooms` 与服务器信息口径相同，统计所有房间根记录，而不是仅统计 `playing` 房间。
- 管理员资料修改当前没有复用普通用户校验：`username` trim 后只校验 2～20 个字符，`nickname` trim 后只校验 1～20 个字符。
- 删除房间走统一实时解散生命周期，会通知成员并清理游戏、连接投影、语音及关联运行时状态，不是直接删除一个 KV key。
- `cheat` 先通过统一生命周期提交房间删除，再以 `room:membership_ended`
  的 `cheat_detected` reason 通知已终止的成员；房间不存在时返回 `404`。
- 内建 AI 不能停用；PATCH 只修改已加载的社区插件，并在成功后返回完整快照。

### 3.6 API Key 管理

| 方法     | 路径                   | 认证 | 请求               | 成功响应            | 显式状态码           |
| -------- | ---------------------- | ---- | ------------------ | ------------------- | -------------------- |
| `POST`   | `/api/api-keys`        | JWT  | `{ name: string }` | `201 ApiKeyCreated` | `201, 400, 401`      |
| `GET`    | `/api/api-keys`        | JWT  | 无                 | `ApiKeySummary[]`   | `200, 401`           |
| `DELETE` | `/api/api-keys/:id`    | JWT  | 无                 | `{ success: true }` | `200, 401, 404`      |
| `POST`   | `/api/api-keys/verify` | 无   | `{ key: string }`  | `ApiKeyIdentity`    | `200, 400, 401, 429` |

```typescript
interface ApiKeyCreated {
  id: string;
  key: string;
  name: string;
  userId: string;
  createdAt: string;
}

interface ApiKeySummary {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ApiKeyIdentity {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
}
```

API Key 路由在开发模式也注册，但 `dev-login` 临时身份没有 SQLite 用户记录，不适合创建持久 API Key。

## 4. Socket.IO 协议

### 4.1 连接、载荷与 ACK

连接认证见第 2.4 节。成功后 Socket 初始只加入 `user:<userId>` 私有频道，`socket.data.roomCode` 为 `null`；传输层重连本身不会恢复 Socket.IO 房间成员关系。

当前运行时约定：

- 每个连接每秒最多处理 20 条客户端事件；超出后中间件返回 `Rate limited`。
- 同一用户只保留最新连接。新连接建立时，旧连接收到 `auth:kicked` 后被服务端断开。
- 除原始参数事件外，对象载荷必须具有精确字段集合；未知字段、缺失必填字段、错误类型和错误联合值都应被拒绝。
- 房间码是 6 位大写字符，字符集为 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`。
- 业务错误文案不是稳定错误码。调用方只能依赖 `success` 判别和已声明的联合字段。

绝大多数 ACK 使用严格判别联合：

```typescript
type SocketResult<T extends object = Record<never, never>> =
  ({ success: true } & T) | { success: false; error: string };
```

成功分支声明的业务字段都是必填。以下事件不使用 `SocketResult`：

- `user:current_room` → `{ roomCode: string | null }`
- `ping:latency` → 空 ACK
- `voice:presence:get` → `Record<string, VoicePresence>`
- `chat:message` → 无 ACK

共享类型把 ACK 分为“必传”和“可选”。可选只表示调用方可以不提供 callback，不表示请求没有结果或失败时一定会另发事件。

ACK 超时不等于业务失败：请求可能已经提交，只是 ACK 丢失。调用方不得无条件重发普通写操作。当前推荐策略是：

- 只对幂等的 `room:rejoin` 做少量、有界重试。
- 房间成员变更超时后先标记结果未知，再用 `user:current_room` 对账。
- 游戏动作超时后等待权威 `game:update`，不要盲目重复出牌、摸牌或投票。
- 每次新连接使用新的本地 generation，忽略旧连接的迟到 ACK 和事件。

### 4.2 房间成员关系与重连

一个真人用户同一时刻最多有一个权威 `userId → roomCode` 映射。加入其他房间不会隐式退出当前房间；冲突请求会失败。

#### 进入流程

1. `room:create` 创建等待房间，房主直接占据 0 号座位。缺省设置为：回合 30 秒、目标 1000 分、`DEFAULT_HOUSE_RULES`、允许观战、`spectatorMode: 'hidden'`。
2. 新用户对等待房间调用 `room:join` 时，先成为持久观战成员，再按需调用 `seat:take` 入座。
3. 已是等待房间成员的 `room:join` 会恢复连接，返回 `rejoin: false`。
4. 已是进行中或已结束对局成员的 `room:join` 只返回成员摘要和 `rejoin: true`，不会加入 Socket adapter 房间，也不返回 `gameState`；调用方必须继续调用 `room:rejoin`。
5. `room:rejoin` 是唯一的活跃会话恢复入口。它恢复原玩家或观战身份，并在 ACK 中返回当前观看者的 `gameState`。
6. `room:rejoin` 也承担“通过 URL 首次进入房间”的入口：等待房间中的非成员会成为未入座成员；进行中或已结束房间中的非成员，仅在允许观战时成为观战成员。

```typescript
type RoomRejoinResult =
  | {
      success: true;
      mode: 'waiting';
      room: RoomData;
      seats: RoomSeats;
      spectators: RoomSpectator[];
    }
  | {
      success: true;
      mode: 'player' | 'spectator';
      gameState: PlayerView;
      room: RoomData;
      seats: RoomSeats;
      spectators: RoomSpectator[];
    }
  | { success: false; error: string };
```

活跃玩家重连会恢复同一玩家 ID、座位、手牌、分数与游戏时间戳，并关闭托管。服务端随后还会分别重放聊天历史、观战列表、下一轮队列、结算投票和当前终态事件；客户端应在发出 `room:rejoin` 前注册这些监听器。重连快照来自 ACK 的 `gameState`，不是新的 `game:state` 事件。

#### 断线、离开与清理

| 场景                           | 立即行为                                      | 后续行为                                                               |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| 活跃玩家网络断线               | `connected=false`，保留成员、座位、手牌和分数 | 30 秒后开启托管；重连恢复同一玩家并关闭托管                            |
| 活跃玩家主动 `room:leave`      | 立即断线并开启托管，标记主动离开              | ACK `outcome:'suspended'`；成员关系仍保留，可从大厅显式恢复            |
| 等待房间在座真人网络断线       | 保留座位 30 秒                                | 未 `room:rejoin` 则移出成员；若已无真人，房间解散                      |
| 观战成员网络断线               | 仅 `connected=false`                          | 成员关系保留，直到主动离开、被踢或房间解散                             |
| 最后一个尚未主动离开的真人离开 | 不留下只有主动离开成员或机器人的房间          | 立即解散                                                               |
| 房间内没有任何在线真人         | 启动 5 分钟定时器                             | 期间无人恢复则解散；等待房间可能先因 30 秒座位清退而解散               |
| 房间超过空闲期限               | 每分钟扫描一次                                | 以 `idle_timeout` 解散；默认期限由 `ROOM_IDLE_TIMEOUT_MS=7200000` 控制 |

等待房间的 30 秒清退定时器只在成功 `room:rejoin` 后取消；仅恢复传输连接不够。当前 `room:membership_ended` 不是所有成员结束场景的完整日志，等待房间重连超时清退没有专用 reason，因此新连接必须以 `user:current_room` 为最终对账依据。

#### 房主治理与结算阶段

- 手动 `room:transfer_owner` 只能把房主转给当前在线、在座、非机器人且未被排除下一轮的真人。
- 房主掉线后有 10 秒转让等待期；候选顺序优先当前座位，其次观战成员和会话玩家，只选择在线真人。
- 观战者调用 `game:spectator_join` 只会切换“下一轮加入队列”，不会立即进入当前玩家列表；服务端当前不把该操作限制在 `round_end`。
- `game:leave_to_spectate` 只在 `round_end` 可用；房主必须先移交，且移出后至少保留两名有效玩家。
- `game:kick_player` 只在 `round_end` 供房主使用。真人被移至持久观战席并排除下一轮，机器人被彻底移除。
- `game:back_to_room` 只在 `game_over` 供房主使用，且终局后需等待 10 秒；所有真人转为等待房间观战成员，座位清空，游戏会话和聊天被清理。

### 4.3 客户端 → 服务端事件

表中“必选”表示共享类型要求调用方提供 ACK callback；“可选”表示 callback 可省略；“原始”表示响应不是 `SocketResult`。

#### 房间与座位

```typescript
interface AiProviderInfo {
  id: string;
  displayName: string;
  fairness: 'fair' | 'privileged' | 'cheat';
}

interface NextRoundVote {
  votes: number;
  required: number;
  voters: string[];
}
```

| 事件                      | 载荷                                                                                                       | ACK      | 成功数据 / 语义                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `user:current_room`       | 无                                                                                                         | 原始必选 | `{ roomCode: string \| null }`；权威反向成员映射                                              |
| `ping:latency`            | 无                                                                                                         | 原始必选 | 空 ACK，用于往返延迟                                                                          |
| `room:create`             | `RoomSettingsPatch`                                                                                        | 必选     | `{ roomCode, room, seats, spectators, voiceChannelId }`                                       |
| `room:join`               | `roomCode: string`                                                                                         | 必选     | `{ room, seats, spectators, rejoin, voiceChannelId }`；`rejoin:true` 后必须调用 `room:rejoin` |
| `room:rejoin`             | `roomCode: string`                                                                                         | 必选     | `RoomRejoinResult`；也可准入进行中房间的新观众                                                |
| `room:leave`              | 无                                                                                                         | 可选     | `{ outcome: 'left' \| 'dissolved' \| 'suspended' }`                                           |
| `room:ready`              | `ready: boolean`                                                                                           | 可选     | 仅等待房间中的在线在座真人                                                                    |
| `room:update_settings`    | `RoomSettingsPatch`                                                                                        | 可选     | `{ room: RoomData }`；仅等待房间房主                                                          |
| `room:dissolve`           | 无                                                                                                         | 可选     | 房主通过统一生命周期解散                                                                      |
| `room:transfer_owner`     | `{ targetId: string }`                                                                                     | 可选     | 转给在线在座真人                                                                              |
| `room:kick`               | `{ targetId: string }`                                                                                     | 可选     | 房主结束目标成员关系；进行中玩家需走结算计分板事件                                            |
| `room:list_ai_providers`  | `{ intent: 'add' \| 'switch' }`                                                                            | 必选     | `{ providers: AiProviderInfo[] }`；按目标人数、村规和启用状态过滤                             |
| `room:add_bot`            | 普通：`{ difficulty: RuleBotDifficulty; seatIndex? }`；AI：`{ difficulty:'rl'; aiProviderId; seatIndex? }` | 必选     | `{ botId: string }`；仅房主在等待房间添加                                                     |
| `room:remove_bot`         | `{ botId: string }`                                                                                        | 必选     | 仅房主在等待房间移除                                                                          |
| `room:set_bot_difficulty` | `{ botId: string; difficulty: RuleBotDifficulty }`                                                         | 必选     | 仅等待房间房主可将机器人切换为规则 AI                                                         |
| `room:set_bot_ai`         | `{ botId: string; providerId: string }`                                                                    | 必选     | 仅等待房间房主可切换为已启用且兼容当前房间的通用 AI provider                                  |
| `seat:take`               | `seatIndex: number`                                                                                        | 必选     | 等待房间占据 `0..9` 座位；观战成员或未准备的在座成员可调用                                    |
| `seat:leave`              | 无                                                                                                         | 必选     | 等待房间离座并转为持久观战成员；房主需先移交，已准备玩家需先取消准备                          |
| `seat:swap_request`       | `targetUserId: string`                                                                                     | 必选     | 机器人目标立即交换；真人目标产生请求，15 秒超时                                               |
| `seat:swap_respond`       | `{ requesterId: string; accept: boolean }`                                                                 | 必选     | 接受或拒绝当前换座请求                                                                        |

`voiceChannelId` 为 `number | null`。房间创建和加入即使语音查询失败也可能成功并返回 `null`。

#### 游戏

| 事件                      | 载荷                                      | ACK  | 成功数据 / 语义                                                                   |
| ------------------------- | ----------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| `game:start`              | 无                                        | 必选 | `{ gameState: PlayerView }`；等待房间房主、至少 2 名在座玩家且所有真人已准备      |
| `game:play_card`          | `{ cardId: string; chosenColor?: Color }` | 可选 | 出牌；合法性、当前行动者和阶段由规则引擎校验                                      |
| `game:draw_card`          | `{ side: 'left' \| 'right' }`             | 可选 | 从指定侧摸牌                                                                      |
| `game:pass`               | 无                                        | 可选 | 过牌                                                                              |
| `game:call_uno`           | 无                                        | 可选 | 宣告 UNO                                                                          |
| `game:catch_uno`          | `{ targetPlayerId: string }`              | 可选 | 抓 UNO                                                                            |
| `game:challenge`          | 无                                        | 可选 | 质疑 Wild Draw Four                                                               |
| `game:accept`             | 无                                        | 可选 | 接受惩罚                                                                          |
| `game:choose_color`       | `{ color: Color }`                        | 可选 | 在 `choosing_color` 阶段选色                                                      |
| `game:choose_swap_target` | `{ targetId: string }`                    | 可选 | 在 `choosing_swap_target` 阶段选择 7 换牌目标                                     |
| `game:next_round`         | 无                                        | 可选 | `{ started: boolean; vote: NextRoundVote }`；`started:false` 只保证尚未提交新回合 |
| `game:kick_player`        | `{ targetId: string }`                    | 可选 | `round_end` 房主调整下一轮玩家；真人转观战，机器人移除                            |
| `game:spectator_join`     | 无                                        | 可选 | `{ queued: boolean }`；切换下一轮加入队列，再次调用可取消，观战房主不能取消       |
| `game:leave_to_spectate`  | 无                                        | 可选 | `round_end` 玩家主动转为持久观战成员                                              |
| `game:back_to_room`       | 无                                        | 可选 | `{ seats, spectators, room }`；`game_over` 后房主返回空座等待房间                 |
| `player:toggle-autopilot` | 无                                        | 可选 | `{ autopilot: boolean }`；3 秒切换冷却，主动托管不代表同意下一轮                  |
| `game:autopilot_once`     | 无                                        | 可选 | 当前玩家未处于托管时，请服务端只代执行当前一次决策                                |

`game:next_round` 当前把“投票/冷却尚未满足”和“新回合提交尝试已回滚”都表现为 `success:true, started:false`；调用方只能把它解释为“没有新回合提交”，并等待后续权威状态。

#### 聊天、互动与语音

| 事件                 | 载荷                                              | ACK      | 语义                                                                |
| -------------------- | ------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `chat:message`       | `{ text: string }`                                | 无       | 仅有活跃游戏会话时处理；trim 后最多 500 字符；每用户 5 秒最多 10 条 |
| `throw:item`         | `{ targetId: string; item: ThrowableItem }`       | 可选     | 房间内动画事件；按角色冷却与 300 ms 最小间隔限制                    |
| `voice:channel:get`  | 无                                                | 必选     | `{ voiceChannelId: number \| null }`                                |
| `voice:presence:get` | 无                                                | 原始必选 | `Record<string, VoicePresence>`                                     |
| `voice:presence`     | `{ inVoice, micEnabled, speakerMuted, speaking }` | 可选     | 发布自己的语音状态；`forceMuted` 由服务端维护                       |
| `voice:force_mute`   | `{ targetId: string; muted: boolean }`            | 可选     | 仅房主可设置其他当前房间成员                                        |

```typescript
type ThrowableItem = '🥚' | '🍅' | '🌹' | '💩' | '🐷' | '👍' | '💖';
```

`throw:item` 当前只校验字段、物品、房间存在性和冷却，不验证 `targetId` 一定属于当前房间；该事件不修改游戏状态。

### 4.4 服务端 → 客户端事件

#### 大厅

```typescript
interface ActiveRoomInfo {
  roomCode: string;
  players: Array<{ nickname: string; avatarUrl: string | null }>;
  playerCount: number;
  gameStartedAt: number;
  spectatorCount: number;
  spectatorMode: 'full' | 'hidden';
}
```

| 事件          | 载荷               | 语义                                                                             |
| ------------- | ------------------ | -------------------------------------------------------------------------------- |
| `lobby:rooms` | `ActiveRoomInfo[]` | 只发给当前未加入房间的连接；仅列出 `playing`、允许观战且至少有一名在座玩家的房间 |

`spectatorCount` 是当前 Socket.IO 房间中标为观战者的在线连接数，不是持久观战成员总数。观战列表没有 HTTP 端点。

#### 游戏投影与终态

| 事件                   | 载荷                                                                | 语义                                                    |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| `game:state`           | `PlayerView`                                                        | 开局和新一轮开始时发送初始观看者投影；重连不用此事件    |
| `game:update`          | `PlayerView`                                                        | 每个观看者各自的权威可见投影                            |
| `game:card_drawn`      | `{ card: Card }`                                                    | 仅发给摸牌者；启用 `blindDraw` 时不发送                 |
| `game:next_round_vote` | `NextRoundVote`                                                     | 当前结算投票权威快照                                    |
| `game:over`            | `{ winnerId, scores, reason?, gameOverAt }`                         | 整场结束；当前实时闪电超时可带 `reason:'blitz_timeout'` |
| `game:round_end`       | `{ winnerId, scores, roundEndAt }`                                  | 一轮结束但整场未结束                                    |
| `game:back_to_room`    | `{ seats: RoomSeats; spectators: RoomSpectator[]; room: RoomData }` | 房主把终局会话转换回等待房间                            |
| `game:spectator_queue` | `{ queue: Array<{ userId: string; nickname: string }> }`            | 下一轮加入队列权威快照                                  |

```typescript
interface GameOverPayload {
  winnerId: string | null;
  scores: Record<string, number>;
  reason?: string;
  gameOverAt: number;
}

interface RoundEndPayload {
  winnerId: string | null;
  scores: Record<string, number>;
  roundEndAt: number;
}
```

服务端在终态时也会发送最终 `game:update`。客户端应以 `PlayerView.phase` 驭动界面，终态事件用于时间锚点、通知和重连补发。`game:over.reason` 当前不是持久权威字段：实时闪电超时可能包含它，而重连重放可能省略，业务逻辑不得依赖它。

#### 房间、座位、玩家与认证

```typescript
type RoomMembershipEndReason = 'kicked' | 'host_closed' | 'idle_timeout' | 'empty' | 'cheat_detected';
type RoomDissolveReason = Exclude<RoomMembershipEndReason, 'kicked'>;

interface SpectatorInfo {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  connected: boolean;
}
```

| 事件                            | 载荷                                                                  | 语义                                                              |
| ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `room:updated`                  | `{ room: RoomData }`                                                  | 房间元数据权威投影，包括设置、房主和状态；座位另走 `seat:updated` |
| `room:ready_changed`            | `{ playerId: string; ready: boolean }`                                | 真人准备状态变化                                                  |
| `seat:updated`                  | `{ seats: RoomSeats; spectators: RoomSpectator[] }`                   | 完整座位和持久观战成员投影                                        |
| `seat:swap_requested`           | `{ requesterId, requesterName, requesterSeatIndex, targetSeatIndex }` | 目标真人收到换座请求                                              |
| `seat:swap_resolved`            | `{ accepted, requesterId, targetUserId, reason? }`                    | 换座完成或取消；reason 见下方                                     |
| `room:membership_ended`         | `{ roomCode: string; reason: RoomMembershipEndReason }`               | 该房间成员关系最终结束；`cheat_detected` 触发全屏终止提示         |
| `room:moved_to_spectator`       | `{ roomCode: string; reason: string }`                                | 真人被结算计分板移至观战席，成员关系仍保留                        |
| `room:spectator_joined`         | `{ nickname: string; spectators: SpectatorInfo[] }`                   | 其他观众加入后的持久观战成员精简投影                              |
| `room:spectator_left`           | `{ nickname: string; spectators: SpectatorInfo[] }`                   | 观众离开后的持久观战成员精简投影                                  |
| `room:spectator_list`           | `{ spectators: SpectatorInfo[] }`                                     | 持久观战成员及其连接状态快照                                      |
| `room:owner_transfer_pending`   | `{ transferAt: number }`                                              | 房主掉线转让倒计时                                                |
| `room:owner_transfer_cancelled` | 无                                                                    | 房主恢复或没有合格候选，倒计时取消                                |
| `player:timeout`                | `{ playerId: string }`                                                | 玩家回合超时                                                      |
| `player:disconnected`           | `{ playerId: string }`                                                | 活跃玩家掉线                                                      |
| `player:reconnected`            | `{ playerId: string }`                                                | 活跃玩家完成房间重连                                              |
| `player:autopilot`              | `{ playerId: string; enabled: boolean }`                              | 托管状态变化                                                      |
| `auth:kicked`                   | `{ reason: string }`                                                  | 同账号新连接取代旧连接                                            |
| `server:version`                | `{ protocolVersion: number; serverTime: number }`                     | 成功连接后的版本告知和服务端时钟采样，不用于协商                  |

`seat:swap_resolved.reason` 的精确联合为：

```typescript
type SeatSwapFailureReason = 'timeout' | 'responder_left_seat' | 'responder_ready';
```

收到成员终止事件时，客户端应按当前连接 generation 和 `roomCode` 过滤迟到事件；若本地成员状态尚未确定，则调用 `user:current_room` 对账，不能让旧房间事件覆盖较新的成员关系。

#### 聊天、互动与语音

| 事件                | 载荷                                                 | 语义                                   |
| ------------------- | ---------------------------------------------------- | -------------------------------------- |
| `chat:message`      | `ChatMessage`                                        | 已接受并加入当前游戏会话快照的聊天消息 |
| `chat:history`      | `ChatMessage[]`                                      | 重连或观战进入后的聊天快照             |
| `chat:cleared`      | 无                                                   | 终局或返回房间时聊天已清理             |
| `chat:rate_limited` | `{ message: string }`                                | 当前消息因聊天限流未接受               |
| `throw:item`        | `{ fromId: string; targetId: string; item: string }` | 互动动画广播                           |
| `voice:presence`    | `Record<string, VoicePresence>`                      | 当前房间语音状态权威快照               |

## 5. 核心数据类型

### 5.1 卡牌

```typescript
type Color = 'red' | 'blue' | 'green' | 'yellow';

type Card =
  | { id: string; type: 'number'; color: Color; value: number }
  | { id: string; type: 'skip'; color: Color }
  | { id: string; type: 'reverse'; color: Color }
  | { id: string; type: 'draw_two'; color: Color }
  | { id: string; type: 'wild'; color: null; chosenColor?: Color }
  | { id: string; type: 'wild_draw_four'; color: null; chosenColor?: Color };
```

`chosenColor` 只属于 Wild 类型，并仅在已选择颜色时出现。当前标准牌堆中的数字牌值为 0～9。

### 5.2 房间设置与村规

```typescript
interface RoomSettings {
  turnTimeLimit: 15 | 30 | 60;
  targetScore: 200 | 300 | 500 | 1000;
  houseRules: HouseRules;
  allowSpectators: boolean;
  spectatorMode: 'full' | 'hidden';
}

type RoomSettingsPatch = Partial<Omit<RoomSettings, 'houseRules'>> & {
  houseRules?: Partial<HouseRules>;
};

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

当前精确取值：

- `handLimit`: `null | 15 | 20 | 25`
- `handRevealThreshold`: `null | 2 | 3`
- `unoPenaltyCount`: `2 | 4 | 6`
- `blitzTimeLimit`: `null | 120 | 300 | 600`
- 其余村规均为 boolean

`DEFAULT_HOUSE_RULES` 把所有 boolean 设为 `false`，并使用 `handLimit:null`、`handRevealThreshold:null`、`unoPenaltyCount:2`、`blitzTimeLimit:null`。`RoomSettingsPatch` 和嵌套 `houseRules` 都拒绝未知字段；`room:create` 在默认完整设置上合并补丁，`room:update_settings` 在当前完整设置上合并补丁。

### 5.3 房间与成员

```typescript
type RoomStatus = 'waiting' | 'playing' | 'finished';

interface RoomData {
  ownerId: string;
  status: RoomStatus;
  settings: RoomSettings;
  createdAt: string;
  lastActivityAt: string;
}

interface RoomSeatPlayer {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  ready: boolean;
  connected: boolean;
  role: UserRole;
  isBot: boolean;
  botConfig?: BotConfig;
}

type RoomSeats = Array<RoomSeatPlayer | null>;

interface RoomSpectator {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  connected: boolean;
}
```

`RoomSeats` 的运行时长度固定为 10。`RoomSpectator[]` 与 `SpectatorInfo[]` 都可包含断线但成员关系仍保留的观战者；后者是去掉 `role` 和其他房间字段后的广播精简视图，`connected` 才表示当前连接状态。

`RoomStatus` 的主要迁移为：

```text
waiting --game:start--> playing --达到目标分/闪电结束--> finished
   ^                                                   |
   +---------------- game:back_to_room ----------------+
```

单轮 `round_end` 期间房间仍属于当前进行中的游戏会话；只有整场 `game_over` 才把房间状态持久化为 `finished`。

### 5.4 当前观看者投影 `PlayerView`

```typescript
interface PlayerViewPlayer {
  id: string;
  name: string;
  hand: Card[];
  handCount: number;
  score: number;
  roundWins: number;
  connected: boolean;
  autopilot: boolean;
  calledUno: boolean;
  unoCaught: boolean;
  eliminated: boolean;
  teamId?: number;
  avatarUrl: string | null;
  role: UserRole;
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
  pendingPenaltyDraws: number;
  deckLeftCount: number;
  deckRightCount: number;
  roundNumber: number;
  winnerId: string | null;
  settings: RoomSettings;
  pendingDrawPlayerId: string | null;
  lastAction: CommittedGameAction | null;
  deckHash: string;
  discardPileCount: number;
  gameStartedAt: number;
  turnStartedAt: number;
}
```

这是“当前观看者可见投影”，不是服务器完整 `GameState`：

- 真人玩家的 `viewerId` 是自己的用户 ID；观战视图使用合成值 `__spectator__`。
- 玩家默认只在自己的 `PlayerViewPlayer.hand` 中看到手牌；其他玩家为 `hand: []`，但始终有准确的 `handCount`。
- 启用 `handRevealThreshold` 后，达到阈值的其他玩家手牌可被公开。
- `spectatorMode:'full'` 的观众看到所有玩家手牌；`hidden` 观众只会看到 `handRevealThreshold` 村规已经公开的手牌。
- `discardPile` 最多只含最近 10 张；`discardPileCount` 才是弃牌堆总数。
- 协议只公开左右牌堆数量，不公开 `deckLeft`、`deckRight` 的卡牌内容。
- `gameStartedAt` 和 `turnStartedAt` 在投影中始终是必填数字。
- Web、MCP 和任何第三方客户端都不得把该投影描述为“完整游戏状态”。

### 5.5 游戏阶段与动作

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

type GameAction =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: Color; isJumpIn?: boolean }
  | { type: 'DRAW_CARD'; playerId: string; side: 'left' | 'right' }
  | { type: 'PASS'; playerId: string }
  | { type: 'CALL_UNO'; playerId: string }
  | { type: 'CATCH_UNO'; catcherId: string; targetId: string; catcherName: string }
  | { type: 'CHALLENGE'; playerId: string }
  | { type: 'ACCEPT'; playerId: string }
  | { type: 'CHOOSE_COLOR'; playerId: string; color: Color }
  | { type: 'CHOOSE_SWAP_TARGET'; playerId: string; targetId: string };

type CommittedGameAction =
  | Exclude<GameAction, { type: 'CHALLENGE' | 'ACCEPT' }>
  | {
      type: 'CHALLENGE';
      playerId: string;
      succeeded: boolean;
      penaltyPlayerId: string;
      penaltyCount: number;
    }
  | {
      type: 'ACCEPT';
      playerId: string;
      penaltyPlayerId: string;
      penaltyCount: number;
    };
```

`GameAction` 是规则引擎内部命令联合，Socket 不会整体发送该对象；各 `game:*` 事件只传对应参数。`CommittedGameAction` 是动作提交后的结果联合，只通过 `PlayerView.lastAction` 暴露。

### 5.6 机器人、聊天与语音

```typescript
type RuleBotDifficulty = 'novice' | 'easy' | 'normal' | 'hard';
type BotPersonality = 'aggressive' | 'defensive' | 'chaotic' | 'strategic' | 'balanced';

interface RuleBotConfig {
  difficulty: RuleBotDifficulty;
  personality: BotPersonality;
  aiProviderId?: never;
}

interface AiBotConfig {
  difficulty: 'rl';
  personality: BotPersonality;
  aiProviderId: string;
}

type BotConfig = RuleBotConfig | AiBotConfig;

interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  timestamp: number;
  role: UserRole;
  isSpectator: boolean;
}

interface VoicePresence {
  inVoice: boolean;
  micEnabled: boolean;
  speakerMuted: boolean;
  speaking: boolean;
  forceMuted: boolean;
}
```

`BotConfig` 也是严格判别联合：规则机器人只能有 `difficulty` 与 `personality`；`difficulty:'rl'` 时必须额外且只额外提供 `aiProviderId`。

## 6. 关键常量与时限

| 常量 / 配置                    | 当前值              | 协议含义                           |
| ------------------------------ | ------------------- | ---------------------------------- |
| `PROTOCOL_VERSION`             | `2`                 | Socket 握手精确版本                |
| `MIN_PLAYERS`                  | `2`                 | 开局和下一轮至少玩家数             |
| `MAX_PLAYERS`                  | `10`                | 玩家席人数上限，不含观战成员       |
| `SEAT_COUNT`                   | `10`                | 固定座位数                         |
| `INITIAL_HAND_SIZE`            | `7`                 | 初始手牌                           |
| `ROOM_CODE_LENGTH`             | `6`                 | 房间码长度                         |
| `DEFAULT_TARGET_SCORE`         | `1000`              | 创建房间默认目标分                 |
| `DEFAULT_TURN_TIME_LIMIT`      | `30 s`              | 创建房间默认行动时限               |
| `UNO_PENALTY_CARDS`            | `2`                 | 默认 UNO 惩罚数                    |
| `RECONNECT_TIMEOUT_MS`         | `30,000 ms`         | 等待房间座位保留及活跃玩家托管延迟 |
| `ALL_DISCONNECT_TIMEOUT_MS`    | `300,000 ms`        | 无在线真人后的房间解散延迟         |
| `OWNER_TRANSFER_DELAY`         | `10,000 ms`         | 掉线房主自动转让延迟               |
| `ROOM_IDLE_SWEEP_MS`           | `60,000 ms`         | 空闲房间扫描周期                   |
| `ROOM_IDLE_TIMEOUT_MS`         | 默认 `7,200,000 ms` | 空闲房间期限，可由环境变量覆盖     |
| `SWAP_COOLDOWN_MS`             | `5,000 ms`          | 发起换座操作冷却                   |
| `SWAP_REQUEST_TIMEOUT_MS`      | `15,000 ms`         | 真人换座请求有效期                 |
| `AUTOPILOT_TOGGLE_COOLDOWN_MS` | `3,000 ms`          | 主动切换托管冷却                   |
| `AUTOPILOT_THINK_MS`           | `2,000 ms`          | 持续托管驱动间隔                   |
| `AUTOPILOT_JUMP_IN_DELAY_MS`   | `2,000 ms`          | 托管抢出牌延迟                     |
| `NEXT_ROUND_COOLDOWN_MS`       | `10,000 ms`         | 下一轮及终局返回房间操作冷却       |
| `MAX_MESSAGES_PER_SECOND`      | `20`                | 单 Socket 每秒事件数               |
| `CHAT_LIMIT / CHAT_WINDOW_MS`  | `10 / 5,000 ms`     | 每用户聊天窗口                     |
| 聊天文本上限                   | `500` 字符          | trim 后截断                        |
| `MIN_THROW_INTERVAL_MS`        | `300 ms`            | 所有角色投掷物最小间隔             |

投掷物实际冷却为 `max(角色冷却, 300 ms)`：普通用户 1000 ms、会员 500 ms、VIP 和管理员 300 ms。

## 7. 刷新恢复、版本与部署

### 7.1 客户端恢复算法

每次 Socket 成功连接或重连都必须显式恢复成员关系，不能只依赖 Socket.IO 自动重连。通用流程为：

```text
建立新 connection generation
  -> 握手严格校验 PROTOCOL_VERSION
  -> 确定候选 roomCode
     -> 本地路由/暂停状态已知：直接 room:rejoin(roomCode)
     -> 本地未知：user:current_room
        -> null：清除本地房间/游戏状态，返回大厅
        -> roomCode：room:rejoin(roomCode)
  -> rejoin 成功
     -> waiting：应用 room + seats + spectators
     -> player/spectator：应用上述投影及 ACK.gameState
  -> rejoin 失败或成员变更 ACK 超时
     -> user:current_room 再次对账；不得凭旧本地状态猜测成员关系
```

补充规则：

- `room:join` 返回 `rejoin:true` 时也走同一 `room:rejoin` 流程。
- 监听 `chat:history`、`room:spectator_list`、`game:spectator_queue`、`game:next_round_vote` 和终态事件后，再发送 rejoin。
- Socket.IO 的自动传输重连只恢复网络，不恢复房间 adapter、玩家连接标记或托管状态。
- `user:current_room = null` 是权威终止状态；客户端不得扫描旧 roomCode、旧 Redis 快照或旧本地缓存尝试恢复。
- 所有事件和 ACK 都要绑定当前 connection generation；旧 generation 的迟到结果必须丢弃。

### 7.2 兼容更新后保留正在进行的对局

前端和后端更新后，玩家刷新并继续同一对局需要同时满足：

1. Redis 中固定的 `uno:runtime:` namespace 保留，且代码内 `RUNTIME_STATE_GENERATION` 不变。
2. 新服务仍使用同一当前数据结构和 `PROTOCOL_VERSION`。
3. `JWT_SECRET` 保持不变，浏览器原 JWT 仍可验证。
4. 旧 server 收到 `SIGTERM` 后完成操作排空和最终快照写入，再启动新 server；当前架构不支持两个 game server 重叠滚动运行。
5. 新前端使用与新后端完全匹配的共享协议版本。

满足这些条件时，新服务从 Redis 恢复当前游戏会话；玩家刷新后通过 `user:current_room` 和 `room:rejoin` 恢复原身份、手牌、分数、回合时间与观战/托管状态。

这不是历史兼容：

- Socket 有破坏性变更时递增 `PROTOCOL_VERSION`，旧前端握手直接失败，不走旧字段分支。
- 运行时结构有破坏性变更时先排空现有房间，再递增代码内 `RUNTIME_STATE_GENERATION`；新服务启动时自动删除固定 namespace 中的旧状态，不需要人工清 Redis。
- 如果部署流程主动清空 Redis/内存 KV，则所有房间和对局按设计终止，刷新后不能恢复；SQLite 中的用户、API Key 和 Passkey 不受影响。
- 仅代码代次不变的兼容重启允许保留运行时数据。详细运维顺序见 [部署文档](./deployment.md)。

## 8. 其他边界

- Vite 与 Caddy 代理 `/api` 时不能去掉前缀，服务端路由以 `/api` 为实际路径。
- 可观战房间列表只通过 `lobby:rooms` 推送，不提供 REST 端点。
- Web 常用 Wild 流程是先 `game:play_card`，进入 `choosing_color` 后再发 `game:choose_color`；协议也允许在出牌时直接携带 `chosenColor`。
- 浏览器静态资源版本检测属于 Web/Caddy 层，不由 `server:version` 完成；`server:version` 只在已成功握手的 Socket 上告知协议号并提供服务端时间。
