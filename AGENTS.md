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
- **[CI 与自动发版](docs/ci-release.md)** — GitHub Actions、仓库配置、Tag 发版与故障恢复
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

运行时 key 位于固定的 `uno:runtime:` namespace。游戏 Session、生命周期锁和
Socket.IO 房间适配器仍由单个服务端进程持有，因此当前不能水平扩展多个 game server 实例。

## 关键约束

### 运行时与格式

- Node.js engine 为 `>=22`，`.nvmrc` 与 Docker 固定 Node 22
- `@types/node` 固定使用最新的 22.x，与 CI 和生产运行时一致，不升级到更高 Node 主版本的类型
- pnpm 固定为 `10.11.0`，以根 `package.json#packageManager` 为准
- 全 ESM（所有包均为 `"type": "module"`）
- TypeScript strict mode；类型导入使用 `import type`
- workspace 的 `tsc` 统一使用 TypeScript 7；server 启动时通过 `esbuild` 转译社区 AI 插件，运行时不依赖
  TypeScript Compiler API
- 文本文件默认 LF；仅 `*.bat` 和 `*.cmd` 使用 CRLF，以 `.gitattributes` 为准
- Prettier 固定为 `3.9.6`，配置以 `.prettierrc.json` 为准
- `pnpm format` 格式化全仓；`pnpm format:check` 只检查；不要手工格式化 `.prettierignore` 中的生成文件

### 代码与数据

- 用户可见文案使用中文
- 数据库返回值不要展开（`...row`）；显式选择和返回字段，避免泄露密码散列等敏感数据
- SQLite 中的用户、API Key、Passkey 属于必须保留的数据，schema 变化需要明确迁移
- Redis 运行时结构不做旧 schema 兼容或迁移；破坏性变化递增代码内
  `RUNTIME_STATE_GENERATION`，新服务启动时自动清空 UNO 运行时状态
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
```

以上命令只做本地构建与打包预检；正式 npm 发布统一由版本 Tag 触发的 GitHub Actions 通过 OIDC 完成，不把
本地 `npm publish` 作为标准发版步骤。发布包应只包含 `dist/index.js` 和 `package.json`。版本号由
`pnpm version:sync` 同步；
`McpServer` 版本由 tsup 从包版本注入 `__PKG_VERSION__`，不要手工维护源码常量。

## Docker 与部署

`.github/workflows/ci.yml` 会在 PR 与 main push 上执行完整验证和两个 Docker target 构建。
`.github/workflows/release.yml` 通常由合法 SemVer Tag push 触发；已有 Tag 的发布故障也可从 `main` 通过
`workflow_dispatch` 指定原 Tag 恢复。两种入口都只检出现有 Tag，并执行相同的 Tag/main/版本校验。
GitHub Actions 不会 SSH 或直接重启生产服务器。生产 Komodo 会按计划轮询当前镜像通道并更新兼容版本；
破坏性发布仍是显式运维步骤。

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
- 兼容发布不能清空、删除或重建 Redis 数据目录；破坏性发布由新服务按代码代次自动清理
- 发布期间保持 `JWT_SECRET` 不变，否则现有浏览器身份全部失效
- server 必须接收 `SIGTERM` 并在 Compose 的 30 秒宽限内完成 drain/flush；不要直接 `SIGKILL`
- 只运行一个 game server；不要用新旧 server 重叠的滚动发布
- `docker-compose.yml` 使用明确的 `latest`，`docker-compose.beta.yml` 同时把 server/caddy 覆盖为 `beta`；
  不要把镜像 Tag 改回环境变量插值，Komodo 无法据此可靠判断镜像更新
- `server` 与 `caddy` 都有容器健康检查；部署工具应等待健康状态后再报告成功

### 生产 Komodo

- 面板当前公开在 `http://111.229.152.99:9120`，新用户注册保持关闭；这是未启用 TLS 的管理入口，后续应优先
  改为 HTTPS 或收回到 SSH 隧道
- UNO Stack 工作目录是 `/etc/komodo/stacks/uno-online`，Stack/Compose 项目名均为 `uno-online`
- Stack Environment 不保存镜像通道；生产变量位于权限为 `0600` 的 `.env.secrets`，作为 Track Disabled 的
  Additional Env File 使用
- `Switch UNO to Beta` Action 把 Stack File Paths 设为 `docker-compose.yml` 加
  `docker-compose.beta.yml`；`Switch UNO to Stable` 只保留 `docker-compose.yml`，两者随后部署 Stack
- 精确回滚时新增临时 Compose override，以明确 Tag 同时覆盖 server/caddy，并把它加入 Stack File Paths；
  不要使用 `image: ...:${...}` 形式
- 每天 03:00 的 Global Auto Update 只检查 `server` 与 `caddy`；`redis`、`mumble` 和
  `mumble-gateway` 必须留在自动更新忽略列表
- Stack 启用 Pre Pull Images，关闭 Full Stack Auto Update 与 Destroy Before Deploy；自动更新只重建检测到新镜像的
  server/caddy，不要让自动部署先执行 `compose down`
- Docker daemon 与 Komodo Periphery 的网络请求相互独立；当前 `/etc/komodo/compose/compose.env` 同时给 Core 和
  Periphery 配置 `HTTP_PROXY`、`HTTPS_PROXY` 与内网 `NO_PROXY`，否则 Periphery 无法查询 Docker Hub manifest
- 每天 01:00 备份 Komodo 数据库到 `/etc/komodo/backups`；默认保留最近 14 份
- 手动执行 Compose 时必须传入 `--env-file .env.secrets`，且保持项目名为 `uno-online`

