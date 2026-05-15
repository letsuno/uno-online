<p align="center">
  <img src="packages/client/public/favicon.svg" width="120" alt="UNO Online Logo" />
</p>

<h1 align="center">UNO Online</h1>

<p align="center">
  <a href="https://github.com/letsuno/uno-online"><img src="https://img.shields.io/github/license/letsuno/uno-online" alt="License" /></a>
</p>

<p align="center"><a href="README.en.md">English</a></p>

基于 Web 技术栈的多人在线 UNO，对局实时同步，支持语音、观战、可配置村规，以及让 AI 客户端参与游戏的 MCP 服务端。

## 主要功能

- 2-10 人房间，通过 6 位房间码邀请加入
- 完整 UNO 规则：功能牌、+4 质疑、计分、多轮对局
- 34 条可配置村规，内置经典、派对、疯狂三套预设
- Socket.IO 权威服务端，客户端提供即时反馈
- Mumble 语音通话，支持逐人静音和说话状态
- 服务器选择、管理后台、观战、色盲模式、音效和动画
- MCP 服务端，AI 客户端可通过工具加入并操作游戏

## 技术栈

- **前端**：React 19、TypeScript、Vite 8、Tailwind CSS v4、Zustand
- **后端**：Fastify、Socket.IO、TypeScript
- **共享逻辑**：`packages/shared` 内的纯 TypeScript 规则引擎
- **存储**：SQLite + Kysely；Redis 可选，未配置时使用内存回退
- **语音**：Mumble + mumble-web-gateway
- **部署**：Docker + Caddy
- **仓库结构**：pnpm workspaces

## 项目结构

```text
packages/
  shared/  # 规则引擎、类型、常量
  server/  # Fastify + Socket.IO + SQLite
  client/  # 玩家 Web 应用
  admin/   # 管理后台
  mcp/     # AI 客户端使用的 MCP 服务端
```

## 快速开始

要求：

- Node.js 22+
- pnpm 10+

```bash
git clone https://github.com/letsuno/uno-online.git
cd uno-online
corepack enable && corepack prepare pnpm@10.11.0 --activate
pnpm install
cp .env.example .env
```

分别在不同终端启动：

```bash
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev
pnpm --filter client dev
pnpm --filter admin dev
```

- 客户端：`http://localhost:5173`
- 管理后台：`http://localhost:5174`
- 服务端：`http://localhost:3001`

`DEV_MODE=true` 时会跳过 GitHub OAuth，输入任意用户名即可登录。

## 常用命令

```bash
pnpm test
pnpm --filter shared test
pnpm --filter shared build
pnpm --filter server exec tsc --noEmit
pnpm --filter client exec tsc --noEmit
```

## 更多文档

- [后端开发规范](docs/backend-development-guide.md)
- [前端开发规范](docs/frontend-development-guide.md)
- [插件扩展规范](docs/plugin-extension-guide.md)
- [村规扩展指南](docs/house-rules-extension-guide.md)
- [通信协议文档](docs/protocol.md)
- [部署与镜像](docs/deployment.md)
- [MCP 使用指南](docs/mcp.md)
- [UI/UX 规范](UIUX-GUIDELINES.md)

环境变量以 `.env.example` 为准。HTTP API 统一挂载在 `/api` 下；路由和 Socket.IO 事件见通信协议文档。

## 许可证

[AGPL-3.0](LICENSE)
