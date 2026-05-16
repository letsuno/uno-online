# UNO Online

多人在线 UNO 卡牌游戏，支持 2-10 人对战、语音通话、自定义村规。

## 项目结构

pnpm monorepo，五个包：

- `packages/shared` — 游戏类型、规则引擎、常量（纯逻辑，无 IO 依赖）
- `packages/server` — Fastify + Socket.IO 后端，SQLite 持久化，插件架构
- `packages/client` — React 19 + Vite 8 前端，Tailwind CSS v4，Feature 模块架构
- `packages/admin` — 管理后台（独立 React 应用）
- `packages/mcp` — MCP 服务端，让 AI 客户端通过 MCP 工具玩游戏（Socket.IO 客户端桥接层）

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
plugins/core/     — auth, profile, admin, room, game, server-info, interaction, spectate, api-key
plugins/features/ — 扩展功能（签到、积分、商店等）
```

### 客户端 Feature 模块

前端按功能域拆分为独立模块，每个 Feature 包含自己的页面、store、组件和路由定义，通过 `React.lazy()` 实现代码分割。

```
features/ — auth, game, lobby, profile
shared/   — 跨 Feature 共享的组件、工具、store
```

### 数据存储

- **SQLite** (Kysely) — 持久数据：用户、API Key
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

### MCP 服务端 (`packages/mcp`)

独立的 Socket.IO 客户端，桥接 MCP 协议与 game server。用户通过 API Key 直连 Socket.IO（不经过 JWT）。

```
src/
├── index.ts              # CLI 入口，支持 stdio/HTTP 两种传输
├── server.ts             # McpUnoServer 主类
├── socket-client.ts      # Socket.IO 客户端封装
├── notifications.ts      # Socket.IO 事件 → MCP 通知
├── tools/
│   ├── room.ts           # 10 个房间管理工具
│   ├── game.ts           # 11 个游戏操作工具
│   └── query.ts          # 4 个查询工具
└── types.ts
```

## 常用命令

```bash
pnpm test                                    # 运行所有测试
pnpm --filter shared test                    # 仅 shared 测试
pnpm --filter shared build                   # 构建 shared（生成类型声明，client/server 依赖此步骤）
pnpm --filter server exec tsc --noEmit       # 服务端类型检查
pnpm --filter client exec tsc --noEmit       # 客户端类型检查（需先 build shared）
pnpm --filter client build                   # 客户端生产构建（需先 build shared）
```

### 验证流程

client 和 server 的类型检查/构建依赖 shared 的编译产物。完整验证步骤：

```bash
pnpm --filter shared build                   # 1. 先构建 shared
pnpm --filter server exec tsc --noEmit       # 2. 服务端类型检查
pnpm --filter client build                   # 3. 客户端构建（含类型检查）
pnpm test                                    # 4. 运行测试
```

### Docker 构建与发布

Dockerfile 包含两个目标镜像：`server`（Node.js 后端）和 `caddy`（前端 + 管理后台静态资源）。

```bash
docker build --target server -t djkcyl/uno-online-server:latest .   # 构建服务端镜像
docker build --target caddy -t djkcyl/uno-online-caddy:latest .     # 构建前端镜像
docker push djkcyl/uno-online-server:latest                         # 推送服务端镜像
docker push djkcyl/uno-online-caddy:latest                          # 推送前端镜像
```

### MCP 包发布（npm）

`@uno-online/mcp` 发布到 npm，供 AI 客户端通过 `npx @uno-online/mcp` 直接使用。

```bash
pnpm --filter shared build                          # 1. 构建 shared（mcp 通过 tsup 打包内联）
pnpm --filter @uno-online/mcp build                  # 2. 构建 mcp
cd packages/mcp && npm publish --access public       # 3. 发布到 npm
```

发布前检查：
- 确认 `packages/mcp/package.json` 中的 `version` 已更新
- `npm pack --dry-run` 预览包内容（应只含 `dist/index.js` + `package.json`）
- `packages/mcp/src/server.ts` 中 `McpServer` 构造参数的 `version` 与 package.json 一致

### 版本号更新流程

当用户要求更新版本号时，按以下步骤执行：

1. **确定新版本号**：根据变更范围决定（patch/minor/major）
2. **查 git log**：`git log --oneline v<上个版本号>..HEAD` 收集所有变更
3. **更新版本号**（改一处，自动同步）：
   ```bash
   # 修改根目录 package.json 的 version 字段，然后：
   pnpm run version:sync
   ```
   子包 package.json 自动同步，其余 3 处自动读取 package.json：
   - `packages/mcp/src/server.ts` → tsup define 注入 `__PKG_VERSION__`
   - `packages/client/vite.config.ts` → 读取 `pkg.version`
   - `packages/client/src/shared/build-info.ts` → fallback 为 `'dev'`，构建时由 Vite 注入
4. **更新 CHANGELOG.md**：在最前面添加新版本条目，按 新增/优化/修复 分类
5. **更新客户端更新弹窗**：`packages/client/src/shared/data/changelog.ts` 在数组最前面添加新条目（精选用户可感知的亮点）
6. **验证**：确认没有遗留旧版本号 `grep -rn '<旧版本>' --include='*.json' --include='*.ts' --include='*.tsx' . | grep -v node_modules | grep -v dist | grep -v CHANGELOG.md | grep -i version`
7. **提交 PR 合并**
8. **打 git tag**：PR 合并后在 main 分支上打 tag
   ```bash
   git tag v<版本号>
   git push origin v<版本号>
   ```
9. **Docker 镜像打 tag**（如用户要求）：`docker tag djkcyl/uno-online-server:latest djkcyl/uno-online-server:v<版本号>` + push
