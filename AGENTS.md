# UNO Online

多人在线 UNO 卡牌游戏，支持 2–10 人对战、语音通话、自定义村规。

## 项目结构

pnpm monorepo，共六个包：

- `packages/shared` — 游戏类型、Socket 协议、规则引擎和常量；纯逻辑，无 IO 依赖
- `packages/server` — Fastify + Socket.IO 后端；SQLite 用户数据、Redis 运行时状态、AI 插件和语音频道管理
- `packages/client` — React 19 + Vite 8 前端；Tailwind CSS v4，Feature 模块架构
- `packages/admin` — 独立 React 管理后台
- `packages/mcp` — MCP 服务端；通过 API Key 连接游戏 Socket.IO 服务
- `packages/e2e` — Playwright Core 驱动的本地 E2E 脚手架；包含 smoke、lifecycle、human 和 visual 场景

## 文档与事实来源

通用开发约束以本文件为准。领域文档如下：

- **[协议文档](docs/protocol.md)** — HTTP、Socket.IO、MCP 与部署兼容性；代码中的共享类型和 `PROTOCOL_VERSION` 才是最终事实来源
- **[部署文档](docs/deployment.md)** — Docker Compose、环境变量、Redis 与运行时状态发布策略
- **[MCP 使用指南](docs/mcp.md)** — MCP 配置、工具和调用方式
- **[AI 模型提供者](docs/ai-model-provider.md)** — 内置/社区 AI provider 与 ONNX 插件
- **[村规扩展指南](docs/house-rules-extension-guide.md)** — `HouseRules`、规则注册表和新增村规步骤

不存在单独的通用“前端规范”“后端规范”或“插件扩展规范”；不要引用已经删除的旧指南。

## 架构概览

### 服务端

HTTP API 统一挂载在 `/api` 下。`packages/server/src/plugin-loader.ts` 当前注册六个 Fastify HTTP 插件：

```text
auth, profile, admin, server-info, spectate, api-key
```

房间、游戏、座位、交互和语音主要是 Socket.IO 领域，不是独立 HTTP 插件。事件由
`packages/server/src/ws/socket-handler.ts` 统一装配，领域逻辑位于 `src/ws/` 与
`src/plugins/core/{room,game,interaction}/`。

`PluginContext` 只注入数据库、KV、Socket.IO 和配置等共享依赖。社区 AI provider 位于
`packages/server/src/ai/`，由 `aiProviderRegistry` 在服务启动和关闭时统一管理。

### 客户端

前端按 Feature 拆分，并通过 `React.lazy()` 做路由级代码分割：

```text
packages/client/src/features/ — auth, game, lobby, profile
packages/client/src/shared/   — 跨 Feature 的组件、API、Socket、store、声音和语音运行时
```

管理后台是独立 Vite 应用，不复用客户端路由或运行时 store。

### 数据与进程模型

- **SQLite（Kysely + Node.js `node:sqlite`）** — 持久用户数据：用户、API Key、Passkey
- **Redis KV** — 生产运行时数据：房间、座位、观战者、游戏快照、离房状态和用户当前房间映射
- **内存 KV** — 仅用于 `DEV_MODE=true` 的本地开发和测试

运行时 key 位于 `uno:runtime:v<RUNTIME_SCHEMA_VERSION>:` namespace。游戏 Session、生命周期锁和
Socket.IO 房间适配器仍由单个服务端进程持有，因此当前不能水平扩展多个 game server 实例。

## 关键约束

### 运行时与格式

- Node.js engine 为 `>=22`，`.nvmrc` 与 Docker 固定 Node 22
- pnpm 固定为 `10.11.0`，以根 `package.json#packageManager` 为准
- 全 ESM（所有包均为 `"type": "module"`）
- TypeScript strict mode；类型导入使用 `import type`
- 文本文件默认 LF；仅 `*.bat` 和 `*.cmd` 使用 CRLF，以 `.gitattributes` 为准
- Prettier 固定为 `3.6.2`，配置以 `.prettierrc.json` 为准
- `pnpm format` 格式化全仓；`pnpm format:check` 只检查；不要手工格式化 `.prettierignore` 中的生成文件