### 发布兼容性判定

应用 SemVer、Redis 运行时兼容性与网络协议是三个独立判定维度。每次发版必须分别判断：

1. **状态兼容发布**：Redis 房间/游戏结构和 Socket 合约兼容。保持代码内
   `RUNTIME_STATE_GENERATION` 与 `PROTOCOL_VERSION` 不变，保留 Redis 和 `JWT_SECRET`；优雅重启后玩家刷新可继续对局。
2. **运行时结构破坏性发布**：先停止创建新房间并排空活跃房间，再递增
   `packages/server/src/kv/runtime-state.ts` 中的 `RUNTIME_STATE_GENERATION`。旧 server 退出后，新 server
   启动时自动清空固定 namespace，不迁移旧数据，不需要运维人工清 Redis。
3. **Socket/ACK 破坏性发布**：递增 `packages/shared/src/constants/protocol.ts` 中的
   `PROTOCOL_VERSION`，前后端与 MCP 协同发布；旧客户端握手失败并提示刷新，不做协议降级。

首次上线固定 namespace/代码代次机制时属于破坏性发布：新 server 找不到当前代次标记，
会在启动期间自动删除 `uno:runtime:` 下的旧状态后再提供服务。

兼容更新已运行的 Compose 环境时，仅拉取并重建应用容器：

```bash
docker compose --env-file .env --env-file .env.secrets pull server caddy
docker compose --env-file .env --env-file .env.secrets up -d --no-deps --wait server
docker compose --env-file .env --env-file .env.secrets up -d --no-deps --wait caddy
```

当前生产不使用省略 env 文件的裸 `docker compose up -d`。首次创建或完整恢复生产 Stack 由 Komodo 部署；
必须脱离面板操作时，也要显式传入 `.env` 与 `.env.secrets` 并保持 Compose 项目名为 `uno-online`。破坏性发布
应安排维护窗口：先停止接纳新房间，在旧 server 仍运行时等待或终止活跃房间，再停止旧 server，最后部署
匹配的 server 与 caddy；新 server 会按代码代次自动清理不兼容运行时状态。具体说明见 `docs/deployment.md`。

## 版本号与完整发版流程

GitHub 自动发布只负责验证和发布制品；版本判断、兼容性判断、PR、Tag 与生产部署仍需显式执行。

1. **确定 SemVer**：根据变更范围决定 patch/minor/major。
2. **检查版本范围**：
   - Beta 迭代比较上一个 Beta Tag 到 `HEAD`，用于编写本次测试版的增量说明。
   - Beta 转正式版必须先执行 `git fetch --tags --prune` 和 `pnpm release:stable-diff`。该命令会自动选择
     `HEAD` 可达的上一个正式 `vX.Y.Z` Tag，并输出该 Tag 到 `HEAD` 的提交、`git diff --stat` 和文件清单；
     正式版说明以这个完整范围为准，不能只比较最后一个 Beta。
3. **判定发布兼容性**：按上一节决定是否排空房间、递增 `RUNTIME_STATE_GENERATION` 或
   `PROTOCOL_VERSION`。不要把应用 SemVer 直接当作运行时/协议兼容性标记。
4. **同步包版本**：只修改根 `package.json#version`，然后执行：

   ```bash
   pnpm run version:sync
   ```

   所有 workspace `package.json` 会同步。MCP 由 tsup 注入版本；client Vite 从自身 `package.json` 注入
   `BUILD_VERSION`，`build-info.ts` 仅保留开发 fallback。

5. **更新发布说明**：
   - Beta：在 `CHANGELOG.md` 和客户端 changelog 顶部添加当前 Beta 的增量说明。
   - 正式版：根据第 2 步的完整正式版范围，在 `CHANGELOG.md` 顶部新增正式版说明；客户端 changelog 删除
     同一正式版本的所有 `-beta.N` 条目，并在顶部只保留一个正式版条目。正式 `CHANGELOG.md` 不删除已经发布的
     Beta 历史段落。
   - `pnpm release:check` 会校验客户端首条记录必须等于当前版本，并阻止正式版客户端保留同版本预发布条目。
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

9. **等待自动发版**：Tag push 触发 `Release` workflow。它会再次校验 Tag/main/版本/changelog，执行
   build/test/MCP pack，推送 `server` 与 `caddy` 的 `v<版本号>` 镜像、稳定版 `latest`，通过 npm OIDC
   发布 MCP，最后从 CHANGELOG 创建 GitHub Release。任一步失败都不能视为发版完成。
10. **按兼容性策略部署**：自动发版不连接生产服务器。兼容发布由生产 Komodo 在下次 Global Auto Update
    更新当前通道，也可在面板中立即部署；破坏性发布必须在推送会移动当前镜像通道的版本 Tag 前关闭 Stack
    Auto Update，并在维护窗口排空房间、切换 schema/protocol、部署和验证后再恢复自动更新。
11. **发布后验证**：检查 `/api/health`、`/api/server/info`、浏览器登录/重连以及版本化 Docker/MCP 制品。

预发布 Tag（如 `v1.2.0-beta.0`）会生成 prerelease，推送精确版本镜像并更新 Docker `beta`，但不更新 Docker
`latest`；MCP npm 包使用第一个预发布标识作为 dist-tag（该示例为 `beta`），不会覆盖 npm `latest`。语音网关
镜像不在自动发版范围内。仓库 Secrets、npm Trusted Publisher、GitHub Environment、故障恢复命令等见
`docs/ci-release.md`。
