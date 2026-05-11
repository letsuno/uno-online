# UNO Online

多人在线 UNO 卡牌游戏，支持 2-10 人对战、语音通话、自定义村规。

## 项目结构

pnpm monorepo，四个包：

- `packages/shared` — 游戏类型、规则引擎、常量（纯逻辑，无 IO 依赖）
- `packages/server` — Fastify + Socket.IO 后端，SQLite 持久化，插件架构
- `packages/client` — React + Vite 前端，Tailwind CSS v4，Feature 模块架构
- `packages/admin` — 管理后台（独立 React 应用）

## 快速开始

```bash
pnpm install
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev   # 后端 :3001
pnpm --filter client dev                                        # 前端 :5173
pnpm --filter admin dev                                         # 管理后台 :5174
```

## 开发规范

项目遵循以下规范文档，**所有代码变更必须符合**：

- **[前端开发规范](docs/frontend-development-guide.md)** — 目录结构、命名、组件、样式、状态管理、路由规范
- **[后端开发规范](docs/backend-development-guide.md)** — 插件架构、路由、数据库、WebSocket、安全规范
- **[插件扩展规范](docs/plugin-extension-guide.md)** — 新功能开发流程、服务端插件模板、客户端 Feature 模板、Git 提交规范
- **[村规扩展指南](docs/house-rules-extension-guide.md)** — 村规引擎架构、HouseRules 接口、添加新村规的完整步骤

## 架构概览

### 服务端插件体系

所有功能以 Fastify 插件形式组织在 `packages/server/src/plugins/` 下，通过 `PluginContext`（db, kv, io, config）注入共享依赖。

```
plugins/core/     — auth, profile, admin, room, game, game-history, server-info, interaction, spectate
plugins/features/ — 扩展功能（签到、积分、商店等）
```

### 客户端 Feature 模块

前端按功能域拆分为独立模块，每个 Feature 包含自己的页面、store、组件和路由定义，通过 `React.lazy()` 实现代码分割。

```
features/ — auth, game, lobby, profile, replay
shared/   — 跨 Feature 共享的组件、工具、store
```

### 数据存储

- **SQLite** (Kysely) — 持久数据：用户、游戏记录、商品
- **KV Store** (内存/Redis) — 临时数据：房间状态、在线游戏

## 关键约束

- Node.js ≥ 22，pnpm 10
- 全 ESM（`"type": "module"`）
- TypeScript strict mode
- 类型导入必须用 `import type`
- 数据库返回值不要展开（`...row`），显式选择字段，防止敏感信息泄露
- 用户可见文案使用中文
- 提交信息使用 Conventional Commits 格式
- main 分支受保护，所有变更必须通过 PR 合并（`gh pr create` + `gh pr merge --squash --delete-branch`）

## 常用命令

```bash
pnpm test                                    # 运行所有测试
pnpm --filter shared test                    # 仅 shared 测试
pnpm --filter server exec tsc --noEmit       # 服务端类型检查
pnpm --filter client exec tsc --noEmit       # 客户端类型检查
pnpm --filter client build                   # 客户端生产构建
```
