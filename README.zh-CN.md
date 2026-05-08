# UNO Online

基于 Web 技术栈的在线多人 UNO 卡牌对战游戏，支持语音通话、32 条可配置村规、多服务器切换、卡通趣味视觉风格。

## 功能特性

- **2-10 人房间制** — 通过 6 位房间码邀请好友加入
- **完整 UNO 规则** — 全部牌型、质疑机制、计分系统、多轮制
- **32 条可配置村规** — 叠加、反弹、抢出、0 牌轮转、7 牌交换、淘汰制、闪电战、团队模式等
- **3 套预设** — 经典（标准规则）、派对（常见村规）、疯狂（全部开启）
- **服务器选择** — 浏览和切换服务器，实时查看状态（在线人数、房间数、延迟），支持自定义服务器
- **语音通话** — mediasoup SFU 架构，逐人静音，说话状态指示
- **实时对战** — Socket.IO 通信，权威服务器 + 客户端预测
- **动画效果** — Framer Motion 卡牌动画、功能牌特效、胜利彩纸
- **音效系统** — Web Audio API 合成器（无需音频文件）
- **色盲友好** — 纹理图案叠加 + 颜色符号标识（♦♠♣♥）
- **移动端适配** — 触摸滑动优化、响应式布局
- **管理后台** — 用户管理、房间监控、数据看板
- **GitHub OAuth** + 密码登录

## 技术栈

| 层 | 技术选型 |
|---|---------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| 状态管理 | Zustand |
| 动画 | Framer Motion + CSS |
| 后端 | Fastify + TypeScript |
| 实时通信 | Socket.IO (WebSocket) |
| 语音 | mediasoup (SFU) |
| 数据库 | SQLite (Kysely) |
| 缓存 | Redis（可选，内存回退） |
| 认证 | GitHub OAuth + 密码 + JWT |
| 部署 | Docker + Caddy（自动 SSL） |
| Monorepo | pnpm workspaces |

## 项目结构

```
uno-online/
├── packages/
│   ├── shared/          # 规则引擎、类型定义、常量（纯逻辑，无 I/O）
│   ├── server/          # Fastify + Socket.IO + mediasoup + SQLite
│   ├── client/          # React SPA (Vite + Tailwind CSS v4)
│   └── admin/           # 管理后台 (React + Vite)
├── Dockerfile
├── docker-compose.yml
├── Caddyfile
└── tsconfig.base.json
```

## 前置要求

- Node.js 22+
- pnpm 10+
- GitHub OAuth App（生产环境登录用，开发模式可不填）

## 本地开发

```bash
# 克隆并安装依赖
git clone <repo-url> && cd uno-online
corepack enable && corepack prepare pnpm@10.11.0 --activate
pnpm install

# 配置环境变量
cp .env.example .env
# 按需编辑（DEV_MODE=true 无需 GitHub OAuth）

# 启动服务端（热重载）
DEV_MODE=true JWT_SECRET=dev-secret pnpm --filter server dev

# 启动客户端（另一个终端）
pnpm --filter client dev

# 启动管理后台（另一个终端）
pnpm --filter admin dev
```

- 客户端：`http://localhost:5173`
- 管理后台：`http://localhost:5174`
- 服务端：`http://localhost:3001`

开发模式下输入任意用户名即可登录，无需 GitHub OAuth。

## Docker 部署

```bash
# 1. 复制并编辑配置
cp .env.example .env
# 编辑 .env — 设置 DOMAIN、GitHub OAuth 凭证、JWT_SECRET

# 2. 构建并启动
docker compose up -d --build

# 3. 验证
curl http://localhost/health
curl http://localhost/server/info
```

### 手动构建 Docker 镜像

```bash
# 基于当前源码构建 server 运行时镜像
docker build --target server -t uno-online-server:local .

# 构建 caddy 镜像（包含 client + admin 静态资源）
docker build --target caddy -t uno-online-caddy:local .
```

无缓存强制重建：

```bash
docker build --no-cache --target server -t uno-online-server:local .
docker build --no-cache --target caddy -t uno-online-caddy:local .
```

### 推送镜像到 Docker Hub

