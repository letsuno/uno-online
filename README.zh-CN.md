# UNO Online

基于 Web 技术栈的在线多人 UNO 卡牌对战游戏，支持语音通话、32 条可配置村规、卡通趣味视觉风格。

## 功能特性

- **2-10 人房间制** — 通过 6 位房间码邀请好友加入
- **完整 UNO 规则** — 全部牌型、质疑机制、计分系统、多轮制
- **32 条可配置村规** — 叠加、反弹、抢出、0 牌轮转、7 牌交换、淘汰制、闪电战、团队模式等
- **3 套预设** — 经典（标准规则）、派对（常见村规）、疯狂（全部开启）
- **语音通话** — mediasoup SFU 架构，逐人静音，说话状态指示
- **实时对战** — Socket.IO 通信，权威服务器 + 客户端预测
- **动画效果** — Framer Motion 卡牌动画、功能牌特效、胜利彩纸
- **音效系统** — Web Audio API 合成器（无需音频文件）
- **色盲友好** — 纹理图案叠加 + 颜色符号标识（♦♠♣♥）
- **移动端适配** — 触摸滑动优化、响应式布局
- **GitHub OAuth** 一键登录

## 技术栈

| 层 | 技术选型 |
|---|---------|
| 前端 | React 18 + TypeScript + Vite |
| 状态管理 | Zustand |
| 动画 | Framer Motion + CSS Animations |
| 后端 | Fastify + TypeScript |
| 实时通信 | Socket.IO (WebSocket) |
| 语音 | mediasoup (SFU) |
| 数据库 | PostgreSQL (Prisma ORM) |
| 缓存 | Redis |
| 认证 | GitHub OAuth + JWT |
| Monorepo | pnpm workspaces |

## 项目结构

```
uno-online/
├── packages/
│   ├── shared/          # 规则引擎、类型定义、常量（纯逻辑，无 I/O）
│   ├── server/          # Fastify + Socket.IO + mediasoup + Prisma
│   └── client/          # React SPA (Vite)
├── Dockerfile           # 多阶段构建
├── docker-compose.yml   # 一键部署
├── nginx.conf           # 反向代理配置
└── tsconfig.base.json
```

## 前置要求

- Node.js 20+
- pnpm 10+
- PostgreSQL
- Redis
- GitHub OAuth App（用于登录）

## 本地开发

```bash
# 克隆并安装依赖
git clone <repo-url> && cd uno-online
corepack enable && corepack prepare pnpm@10.11.0 --activate
pnpm install

# 配置环境变量
cp packages/server/.env.example packages/server/.env
# 编辑 .env，填入数据库地址、Redis 地址、GitHub OAuth 凭证、JWT 密钥

# 初始化数据库
cd packages/server
npx prisma generate
npx prisma db push

# 启动服务端（热重载）
pnpm dev

# 启动客户端（另一个终端）
cd ../client && pnpm dev
```

客户端运行在 `http://localhost:5173`，API 请求自动代理到 `http://localhost:3001`。

## Docker 部署

### 快速启动

```bash
# 1. 复制配置文件并编辑
cp .env.example .env
# 编辑 .env，至少填入 GitHub OAuth 凭证

# 2. 构建并启动（首次约 3-5 分钟）
docker compose up -d --build

# 3. 初始化数据库（仅首次）
docker compose exec -w /app/packages/server server npx prisma db push

# 4. 验证
curl http://localhost:6679/health
```

浏览器打开 `http://localhost:6679` 即可。

### 配置文件 (`.env`)

所有配置集中在根目录 `.env` 一个文件：

```ini
# --- GitHub OAuth（必填，否则无法登录）---
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# --- 安全 ---
JWT_SECRET=please-change-this-to-a-random-string-at-least-32-chars

# --- 端口 ---
HTTP_PORT=6679          # 网页访问端口
RTC_PORT=40000          # 语音通话端口

# --- 数据库（默认连接 Docker 内置 PostgreSQL，外部数据库请改这里）---
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/uno_online
POSTGRES_PASSWORD=postgres

# --- Redis（默认连接 Docker 内置 Redis，外部 Redis 请改这里）---
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=

# --- 前端地址（用于 CORS，部署到域名时修改）---
CLIENT_URL=http://localhost:6679
```

### 服务架构

```
              ┌─────────┐
   :6679      │  Nginx  │  静态文件 + 反向代理
    ──────────┤         │
              └────┬────┘
                   │
        ┌──────────┴──────────┐
        │                     │
  ┌─────┴─────┐        ┌─────┴─────┐
  │  Server   │        │  静态资源   │
  │  :3001    │        │  /dist     │
  └─────┬─────┘        └───────────┘
        │
  ┌─────┼─────────┐
  │     │         │
┌─┴──┐ ┌┴───┐ ┌──┴──────────┐
│ PG │ │Redis│ │mediasoup    │
│5432│ │6379 │ │UDP/TCP 40000│
└────┘ └─────┘ └─────────────┘

对外端口：HTTP_PORT (网页) + RTC_PORT (语音)
```

### 常用命令

```bash
# 查看日志
docker compose logs -f server

# 重启服务
docker compose restart server

# 数据库迁移
docker compose exec -w /app/packages/server server npx prisma db push

# 停止所有服务
docker compose down

# 停止并清除数据
docker compose down -v
```

## 测试

```bash
# 运行全部测试
pnpm test

# 规则引擎测试（170 个用例）
cd packages/shared && pnpm test

# 服务端测试（48 个用例）
cd packages/server && pnpm test
```

## 构建

```bash
# 构建所有包
pnpm build

# 仅构建客户端
cd packages/client && pnpm build
```

## 架构设计

### 规则引擎 (`packages/shared`)

纯函数设计：`applyAction(state, action) => newState`，无 I/O 依赖，完全可单元测试。客户端用于出牌合法性预判，服务端用于权威验证。

村规引擎包装核心引擎：`applyActionWithHouseRules(state, action) => newState`。

### 服务端 (`packages/server`)

- **权威状态** — 客户端做乐观更新，服务端是唯一规则权威
- **游戏状态存 Redis** — 临时数据，1 小时 TTL，游戏结束后写入 PostgreSQL
- **回合计时** — 可配置（15/30/60 秒），超时自动摸牌跳过
- **掉线处理** — 60 秒重连窗口，超时后每 5 秒自动托管
- **频率限制** — 每个连接 20 条/秒
- **多标签页保护** — 新连接踢掉旧连接

### 客户端 (`packages/client`)

- **Zustand 状态管理** — auth、room、game、settings 四个 store
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
