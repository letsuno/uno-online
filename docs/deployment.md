# UNO Online — 部署与镜像

server/caddy 镜像、MCP npm 包与 GitHub Release 由版本 Tag 自动发布；生产 Compose 更新仍需人工确认兼容性后
执行。工作流与一次性仓库配置见 [CI 与自动发版](ci-release.md)。

## Docker Compose

```bash
cp .env.example .env
# 编辑 .env：生产环境至少设置 DOMAIN、CADDY_SITE_ADDRESS、JWT_SECRET、GitHub OAuth 凭证

docker compose up -d --build
```

验证：

```bash
curl http://localhost/api/health
curl http://localhost/api/server/info
```

## 关键配置

- `DEV_MODE=false`：生产环境应关闭开发登录。
- `JWT_SECRET`：必须设置为足够长的随机字符串。
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`：生产登录需要 GitHub OAuth。
- `DATABASE_PATH`：SQLite 数据库路径，Docker 默认是 `/data/uno.db`。
- `REDIS_URL`：生产环境必填；开发模式未设置时使用内存 KV。若设置 `REDIS_PASSWORD`，连接 URL 也必须包含同一密码。
- `RUNTIME_SCHEMA_VERSION`：临时房间/游戏状态的 schema 代号，默认 `1`。状态兼容发布保持不变；破坏性发布先排空旧房间，再递增该值以隔离旧 namespace。服务端不会读取或迁移旧 namespace。
- `CADDY_SITE_ADDRESS`：Caddy 站点地址，可用域名或 `:80`。
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`：可选；Cloudflare Turnstile 人机验证，两者同时配置后注册/登录页启用 CAPTCHA。
- `WEBAUTHN_RP_NAME`：可选；WebAuthn 依赖方名称，默认 `UNO Online`。
- `WEBAUTHN_RP_ID`：可选；WebAuthn 依赖方 ID，默认从请求 hostname 推断。支持逗号分隔多值。
- `WEBAUTHN_ORIGIN`：可选；WebAuthn 允许的 origin，默认从请求推断。支持逗号分隔多值。
- `MUMBLE_*` / `MUMBLE_ICE_*`：语音服务和房间语音频道管理配置。

完整变量列表以仓库根目录的 `.env.example` 为准。

## 运行时状态发布策略

房间、座位、观战者、游戏快照和用户当前房间映射都位于
`uno:runtime:v<RUNTIME_SCHEMA_VERSION>:` namespace 中：

- 状态兼容发布保持 `RUNTIME_SCHEMA_VERSION` 不变。Redis 中的当前格式快照会在服务端重启后恢复，玩家刷新即可继续对局。
- 状态破坏发布先停止创建新房间并等待现有房间结束，再递增 `RUNTIME_SCHEMA_VERSION`。新服务不会猜测、补齐或迁移旧结构。
- Socket 事件或 ACK 结构发生破坏性变更时同时递增共享的 `PROTOCOL_VERSION`；不匹配的前端会停止通信并提示刷新，不保留旧前端协议分支。
- 确认旧 namespace 已无活跃房间后，可由运维流程删除；不要对可能共享的 Redis 实例直接执行无范围的 `FLUSHDB`。
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
