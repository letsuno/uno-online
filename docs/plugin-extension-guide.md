# UNO Online — 插件扩展规范

## 概述

UNO Online 使用 Fastify 原生插件系统（服务端）和 Feature 模块系统（客户端）实现功能解耦。新功能以"插件"形式开发，按需包含独立的路由、事件处理、持久化变更和前端页面。

## 服务端插件开发

### 创建新插件

在 `packages/server/src/plugins/` 下创建新目录。核心功能放 `core/`，扩展功能放 `features/`：

```
packages/server/src/plugins/
  core/           # 核心功能（auth, profile, room, game, server-info, interaction, admin, api-key, spectate）
  features/       # 扩展功能（checkin, points, shop, ...）
```

### 插件目录结构

```
plugins/features/my-feature/
  index.ts        # 插件入口（必需）
  routes.ts       # HTTP 路由（按需）
  ws.ts           # WebSocket 事件处理（按需）
  service.ts      # 业务逻辑（按需）
```

### 插件入口 (index.ts)

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerRoutes } from './routes.js';

export default async function myFeaturePlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  const { ctx } = opts;

  // 1. 注册 HTTP 路由
  await registerRoutes(fastify, ctx);

  // 2. 注册 WebSocket 事件（如需要）
  // setupWsHandlers(ctx);
}
```

### 路由文件 (routes.ts)

```typescript
import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { authPreHandler, type AuthenticatedRequest } from '../../core/auth/service.js';

export async function registerRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const preHandler = authPreHandler(ctx.config.jwtSecret);

  fastify.get('/my-feature/data', { preHandler }, async (request) => {
    const { userId } = (request as AuthenticatedRequest).user;
    // 业务逻辑...
    return { data: [] };
  });
}
```

插件内部路由不写 `/api` 前缀；`plugin-loader.ts` 会统一加前缀。因此上例对外访问路径是 `/api/my-feature/data`。

### 持久化数据变更

当前 SQLite 表结构集中在 `packages/server/src/db/database.ts` 初始化，现有插件没有独立 `migration.ts`。新增功能如果需要持久化数据，优先更新 `Database` 类型与初始化逻辑；如果引入插件级迁移，需要同时在插件入口显式调用，并确保幂等（`CREATE TABLE IF NOT EXISTS`，新增列用 try/catch 处理已存在情况）。

### 注册插件

在 `packages/server/src/plugin-loader.ts` 中添加：

```typescript
import myFeaturePlugin from './plugins/features/my-feature/index.js';

export async function loadPlugins(fastify, ctx) {
  await fastify.register(async (api) => {
    // ... 核心插件
    await api.register(myFeaturePlugin, { ctx });
  }, { prefix: '/api' });
}
```

### WebSocket 事件处理 (ws.ts)

```typescript
import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { SocketData } from '../../../ws/types.js';
import type { PluginContext } from '../../../plugin-context.js';

export function setupWsHandlers(ctx: PluginContext) {
  const { io } = ctx;

  // 在连接处理器中注册事件
  io.on('connection', (socket) => {
    socket.on('my-feature:action', async (payload, callback) => {
      const data = socket.data as SocketData;
      if (!data.user) return callback?.({ success: false, error: 'Not authenticated' });
      // 处理事件...
      callback?.({ success: true });
    });
  });
}
```

### 权限控制

```typescript
// 仅认证用户
import { authPreHandler } from '../../core/auth/service.js';
const preHandler = authPreHandler(ctx.config.jwtSecret);

// 仅管理员
import { adminOnly } from '../../core/admin/middleware.js';
const preHandler = adminOnly(ctx.config.jwtSecret);
```

### 访问共享依赖

通过 `PluginContext` 获取所有共享依赖：

```typescript
const { db, kv, io, config } = ctx;

// 数据库查询（显式选择字段，避免泄露敏感信息）
const users = await db.selectFrom('users').select(['id', 'username', 'nickname', 'role']).execute();

// KV 操作
await kv.set('key', 'value');
const val = await kv.get('key');

// 广播 Socket 事件
io.to(roomCode).emit('event', data);

// 读取配置
const isDev = config.devMode;
```

---

## 客户端 Feature 模块开发

### 创建新 Feature

```
packages/client/src/features/my-feature/
  pages/
    MyFeaturePage.tsx
  stores/
    my-feature-store.ts
  components/
    MyComponent.tsx
  hooks/
    useMyHook.ts
  routes.tsx
```

### 路由文件 (routes.tsx)

```tsx
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const MyFeaturePage = lazy(() => import('./pages/MyFeaturePage'));

export const myFeatureProtectedRoutes: RouteObject[] = [
  { path: '/my-feature', element: <MyFeaturePage /> },
];
```

### 注册路由

在 `packages/client/src/app/router.tsx` 中导入并添加：

```tsx
import { myFeatureProtectedRoutes } from '@/features/my-feature/routes';

const allProtectedRoutes = [
  ...authProtectedRoutes,
  ...gameProtectedRoutes,
  ...myFeatureProtectedRoutes,  // 新增
];
```

### Zustand Store

```typescript
import { create } from 'zustand';

interface MyFeatureState {
  data: Item[];
  loading: boolean;
  fetchData: () => Promise<void>;
}

export const useMyFeatureStore = create<MyFeatureState>((set) => ({
  data: [],
  loading: false,
  fetchData: async () => {
    set({ loading: true });
    const res = await apiGet<Item[]>('/my-feature/data');
    set({ data: res, loading: false });
  },
}));
```

### 引用规则

| 引用方向 | 允许 | 路径格式 |
|----------|------|----------|
| Feature 内部 | 总是 | 相对路径 `./`, `../` |
| Feature → shared | 总是 | `@/shared/...` |
| Feature → 其他 Feature 的 store | 允许 | `@/features/other/stores/...` |
| Feature → 其他 Feature 的组件 | 避免 | 提取到 shared |
| shared → Feature | 禁止 | — |

---

## 插件开发清单

新增一个完整功能时，按以下顺序操作：

1. **定义共享类型** — 如有跨包类型，加到 `packages/shared/src/types/`
2. **服务端插件** — 创建目录、路由/事件处理、必要的持久化变更、注册到 loader
3. **客户端 Feature** — 创建目录、store、页面、组件、注册路由
4. **构建共享包** — `pnpm --filter shared build`
5. **类型检查** — `pnpm --filter server exec tsc --noEmit` + `pnpm --filter client exec tsc --noEmit`
6. **测试** — 添加测试并运行 `pnpm test`
7. **提交** — Conventional Commits 格式：`feat(scope): description`

## Git 提交规范

```
类型(作用域): 描述

类型: feat | fix | refactor | docs | test | chore
作用域: server | client | ui | shared | admin（可选）
描述: 小写开头，祈使语气，不加句号
```

示例：
```
feat(server): add checkin plugin with daily rewards
feat(ui): add checkin calendar page
fix(server): prevent duplicate checkin on same day
refactor(client): extract shared house rules constants
```
