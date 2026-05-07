# 服务器选择器设计文档

## 概述

在客户端添加服务器选择功能，允许用户在多个 UNO Online 服务器之间切换。登录页和大厅等页面均可打开服务器选择弹窗，展示每个服务器的欢迎信息、版本号、在线人数、房间数、运行时长和网络延迟。

## 需求

### 用户故事

1. 用户打开客户端，在登录页左下角看到当前服务器名称和在线状态指示
2. 点击服务器按钮弹出选择弹窗，展示所有可用服务器的实时信息
3. 用户可选择不同服务器进行连接，切换后自动登出并跳转到登录页
4. 用户可手动添加自定义服务器地址，也可删除已添加的自定义服务器
5. 在大厅等已登录页面中，导航栏也有服务器指示器，可随时切换

### 功能要求

- 服务器列表 = 内置默认服务器 + 用户自定义服务器（localStorage 持久化）
- 每个服务器展示：名称、版本号、欢迎信息（MOTD）、在线人数、活跃房间数、运行时长、网络延迟
- 延迟通过 HTTP RTT 测量，请求 3 次取平均值
- 切换服务器时登出当前账号、断开 Socket、跳转登录页
- 离线/不可达服务器以降低不透明度展示

## 架构

### 服务端：`GET /server/info` 接口

新增一个无需认证的 HTTP 接口，返回服务器基本信息。

**路径：** `GET /server/info`

**响应体：**

```typescript
interface ServerInfo {
  name: string;         // 服务器名称，从配置读取
  version: string;      // 服务器版本号，从 package.json 读取
  motd: string;         // 欢迎信息（Message of the Day），从配置读取
  onlinePlayers: number; // 当前在线人数（已连接的 Socket 数）
  activeRooms: number;   // 活跃房间数
  uptime: number;        // 服务器运行时长（秒）
}
```

**CORS：** 该接口需要允许任意来源访问（`Access-Control-Allow-Origin: *`），因为其他客户端实例需要跨域请求本服务器的信息。通过 Fastify route 级别设置 CORS header，不影响其他接口的 CORS 策略。

**实现方式：** 作为新的 Fastify 插件 `packages/server/src/plugins/core/server-info/`，通过 PluginContext 获取 `io`（在线人数）和 `kv`（房间数）。

**配置项（环境变量）：**

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_NAME` | `"UNO Online"` | 服务器名称 |
| `SERVER_MOTD` | `"欢迎来到 UNO Online！"` | 欢迎信息 |

版本号从 `packages/server/package.json` 的 `version` 字段读取。运行时长用 `process.uptime()` 获取。

### 客户端：Server Store

**文件：** `packages/client/src/shared/stores/server-store.ts`

```typescript
interface ServerEntry {
  id: string;           // 唯一标识（默认服务器用固定 id，自定义用 nanoid）
  name: string;         // 显示名称（默认服务器预设，自定义服务器从 /server/info 获取）
  address: string;      // 服务器地址（域名，如 "uno.example.com"）
  isDefault: boolean;   // 是否为内置默认服务器
}

interface ServerState {
  servers: ServerEntry[];
  currentServerId: string;
  serverInfoMap: Record<string, ServerInfo | null>; // 缓存的服务器信息
  latencyMap: Record<string, number | null>;                // 延迟（ms），null 表示不可达
  isModalOpen: boolean;

  // Actions
  addServer: (address: string) => void;
  removeServer: (id: string) => void;
  selectServer: (id: string) => void;
  refreshServerInfo: (id: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
}
```

**持久化：** 自定义服务器列表和当前选中服务器 ID 保存到 localStorage（key: `uno-server-list`、`uno-current-server`）。

**默认服务器：** 在 store 中硬编码，初始版本包含一个空地址条目代表"当前部署的服务器"（即同源访问）。

### 客户端：API URL 动态化

当前 `API_URL` 是 `env.ts` 中的静态常量。需要改为动态获取：

**修改 `packages/client/src/shared/env.ts`：**

```typescript
// 原来：export const API_URL = import.meta.env.VITE_API_URL ?? '';
// 改为：
export function getApiUrl(): string {
  const serverStore = useServerStoreRaw();  // 非 hook 方式获取 store 状态
  const server = serverStore.servers.find(s => s.id === serverStore.currentServerId);
  if (!server || !server.address) return import.meta.env.VITE_API_URL ?? '';
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${server.address}`;
}
```

**影响范围：**

- `packages/client/src/shared/api.ts` — `apiGet`、`apiPost`、`apiPatch` 中的 `API_URL` 替换为 `getApiUrl()`
- `packages/client/src/shared/socket.ts` — Socket.IO 连接地址替换为 `getApiUrl()`

### 客户端：延迟测量

```typescript
async function measureLatency(address: string): Promise<number | null> {
  const url = address
    ? `${window.location.protocol === 'https:' ? 'https' : 'http'}://${address}/server/info`
    : '/server/info';
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    try {
      await fetch(url, { cache: 'no-store' });
      times.push(performance.now() - start);
    } catch {
      return null; // 不可达
    }
  }
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}
```

复用 `/server/info` 请求，同时获取服务器信息和测量延迟。第一次请求的响应用于填充服务器信息，3 次请求的 RTT 取平均值作为延迟。

### 客户端：延迟颜色规则

| 延迟范围 | 颜色 | 含义 |
|----------|------|------|
| < 50ms | `#4ade80`（绿色） | 优秀 |
| 50-150ms | `#fbbf24`（黄色） | 一般 |
| > 150ms | `#ef4444`（红色） | 较差 |
| 不可达 | `#666`（灰色） | 无法连接 |

