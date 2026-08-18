# UNO Online — 部署与镜像

server/caddy 镜像、MCP npm 包与 GitHub Release 由版本 Tag 自动发布。当前生产环境由 Komodo 管理：状态兼容
版本会自动更新当前选择的 `latest` 或 `beta` 通道；破坏性版本仍须先人工完成兼容性判断和维护窗口安排。
工作流与一次性仓库配置见 [CI 与自动发版](ci-release.md)。

## 独立 Docker Compose 部署（非当前生产环境）

以下步骤用于尚未接入 Komodo 的新主机或独立环境。当前生产服务器不要按本节从 `.env.example` 重新生成配置，
应使用下文的 Komodo 流程；必须脱离面板操作时，使用[手动回退到 Compose](#手动回退到-compose)中的双 env
文件命令。

```bash
cp .env.example .env
# 编辑 .env：生产环境至少设置 DOMAIN、CADDY_SITE_ADDRESS、JWT_SECRET、GitHub OAuth 凭证

docker compose pull
docker compose up -d
```

Compose 使用已经发布到镜像仓库的镜像，没有本地 `build:` 配置，因此部署时不要使用无效的 `--build` 参数。

`docker-compose.yml` 明确使用 `latest`，默认跟随正式版。测试版使用额外的覆盖文件：

```bash
docker compose -f docker-compose.yml -f docker-compose.beta.yml pull
docker compose -f docker-compose.yml -f docker-compose.beta.yml up -d
```

镜像名必须保留明确的 Tag，不能改为 `image: ...:${UNO_IMAGE_TAG}`。Komodo 2.2.0 虽然能把该变量传给
Docker Compose，但 Global Auto Update 不能可靠地用这种写法判断运行镜像与远端镜像是否一致；上游跟踪见
[moghtech/komodo#921](https://github.com/moghtech/komodo/issues/921)。

Release workflow 只在所有构建、测试和打包预检通过后推送镜像。正式 Tag 更新 `latest`，Beta Tag 更新 `beta`；
精确版本 Tag 永远保留，可用于回滚。

验证：

```bash
curl http://localhost/api/health
curl http://localhost/api/server/info
```

独立 Compose 环境收到状态兼容版本后，只更新应用容器，不重建 Redis、SQLite 或语音服务：

```bash
docker compose pull server caddy
docker compose up -d --no-deps --wait server
docker compose up -d --no-deps --wait caddy
```

执行 server 更新时，Compose 会先向旧容器发送 `SIGTERM` 并等待其在停机宽限内退出，再启动新容器。运行时
结构或 Socket 协议破坏性发布不能直接执行这组命令，必须先按下文策略排空活跃房间。

## Komodo 管理与自动更新

生产环境由 [Komodo](https://komo.do/docs/deploy/compose) 管理，当前布局如下：

- Komodo Core、MongoDB 与 Periphery 位于 `/etc/komodo/compose`。
- UNO Stack 名为 `uno-online`，Compose 项目名同为 `uno-online`，工作目录是
  `/etc/komodo/stacks/uno-online`，使用服务器上的 `docker-compose.yml`。
- Stack Environment 不保存镜像通道；Komodo 仍会创建 `.env`，当前该文件为空。
- `.env.secrets` 保存生产变量，权限为 `0600`；它作为不跟踪的 Additional Env File 传给 Compose，不能在
  面板中显示或提交到 Git。
- SQLite、Caddy 和语音数据仍使用工作目录下的 `./data` 挂载。Redis 也是独立挂载；兼容发布保留它，明确的
  破坏性发布会由新 server 按代码代次自动清空 UNO 运行时状态。

Komodo 当前映射到服务器的 `0.0.0.0:9120`，可通过 `http://111.229.152.99:9120` 访问，新用户注册已关闭。
该入口目前没有 TLS，登录凭证和管理操作不应长期通过明文 HTTP 传输；后续应配置 HTTPS，或者把端口重新限制为
`127.0.0.1:9120` 并使用 SSH 隧道：

```bash
ssh -N -L 9120:127.0.0.1:9120 root@<server>
```

随后打开 `http://127.0.0.1:9120`。Periphery 没有映射公网端口。

### 切换正式版、Beta 与精确版本

Actions 中有两条已验证的切换动作：

- `Switch UNO to Beta`：使用 `docker-compose.yml` 和 `docker-compose.beta.yml` 后部署 Stack。
- `Switch UNO to Stable`：只使用 `docker-compose.yml` 后部署 Stack。

在对应 Action 页面选择 **Run Action** 并完成名称确认即可切换。切换后在 Stack 页面确认状态为 `running`，并
检查 `/api/server/info` 的版本。若要固定回滚点，创建一个临时 Compose override，用同一个精确 Tag（如
`v1.2.3`）覆盖 server 和 caddy，再把该文件加入 Stack File Paths 并部署；不要用会继续移动的
`latest`/`beta` 代替固定回滚版本。

### 自动更新与备份

Komodo 的 `Global Auto Update` 每天 03:00（`Asia/Shanghai`）运行。UNO Stack 已启用：

- Poll for Updates、Auto Update；
- Pre Pull Images；
- Full Stack Auto Update、Destroy Before Deploy 关闭；
- 自动更新检查忽略 `redis`、`mumble` 和 `mumble-gateway`，只有 `server` 与 `caddy` 跟随当前通道。

Global Auto Update 根据 Compose 中明确的镜像 Tag 拉取并比较镜像摘要；发现新镜像后只重建发生变化的
server/caddy。它不会在 `latest` 与 `beta` 之间自动切换，只会更新当前 Stack File Paths 选择的通道。

镜像更新检查由 Komodo Periphery 自己请求 Docker Registry manifest，不经过 Docker daemon。当前服务器无法
直连 Docker Hub，因此 `/etc/komodo/compose/compose.env` 同时给 Core 和 Periphery 配置：

```dotenv
HTTP_PROXY=http://<proxy-host>:<proxy-port>
HTTPS_PROXY=http://<proxy-host>:<proxy-port>
NO_PROXY=localhost,127.0.0.1,core,mongo,periphery,111.229.152.99
```

只给 Docker systemd 服务配置代理不足以支持 Global Auto Update。修改这些值后，用 Komodo Compose 项目重建
core/periphery，并确认 Periphery 容器中存在相同环境变量。

`Backup Core Database` 每天 01:00 运行，备份写入 `/etc/komodo/backups`；Komodo 默认保留最近 14 份。该
过程已手动执行验证。初次迁移前的应用配置和数据另存于 `/root/uno-online-backups/pre-komodo-20260818`。

正式版与 Beta 共用 SQLite、Redis 和 JWT，因此自动更新仍受本页兼容性规则约束：

- 状态兼容发布可以保持自动更新开启，Komodo 会在下次检查时部署当前通道的新镜像。
- 运行时结构、Socket 协议或不可回退的 SQLite schema 发生破坏性变化时，必须在推送会移动当前通道的 Tag
  **之前**关闭 Stack Auto Update，排空房间并完成运行时/protocol/数据库安排；维护窗口部署和验证完成后
  再恢复自动更新。
- Beta 修改了持久用户数据库 schema 时，切回稳定版之前必须确认数据库迁移可回退。

### 手动回退到 Compose

Komodo 不可用时仍可直接操作同一 Compose 项目。生产变量文件必须显式传入：

```bash
cd /etc/komodo/stacks/uno-online
docker compose --env-file .env.secrets pull server caddy
docker compose --env-file .env.secrets up -d --no-deps --wait server
docker compose --env-file .env.secrets up -d --no-deps --wait caddy
```

以上命令用于正式通道。当前若在 Beta 通道，每条命令都要在 `--env-file` 前添加
`-f docker-compose.yml -f docker-compose.beta.yml`，避免手动操作意外切回 `latest`。

不要从 `.env.example` 覆盖生产 `.env.secrets`，也不要另起 Compose 项目名，否则会创建一套重复容器和网络。

## 关键配置

- `DEV_MODE=false`：生产环境应关闭开发登录。
- `JWT_SECRET`：必须设置为足够长的随机字符串。
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`：生产登录需要 GitHub OAuth。
- `DATABASE_PATH`：SQLite 数据库路径，Docker 默认是 `/data/uno.db`。
- `REDIS_URL`：生产环境必填；开发模式未设置时使用内存 KV。若设置 `REDIS_PASSWORD`，连接 URL 也必须包含同一密码。
- `CADDY_SITE_ADDRESS`：Caddy 站点地址，可用域名或 `:80`。
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`：可选；Cloudflare Turnstile 人机验证，两者同时配置后注册/登录页启用 CAPTCHA。
- `WEBAUTHN_RP_NAME`：可选；WebAuthn 依赖方名称，默认 `UNO Online`。
- `WEBAUTHN_RP_ID`：可选；WebAuthn 依赖方 ID，默认从请求 hostname 推断。支持逗号分隔多值。
- `WEBAUTHN_ORIGIN`：可选；WebAuthn 允许的 origin，默认从请求推断。支持逗号分隔多值。
- `MUMBLE_*` / `MUMBLE_ICE_*`：语音服务和房间语音频道管理配置。

完整变量列表以仓库根目录的 `.env.example` 为准。

## 运行时状态发布策略

房间、座位、观战者、游戏快照和用户当前房间映射都位于固定的 `uno:runtime:` namespace 中：

- 状态兼容发布保持代码内 `RUNTIME_STATE_GENERATION` 不变。Redis 快照会在服务端重启后恢复，玩家刷新即可继续对局。
- 状态破坏发布先停止创建新房间并等待现有房间结束，再递增代码内代次。旧 server 退出后，新 server 会在启动期间用一个 Redis 事务删除 namespace 内全部旧状态并写入新代次；清理失败则拒绝启动。
- 首次启用该机制时 Redis 中还没有代次标记，同样会自动清空现有 UNO 运行时状态；这次上线必须按破坏性发布安排。
- Socket 事件或 ACK 结构发生破坏性变更时同时递增共享的 `PROTOCOL_VERSION`；不匹配的前端会停止通信并提示刷新，不保留旧前端协议分支。
- 部署人员不需要删除 Redis 目录、执行 `FLUSHDB` 或填写任何运行时版本变量。
- 当前游戏服务是单实例架构：Session、生命周期锁和 Socket.IO 房间适配器仍在进程内。兼容发布必须先让旧 server 收到 `SIGTERM` 并完整退出，再启动新 server；不要让新旧两个 game server 滚动重叠运行。
- 发布期间保持 `JWT_SECRET` 不变，否则浏览器中的现有登录凭证会失效，玩家刷新后无法直接恢复身份。

SQLite 用户、API Key 和 Passkey 数据不使用该 namespace，继续通过数据库迁移保留。
Compose 默认把 Redis `/data` 挂载到宿主机 `./data/redis` 并启用 AOF；状态兼容发布不得清空或重建该目录。仅更新 server/caddy 容器即可保留活跃房间，完整清空 Redis 则按设计会终止所有对局。

Compose 为 server 预留 30 秒停机宽限。发布工具必须发送 `SIGTERM` 并等待容器正常退出，不能直接 `SIGKILL`；服务端会停止接纳新操作、等待已接纳操作完成，再把最终游戏快照刷入 Redis。

内存 KV 仅用于 `DEV_MODE=true` 的本地开发。生产模式未配置 `REDIS_URL` 会直接拒绝启动，以确保活跃对局可以在兼容部署重启后从持久化 Redis 恢复；发布时必须保留 Redis 的 `/data`。

## 手动构建镜像

```bash
docker build --target server -t djkcyl/uno-online-server:latest .
docker build --target caddy -t djkcyl/uno-online-caddy:latest .
```

无缓存重建：

```bash
docker build --no-cache --target server -t djkcyl/uno-online-server:latest .
docker build --no-cache --target caddy -t djkcyl/uno-online-caddy:latest .
```

推送：

```bash
docker push djkcyl/uno-online-server:latest
docker push djkcyl/uno-online-caddy:latest
```

## 静态资源说明（卡面主题）

内置卡面主题资源包（`packages/client/public/card-themes/*.zip` 与预览图）是**提交进仓库的静态产物**，由 `packages/client/scripts/generate-card-themes.mjs` 在开发期生成。构建/部署链路无需任何额外步骤：vite build 自动将 `public/` 拷入 dist，caddy 镜像原样伺服。

只有修改主题设计时才需要重新生成并提交：

```bash
node packages/client/scripts/generate-card-themes.mjs
```

## 反向代理说明

Caddy 会把这些路径转发到后端或语音网关：

- `/api/*` -> server `:3001`
- `/socket.io/*` -> server `:3001`
- `/mumble-ws*` -> mumble gateway `:64737`

客户端和管理后台是静态 SPA，由 Caddy 直接提供。