### 代码与数据

- 用户可见文案使用中文
- 数据库返回值不要展开（`...row`）；显式选择和返回字段，避免泄露密码散列等敏感数据
- SQLite 中的用户、API Key、Passkey 属于必须保留的数据，schema 变化需要明确迁移
- Redis 运行时结构不做旧 schema 兼容或迁移；破坏性变化通过新 `RUNTIME_SCHEMA_VERSION` 隔离
- Socket/ACK 不做旧前端协议降级；破坏性变化递增 `PROTOCOL_VERSION`，旧客户端直接刷新
- 不要为旧 Redis 数据、旧前端 payload 或已删除的运行时结构增加猜测、补字段、双读双写等兼容分支

### Git

- 提交信息使用 Conventional Commits
- 无论 GitHub 仓库侧是否启用了 branch protection，都必须把 `main` 当作受保护分支：所有变更通过 PR 合并
- 创建 PR 使用 `gh pr create`；合并使用 `gh pr merge --squash --delete-branch`
- 合并后执行 `git fetch --prune`，并用 `git pull --ff-only` 同步本地 `main`

## 本地开发

```bash
pnpm install
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev   # 后端 :3001
pnpm --filter client dev                                        # 前端 :5173
pnpm --filter admin dev                                         # 管理后台 :5174
```

- `DEV_MODE=true` 使用临时用户登录，不需要 GitHub OAuth，也不会把临时用户写入 SQLite
- `JWT_SECRET` 始终必填；生产环境必须是至少 32 字符的唯一随机值
- client dev/preview 默认代理 `/api` 和 `/socket.io` 到 `http://localhost:3001`，可用 `VITE_PROXY_TARGET` 覆盖
- admin dev 代理 `/api` 到 `http://localhost:3001`
- `/api` 代理不能重写路径；服务端路由本身包含 `/api` 前缀
- SQLite 表在服务启动时自动创建

## 常用命令

```bash
pnpm test                                      # 先检查格式，再运行 shared/server/client/mcp/e2e 测试
pnpm build                                     # 构建 shared/server/client/admin/mcp
pnpm format                                    # 按固定配置格式化全仓
pnpm format:check                              # 只检查格式
pnpm --filter shared test                      # 最快的纯逻辑测试
pnpm --filter shared build                     # 生成 client/server 依赖的 shared 类型产物
pnpm --filter server exec tsc --noEmit         # server 类型检查；需先 build shared
pnpm --filter client build                     # client 类型检查与生产构建；需先 build shared
node packages/client/scripts/generate-card-themes.mjs # 修改内置卡面设计后重新生成并提交静态资源
```

根 `pnpm lint` 目前没有实际 lint 子脚本，不能把它当作有效验证结果。

### 完整验证

