# UNO Online — 后端开发规范

## 技术栈

- **框架**: Fastify 5 + Socket.IO 4.8
- **语言**: TypeScript (strict mode)
- **运行时**: Node.js ≥ 22, ESM (`"type": "module"`)
- **数据库**: SQLite (node:sqlite) + Kysely 查询构建器
- **KV 存储**: 内存 / Redis (ioredis)，用于房间和游戏临时状态
- **认证**: JWT (jsonwebtoken) + bcryptjs
- **语音**: Mumble + mumble-web-gateway（客户端直连网关，服务端可通过 Mumble ICE 管理房间频道）
- **测试**: Vitest 4

## 目录结构

```
packages/server/src/
  plugins/core/           # Fastify 插件（按功能域组织）
    auth/
      index.ts            # 插件入口
      routes.ts           # HTTP 路由处理
      service.ts          # 业务逻辑 / 共享工具
    profile/
      index.ts
      routes.ts
    admin/
      index.ts
      routes.ts
      middleware.ts       # adminOnly 权限守卫
    room/
      store.ts            # KV 存储操作
      manager.ts          # 房间生命周期管理
    game/
      session.ts          # GameSession 类
      state-store.ts      # 游戏状态 KV 持久化
      turn-timer.ts       # 回合计时器
    server-info/
      index.ts            # 插件入口
      routes.ts           # 服务器状态查询路由
    interaction/
      ws.ts               # 扔道具 WS 事件
    spectate/
      index.ts            # 插件入口
      routes.ts           # 观战 HTTP 路由
      ws.ts               # 观战 WS 事件
    api-key/
      index.ts            # 插件入口
      routes.ts           # API Key CRUD + verify 路由
      repo.ts             # 数据库操作（SHA-256 哈希存储）
  ws/                     # WebSocket 核心
    socket-handler.ts     # 连接管理、中间件、事件分发
    room-events.ts        # 房间 WS 事件
    room-lifecycle.ts     # 房间生命周期（闲置清理）
    game-events.ts        # 游戏 WS 事件
    rate-limiter.ts       # WS 速率限制
    types.ts              # SocketData 等共享类型
  auth/                   # 认证基础设施
    jwt.ts                # Token 签发 / 验证
    middleware.ts         # Socket 认证
    password.ts           # 密码哈希
    github.ts             # GitHub OAuth
    validation.ts         # 输入验证
  db/                     # 数据库层
    database.ts           # Kysely 实例 + 迁移
    user-repo.ts          # 用户 CRUD
  kv/                     # KV 存储抽象
    types.ts              # KvStore 接口
    memory.ts             # 内存实现
    redis.ts              # Redis 实现
    index.ts              # 工厂函数
  plugin-context.ts       # PluginContext 接口
  plugin-loader.ts        # 插件注册器
  app.ts                  # Fastify 应用创建
  config.ts               # 环境配置
  index.ts                # 启动入口
```

## 插件架构

### PluginContext

所有插件共享一个上下文对象：

```typescript
interface PluginContext {
  db: Kysely<Database>;    // SQLite 数据库
  kv: KvStore;             // KV 存储（内存或 Redis）
  io: SocketIOServer;      // Socket.IO 服务器
  config: Config;          // 应用配置
}
```

### 插件入口模板

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerRoutes } from './routes.js';

