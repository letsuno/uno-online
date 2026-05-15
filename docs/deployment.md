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

## 反向代理说明

Caddy 会把这些路径转发到后端或语音网关：

- `/api/*` -> server `:3001`
- `/socket.io/*` -> server `:3001`
- `/mumble-ws*` -> mumble gateway `:64737`

客户端和管理后台是静态 SPA，由 Caddy 直接提供。