client 和 server 依赖 shared 编译产物。提交 PR 前至少按以下顺序执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter shared build
pnpm --filter server exec tsc --noEmit
pnpm --filter client build
pnpm test
```

涉及 admin、MCP、Docker 构建输入或全仓工程配置时，再执行 `pnpm build`。MCP 发布前还要执行
`pnpm --dir packages/mcp exec npm pack --dry-run`。

### E2E

```bash
pnpm --filter @uno-online/e2e test      # harness 配置、端口与启动清理单元测试
pnpm --filter @uno-online/e2e smoke     # 真实服务端 + Vite + 浏览器冒烟
node packages/e2e/lifecycle-verify.mjs  # 房间/断线/重连生命周期实机回归
node packages/e2e/human.mjs             # 桌面、横屏和触屏拟人交互
pnpm --filter @uno-online/e2e visual    # 多分辨率截图、溢出与 console 检查
```

除第一条单元测试外，脚本会自行启动开发服务，运行前默认的 `3001`/`5173`（或覆盖后的端口）必须空闲。浏览器路径通过
`CHROME_PATH` 指定，Linux 默认 `/usr/bin/google-chrome`。`UNO_CLIENT_URL`、`UNO_E2E_CLIENT_PORT` 和
`UNO_E2E_SERVER_PORT` 可覆盖本地 origin/端口；自动启动只接受 loopback HTTP 目标。输出位于
`packages/e2e/output/`，不提交仓库。`lib/driver.mjs` 依赖 `window.__uno`；生产构建测试通过
`localStorage['uno-e2e']='1'` 显式开启该钩子。

## MCP 服务端

`packages/mcp` 是独立 Socket.IO 客户端，使用 API Key 鉴权，不经过浏览器 JWT。CLI 支持 stdio 和
仅监听 `127.0.0.1` 的 Streamable HTTP 两种传输。

```text
src/
├── index.ts              # CLI 参数、stdio/HTTP 传输
├── server.ts             # McpUnoServer
├── socket-client.ts      # Socket.IO 客户端与状态缓存
├── notifications.ts      # Socket.IO 事件 → MCP 日志通知
├── tools/
│   ├── room.ts           # 10 个房间管理工具
│   ├── game.ts           # 11 个游戏操作工具
│   └── query.ts          # 4 个查询工具
├── utils.ts
└── types.ts
```

MCP 工具名称和参数以 `packages/mcp/src/tools/` 为准；修改 Socket 协议时必须同步 MCP 客户端、工具和测试。

### MCP npm 发布

`@uno-online/mcp` 发布到 npm，供 AI 客户端通过 `npx @uno-online/mcp` 使用：

```bash
pnpm --filter shared build
pnpm --filter @uno-online/mcp build
pnpm --dir packages/mcp exec npm pack --dry-run
cd packages/mcp && npm publish --access public
```

发布包应只包含 `dist/index.js` 和 `package.json`。版本号由 `pnpm version:sync` 同步；
`McpServer` 版本由 tsup 从包版本注入 `__PKG_VERSION__`，不要手工维护源码常量。

## Docker 与部署

当前仓库没有 GitHub Actions CI 或自动发布工作流；构建、推送、部署、npm 发布和 GitHub Release 均为手工流程。

`Dockerfile` 有两个发布目标：

- `server` — Node.js 后端
- `caddy` — client + admin 静态资源与反向代理

语音网关使用独立的 `mumble.Dockerfile`，仅在明确更新网关镜像时单独构建。
`mumble-gateway.config.json` 是运行时只读挂载，修改它只需重启对应服务，不需要重建镜像。

```bash
docker build --target server -t djkcyl/uno-online-server:latest .
docker build --target caddy -t djkcyl/uno-online-caddy:latest .
docker build -f mumble.Dockerfile -t djkcyl/uno-online-mumble-gateway:latest .
```

### 生产约束

- 生产环境必须配置 `REDIS_URL`；缺失时服务端拒绝启动
- Compose Redis 开启 AOF，并把 `/data` 挂载到 `./data/redis`
- 兼容发布不能清空、删除或重建 Redis 数据目录，也不能无范围执行 `FLUSHDB`
- 发布期间保持 `JWT_SECRET` 不变，否则现有浏览器身份全部失效
- server 必须接收 `SIGTERM` 并在 Compose 的 30 秒宽限内完成 drain/flush；不要直接 `SIGKILL`
- 只运行一个 game server；不要用新旧 server 重叠的滚动发布

### 发布兼容性判定

应用 SemVer、运行时 schema 与网络协议是三个独立版本维度。每次发版必须分别判断：

1. **状态兼容发布**：Redis 房间/游戏结构和 Socket 合约兼容。保持 `RUNTIME_SCHEMA_VERSION` 与
   `PROTOCOL_VERSION` 不变，保留 Redis 和 `JWT_SECRET`；优雅重启后玩家刷新可继续对局。
2. **运行时结构破坏性发布**：先停止创建新房间并排空活跃房间，再递增部署环境中的
   `RUNTIME_SCHEMA_VERSION`。新服务只读取新 namespace，不迁移旧数据。
3. **Socket/ACK 破坏性发布**：递增 `packages/shared/src/constants/protocol.ts` 中的
   `PROTOCOL_VERSION`，前后端与 MCP 协同发布；旧客户端握手失败并提示刷新，不做协议降级。

从本次引入 namespace/严格协议版本之前的版本首次升级时属于破坏性发布：先排空旧房间；新服务默认使用
`RUNTIME_SCHEMA_VERSION=1`，不会读取旧的无 namespace Redis key。完成这次上线后，后续兼容版本才可按
第一类流程保留活跃对局。

兼容更新已运行的 Compose 环境时，仅拉取并重建应用容器：

```bash
docker compose pull server caddy
docker compose up -d --no-deps server
docker compose up -d --no-deps caddy
```

首次部署使用 `docker compose up -d`。破坏性发布应安排维护窗口：先停止接纳新房间，在旧 server 仍运行时
等待或终止活跃房间，再停止旧 server，最后更新 schema/protocol 并部署匹配的 server 与 caddy。具体变量和
运维说明见 `docs/deployment.md`。

## 版本号与完整发版流程

自动化尚未实现；以下步骤均需显式执行并核对结果。

1. **确定 SemVer**：根据变更范围决定 patch/minor/major。
2. **检查版本范围**：`git log --oneline v<上个版本号>..HEAD`，收集完整变更。
3. **判定发布兼容性**：按上一节决定是否排空房间、调整 `RUNTIME_SCHEMA_VERSION` 或递增
   `PROTOCOL_VERSION`。不要把应用 SemVer 直接当作 runtime/protocol 版本。
4. **同步包版本**：只修改根 `package.json#version`，然后执行：

   ```bash
   pnpm run version:sync
   ```

   所有 workspace `package.json` 会同步。MCP 由 tsup 注入版本；client Vite 从自身 `package.json` 注入
   `BUILD_VERSION`，`build-info.ts` 仅保留开发 fallback。

