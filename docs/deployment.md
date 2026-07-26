# UNO Online — 部署与镜像

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
- `REDIS_URL`：可选；未设置时服务端使用内存 KV，Docker Compose 默认启用 Redis。
- `CADDY_SITE_ADDRESS`：Caddy 站点地址，可用域名或 `:80`。
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`：可选；Cloudflare Turnstile 人机验证，两者同时配置后注册/登录页启用 CAPTCHA。
- `WEBAUTHN_RP_NAME`：可选；WebAuthn 依赖方名称，默认 `UNO Online`。
- `WEBAUTHN_RP_ID`：可选；WebAuthn 依赖方 ID，默认从请求 hostname 推断。支持逗号分隔多值。
- `WEBAUTHN_ORIGIN`：可选；WebAuthn 允许的 origin，默认从请求推断。支持逗号分隔多值。
- `MUMBLE_*` / `MUMBLE_ICE_*`：语音服务和房间语音频道管理配置。

完整变量列表以仓库根目录的 `.env.example` 为准。

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