```bash
# 给本地镜像打仓库标签
docker tag uno-online-server:local djkcyl/uno-online-server:latest
docker tag uno-online-caddy:local djkcyl/uno-online-caddy:latest

# 推送到 Docker Hub
docker push djkcyl/uno-online-server:latest
docker push djkcyl/uno-online-caddy:latest
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEV_MODE` | 跳过 GitHub OAuth，启用开发登录 | `true` |
| `JWT_SECRET` | JWT 签名密钥（至少 32 字符） | （必填） |
| `DATABASE_PATH` | SQLite 数据库文件路径 | `uno.db` |
| `REDIS_URL` | Redis 连接字符串（可选） | 使用内存存储 |
| `GITHUB_CLIENT_ID` | GitHub OAuth 客户端 ID | （生产必填） |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth 客户端密钥 | （生产必填） |
| `CLIENT_URL` | 前端地址（CORS 用） | `http://localhost:5173` |
| `DOMAIN` | 生产域名（Caddy 自动 SSL） | `localhost` |
| `PORT` | 服务端端口 | `3001` |
| `SERVER_NAME` | 服务器显示名称（服务器选择器中展示） | `UNO Online` |
| `SERVER_MOTD` | 服务器欢迎信息 | `欢迎来到 UNO Online！` |

## API 接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/server/info` | 否 | 服务器状态（名称、版本、欢迎信息、在线人数、房间数、运行时长） |
| `GET` | `/health` | 否 | 健康检查 |
| `GET` | `/auth/config` | 否 | 认证配置（开发模式、GitHub 客户端 ID） |
| `POST` | `/auth/login` | 否 | 密码登录 |
| `POST` | `/auth/register` | 否 | 注册新账号 |
| `GET` | `/auth/me` | 是 | 当前用户信息 |

## 测试

```bash
# 运行全部测试
pnpm test

# 规则引擎测试
pnpm --filter shared test

# 类型检查
pnpm --filter server exec tsc --noEmit
pnpm --filter client exec tsc --noEmit
```

## 架构设计

### 规则引擎 (`packages/shared`)

纯函数设计：`applyAction(state, action) => newState`，无 I/O 依赖，完全可单元测试。客户端用于出牌合法性预判，服务端用于权威验证。

村规引擎包装核心引擎：`applyActionWithHouseRules(state, action) => newState`。

### 服务端 (`packages/server`)

- **插件架构** — 所有功能以 Fastify 插件组织，通过 `PluginContext` 共享依赖
- **权威状态** — 客户端做乐观更新，服务端是唯一规则权威
- **游戏状态存 KV** — Redis 或内存回退，游戏结束后持久化到 SQLite
- **服务器信息接口** — `GET /server/info` 返回实时状态，支持 CORS 跨服务器查询
- **回合计时** — 可配置（15/30/60 秒），超时自动摸牌跳过
- **掉线处理** — 60 秒重连窗口，超时后每 5 秒自动托管
- **频率限制** — 每个连接 20 条/秒

### 客户端 (`packages/client`)

- **Feature 模块架构** — auth、game、lobby、profile 独立模块
- **Zustand 状态管理** — auth、room、game、settings、server（localStorage 持久化）
- **服务器选择器** — 切换服务器并实时展示状态，延迟测量（3 次 HTTP RTT 取平均）
- **Socket.IO** — 自动重连（5 次，指数退避），重连后自动恢复房间
- **语音** — mediasoup-client，transport 断线自动重连，浏览器兼容性检测
- **音效** — Web Audio API 振荡器合成，13 种音效

## 村规列表（32 条）

| 分类 | 规则 |
|------|------|
| 叠加 | +2 叠加、+4 叠加、+2/+4 互叠 |
| 反弹 | Reverse 反弹 +2/+4、Skip 挡罚 |
| 出牌 | 0 牌轮转手牌、7 牌指定交换、同牌抢出、同数字全出、万能牌开局可出 |
| 摸牌 | 摸到能出为止、摸牌后必须出 |
| 手牌 | 手牌上限（15/20/25）、强制出牌、手牌透明 |
| 惩罚 | UNO 罚摸数量（2/4/6）、误操作惩罚 |
| 节奏 | 死亡抽牌、快速模式、无提示模式 |
| 模式 | 淘汰制、限时闪电战、复仇模式 |
| 社交 | 静默 UNO、团队模式（2v2/3v3） |
| 终局 | 空手赢不算、末牌限制、积分翻倍 |
| 趣味 | 无质疑 +4、暗牌模式、炸弹牌 |

## 许可证

私有项目。