5. **更新发布说明**：在 `CHANGELOG.md` 顶部新增版本，并在
   `packages/client/src/shared/data/changelog.ts` 数组顶部添加精选用户可感知内容。
6. **验证版本与代码**：确认所有 workspace 包版本一致，然后执行完整验证、`pnpm build` 和 MCP pack 预检。
7. **通过 PR 合并**：版本、changelog 和必要的 protocol 变更必须先进入 PR；禁止直接推 main。
8. **同步 main 并打 tag**：PR squash 合并后：

   ```bash
   git fetch --prune origin
   git switch main
   git pull --ff-only
   git tag -a v<版本号> -m "release: v<版本号>"
   git push origin v<版本号>
   ```

9. **构建并推送 Docker 镜像**：同时保留不可变版本 tag 和 `latest`：

   ```bash
   docker build --target server -t djkcyl/uno-online-server:v<版本号> -t djkcyl/uno-online-server:latest .
   docker build --target caddy -t djkcyl/uno-online-caddy:v<版本号> -t djkcyl/uno-online-caddy:latest .
   docker push djkcyl/uno-online-server:v<版本号>
   docker push djkcyl/uno-online-server:latest
   docker push djkcyl/uno-online-caddy:v<版本号>
   docker push djkcyl/uno-online-caddy:latest
   ```

   仅在语音网关有改动时构建并推送 `djkcyl/uno-online-mumble-gateway`；它不随每个应用版本强制重发。

10. **按兼容性策略部署**：保留 Redis/JWT，或在破坏性发布的维护窗口切换 schema/protocol。
11. **发布 MCP npm 包**：构建、pack 预检后运行 `npm publish --access public`。
12. **创建 GitHub Release**：标题使用 `v<版本号> — <简短标题>`，正文取对应 CHANGELOG，并附：

    ```markdown
    ### Docker

    `docker pull djkcyl/uno-online-server:v<版本号>`
    `docker pull djkcyl/uno-online-caddy:v<版本号>`

    ### MCP

    `npx @uno-online/mcp@<版本号>`
    ```

    使用 `gh release create v<版本号> --title "..." --notes-file <文件>` 创建，避免在命令行重复维护长正文。