### 客户端：UI 组件

#### ServerButton（服务器指示按钮）

**位置：** `packages/client/src/shared/components/ServerButton.tsx`

- 显示当前服务器名称和在线状态圆点（绿/红）
- 点击打开 ServerSelectModal
- 登录页使用：放在左下角，与版本号并排
- 大厅等页面使用：放在导航栏右侧

#### ServerSelectModal（服务器选择弹窗）

**位置：** `packages/client/src/shared/components/ServerSelectModal.tsx`

**布局：**

- 标题栏：Server 图标 + "选择服务器" + 关闭按钮
- 服务器列表（可滚动）：
  - 每个服务器卡片显示：在线状态圆点、名称、版本号、欢迎信息、统计信息（在线人数/房间数/运行时长）、延迟（右对齐）
  - 当前选中的服务器卡片有红色高亮边框
  - 离线服务器降低不透明度
  - 用户添加的自定义服务器显示删除图标
- 底部：地址输入框 + 添加按钮

**图标：** 使用 lucide-react，统一风格
- Users — 在线人数
- Home — 房间数
- Clock — 运行时长
- Signal — 延迟
- Server — 弹窗标题
- Trash2 — 删除自定义服务器
- Plus — 添加服务器
- X — 关闭弹窗

**交互：**

- 弹窗打开时自动刷新所有服务器信息和延迟
- 点击服务器卡片选中该服务器
- 选中非当前服务器时：
  - 断开当前 Socket 连接
  - 清除 token 和用户状态
  - 更新 currentServerId
  - 关闭弹窗
  - 跳转到登录页 `/`
- 添加自定义服务器时：先请求 `/server/info` 验证可达性，成功后加入列表

**动画：** 使用 framer-motion，与项目现有弹窗动画风格一致（backdrop 渐入 + 内容缩放弹入）。

### 服务器切换流程

```
用户点击其他服务器
  → disconnectSocket()
  → useAuthStore.getState().logout()
  → serverStore.selectServer(newId)
  → navigate('/')
  → 登录页根据新的 getApiUrl() 请求 /auth/config
```

## 视觉参考

mockup 文件保存在 `.superpowers/brainstorm/242289-1778145963/content/server-selector-design-v4.html`，使用深色主题风格，与项目现有 UI 一致。落地实现时直接采用该 mockup 的配色和布局。

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `packages/server/src/plugins/core/server-info/index.ts` | 服务器信息插件入口 |
| `packages/server/src/plugins/core/server-info/routes.ts` | `GET /server/info` 路由 |
| `packages/client/src/shared/stores/server-store.ts` | 服务器列表状态管理 |
| `packages/client/src/shared/components/ServerButton.tsx` | 服务器指示按钮 |
| `packages/client/src/shared/components/ServerSelectModal.tsx` | 服务器选择弹窗 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `packages/server/src/plugin-loader.ts` | 注册 server-info 插件 |
| `packages/server/src/config.ts` | 添加 `serverName`、`serverMotd` 配置项 |
| `packages/client/src/shared/env.ts` | `API_URL` 改为 `getApiUrl()` 函数 |
| `packages/client/src/shared/api.ts` | 使用 `getApiUrl()` 替代静态 `API_URL` |
| `packages/client/src/shared/socket.ts` | 使用 `getApiUrl()` 替代静态 `API_URL` |
| `packages/client/src/features/auth/pages/HomePage.tsx` | 添加 ServerButton 到左下角 |
| `packages/client/src/features/lobby/pages/LobbyPage.tsx` | 导航栏添加 ServerButton |
| `packages/client/vite.config.ts` | 代理规则添加 `/server` 路径 |
| `Caddyfile` | 反向代理规则添加 `/server/*` |
| `packages/shared/src/types/` | 添加 `ServerInfo` 类型定义 |

### 共享类型

在 `packages/shared` 中定义 `ServerInfo` 接口，服务端和客户端共用。

## 测试计划

- 服务端：`GET /server/info` 返回正确的 JSON 结构和字段
- 客户端：服务器列表的增删持久化到 localStorage
- 客户端：切换服务器后 API 请求和 Socket 连接使用新地址
- 客户端：延迟测量 3 次取平均，不可达服务器显示离线状态
- 客户端：弹窗打开/关闭动画正常，服务器卡片选中高亮