export default async function pluginName(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  await registerRoutes(fastify, opts.ctx);
}
```

### 注册插件

在 `plugin-loader.ts` 中按依赖顺序注册。所有 HTTP 路由统一包在 `/api` 前缀下，插件内部路径写 `/auth/login`、`/server/info` 这类相对路径，对外路径是 `/api/auth/login`、`/api/server/info`。

```typescript
export async function loadPlugins(fastify, ctx) {
  await fastify.register(async (api) => {
    await api.register(authPlugin, { ctx });       // 先注册 auth（其他插件依赖）
    await api.register(profilePlugin, { ctx });
    await api.register(adminPlugin, { ctx });
    // ... 更多插件
    api.get('/health', async () => ({ status: 'ok' }));
  }, { prefix: '/api' });
}
```

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case.ts | `room-store.ts`, `game-events.ts` |
| 函数/变量 | camelCase | `createRoom`, `getRoomPlayers` |
| 类 | PascalCase | `GameSession`, `RoomManager` |
| 接口 | PascalCase | `PluginContext`, `SocketData` |
| 常量 | UPPER_SNAKE_CASE | `MAX_PLAYERS`, `THROW_COOLDOWN_MS` |
| 路由路径 | kebab-case | `/auth/dev-login`, `/admin/users/:id/role` |

## 类型定义

- **对象结构**: 用 `interface`
- **联合类型**: 用 `type`
- **类型导入**: `import type { ... }`
- **共享类型**: 定义在 `@uno-online/shared`，不要在服务端重复定义
- **导出原则**: 仅导出被外部文件使用的符号，内部使用的不加 `export`

## 数据存储

### SQLite（持久数据）
- 用户信息、头像数据、密码哈希、API Key 哈希等持久化数据
- 通过 Kysely 查询构建器操作
- 使用 `CamelCasePlugin`：代码用 camelCase，SQL 自动转 snake_case
- 当前表结构集中在 `db/database.ts` 初始化，新增持久数据时同步更新 `Database` 类型与初始化逻辑

### KV 存储（临时数据）
- 房间状态、在线游戏状态等临时数据
- 通过 `KvStore` 接口操作，支持内存和 Redis 两种实现
- 所有函数接受 `KvStore` 参数（依赖注入）

## HTTP 路由规范

- 插件内部注册路径不带 `/api` 前缀，`plugin-loader.ts` 会统一加前缀
- 客户端、README 和外部文档必须使用完整路径，例如 `/api/auth/login`

### 认证
- 使用 `authPreHandler(jwtSecret)` 作为 Fastify `preHandler`
- 管理端路由使用 `adminOnly(jwtSecret)`
- 从 `(request as AuthenticatedRequest).user` 获取用户信息

### 响应格式
- 成功: `{ success: true, ... }` 或直接返回数据对象
- 错误: `reply.code(4xx).send({ error: '错误描述' })`
- 用户可见的错误信息使用中文

### 安全
- 不要展开数据库行（`...row`），显式选择要返回的字段
- 敏感字段（passwordHash, avatarData）永远不返回给客户端

## WebSocket 事件规范

### 事件命名
- 格式: `domain:action`（如 `room:create`, `game:play_card`, `chat:message`）
- 域: `room`, `game`, `voice`, `chat`, `throw`, `player`
- `player` 域事件: `player:disconnected`, `player:reconnected`, `player:timeout`, `player:autopilot`, `player:toggle-autopilot`

### 事件处理模式
```typescript
socket.on('domain:action', async (payload, callback) => {
  // 1. 验证上下文（用户已登录、在房间中等）
  // 2. 执行业务逻辑
  // 3. 广播结果给相关客户端
  // 4. 回调给发起者
  callback?.({ success: true });
});
```

### 共享类型
`SocketData` 接口统一定义在 `ws/types.ts`：
```typescript
interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
  isSpectator?: boolean;
}
```

### 游戏状态持久化
游戏状态通过 `GameStatePersister` 持久化到 KV 存储，使用 500ms 去抖减少写入频率：
- 普通游戏动作调用 `persister.markDirty()` — 标记脏状态，500ms 后自动写入
- 关键节点（回合结束、游戏结束、玩家掉线）调用 `persister.flushNow()` — 立即写入
- 房间销毁时调用 `persister.cleanup()` — 清除定时器和脏状态

## 测试规范

- 框架: Vitest，测试文件在 `tests/` 目录
- 结构: `describe` / `it` 块 + `expect` 断言
- 测试工具函数放在 `tests/helpers/`
- 文件命名: `{module-name}.test.ts`
- Redis 可选；未启动 Redis 时，依赖真实 Redis 行为的 `room-store`、`room-manager`、`game-store` 测试失败属于预期，纯规则和认证测试不依赖 Redis

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | 3001 | 服务端口 |
| `DEV_MODE` | 否 | false | 开发模式 |
| `JWT_SECRET` | 是 | — | JWT 签名密钥 |
| `DATABASE_PATH` | 否 | uno.db | SQLite 文件路径 |
| `REDIS_URL` | 否 | — | Redis 连接地址 |
| `GITHUB_CLIENT_ID` | 生产必需 | — | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | 生产必需 | — | GitHub OAuth |
| `CLIENT_URL` | 否 | 自动推断 | 客户端 URL（CORS） |
| `GITHUB_PROXY` | 否 | — | GitHub OAuth HTTP 代理 |
| `ROOM_IDLE_TIMEOUT_MS` | 否 | 7200000 | 房间闲置自动解散（毫秒） |
| `SERVER_NAME` | 否 | UNO Online | 服务器显示名称 |
| `SERVER_MOTD` | 否 | 欢迎来到 UNO Online！ | 服务器欢迎信息 |
| `MUMBLE_ICE_ENABLED` | 否 | false | 是否启用 Mumble ICE 频道管理 |
| `MUMBLE_ICE_HOST` | 否 | mumble | Mumble ICE 主机 |
| `MUMBLE_ICE_PORT` | 否 | 6502 | Mumble ICE 端口 |
| `MUMBLE_ICE_SECRET` | 否 | — | Mumble ICE 写入密钥 |
| `MUMBLE_ICE_SERVER_ID` | 否 | 1 | Mumble 虚拟服务器 ID |
| `MUMBLE_ICE_PARENT_CHANNEL_ID` | 否 | 0 | 自动创建房间频道的父频道 ID |
| `MUMBLE_CHANNEL_PREFIX` | 否 | `UNO ` | 自动创建 Mumble 频道的名称前缀 |
