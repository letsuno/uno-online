# Changelog

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。

## [0.3.1] - 2026-05-07

### 新增
- 手牌少于 8 张时，在头像下方展示小卡牌背面图示代替数字显示
- 游戏日志改为最新记录在上方，新回合之间显示分割线标记

### 修复
- 修复出牌前喊 UNO 被出牌动作覆盖的 bug：出牌后剩 1 张牌时保留 `calledUno` 状态
- 修复跳过覆盖层仅检测 `skip` 卡的问题：现在 `draw_two` 和 2 人局 `reverse` 也会显示跳过效果
- 修复跳过覆盖层不会自动刷新的问题：下一个动作到来时自动清除，不再仅依赖固定超时
- 修复房间玩家重复显示的 bug：三层防御（store 层去重、事件层去重、客户端去重）
- 修复叠加村规下可用普通万能牌逃脱 +2/+4 惩罚的 bug：drawStack > 0 时只允许叠加牌打出

## [0.3.0] - 2026-05-07

### 新增

#### 管理后台
- 独立管理后台应用（`packages/admin`），支持用户管理、房间管理、数据统计
- 管理端 API 插件（`/admin/*`），包含 `adminOnly` 权限中间件
- 首个注册用户自动升级为管理员
- Dashboard 统计面板：总用户数、总游戏数、活跃房间数
- 用户管理：搜索、分页、角色修改
- 房间管理：查看活跃房间、强制解散

#### 用户角色系统
- 四级用户组：普通（白色/5s冷却）、会员（绿色/2s）、VIP（金色/1s）、管理员（红色/无限制）
- 角色颜色贯穿全局：游戏内昵称、聊天、房间列表、个人资料
- 基于角色的扔道具冷却时间差异化

#### 游戏体验
- 椭圆轨道高亮弧段 + 箭头指示出牌方向
- 牌堆下方回合指示器：显示当前操作玩家头像、昵称、倒计时
- 阶段感知提示文案：质疑+4、选色、交换等状态显示对应操作文字
- 摸牌动画方向修正：卡牌飞向实际摸牌玩家位置，而非固定向下
- PC 端右上角玩家列表面板：显示所有玩家状态、手牌数、在线状态
- 游戏日志可折叠/展开
- Google 风格四色头像边框

#### 托管模式增强
- 自动质疑 +4（`challenging` 阶段）
- 自动选色（选手牌最多的颜色）
- 自动选择交换对象（选手牌最多的玩家）

#### 主题系统
- 圆角/科技双风格主题，支持一键切换
- 主题感知的 CSS 变量（`--radius-btn`, `--radius-input`, `--radius-card-ui`, `--radius-panel-ui`）
- 科技风格额外边框发光效果
- 统一 Input 组件（cva 变体：default/ghost，尺寸：default/lg/sm）
- Button 组件新增 `ghost` 和 `outline` 变体

#### 构建信息
- 首页左下角显示版本号和构建日期
- 游戏 TopBar 显示版本号

#### 文档
- CLAUDE.md 项目总览
- 前端开发规范（目录结构、命名、组件、样式、状态管理）
- 后端开发规范（插件架构、路由、数据库、安全规范）
- 插件扩展规范（服务端/客户端模板、开发流程）
- 村规扩展指南（Rule 注册表模式、RuleDefinition 接口）

### 修复
- 修复 `/profile` 接口泄露 `passwordHash` 到客户端的安全漏洞
- 修复服务端测试文件 import 路径（适配插件目录结构）
- 修复 `chat:message` 字段命名：`username` 改为 `nickname`（语义一致）
- 修复质疑 +4 阶段回合指示器显示错误玩家（应显示 `pendingDrawPlayerId`）
- 修复 `choose_color` 进入 `challenging` 后计时器被停止的 bug
- 服务端超时兜底：质疑/选色/交换阶段超时自动执行默认操作，防止玩家离线卡死

### 重构
- **服务端插件架构**：Auth、Profile 迁移为 Fastify 插件；Room、Game、Voice、Interaction 模块移入 `plugins/core/` 目录
- **客户端 Feature 模块**：所有页面/组件/store 按功能域重组为 `features/`（auth、game、lobby、profile）+ `shared/`
- 创建 `PluginContext` 和 `plugin-loader` 基础设施
- 统一 `SocketData` 接口到 `ws/types.ts`
- 创建 `useEffectiveUserId` hook 消除 7 处重复的 `viewerId ?? authUserId` 模式
- 清理死代码：`shared-state.ts`、`createAuthHook`、`refreshGameStateTTL`、`cleanupRoomVoice`
- 移除不必要的 export、精简 `kv/index.ts` 重导出
- 删除废弃组件 `DirectionIndicator`、`OpponentRow`
- 删除死代码 `redis/client.ts`

## [0.2.0] - 2026-05-06

### 新增
- 用户名密码注册登录、昵称系统、头像上传
- 椭圆圆桌布局：玩家节点环绕排列，倒计时圆环
- 聊天气泡、快捷反应、快捷短语、扔道具互动
- 村规信息卡片、游戏日志面板
- 扑克风格卡角、扇形手牌布局、自动排序、发光条
- 扔道具事件和聊天频率限制
- 字体选择、卡面资源包加载
- 用户头像系统
- 房间重连和资源包支持
- 抽牌动画
- 自动托管（Bot）
- 头像缓存优化（ETag/304）
- 运行时配置（DEV_MODE、GitHub Client ID）

### 变更
- 迁移全部样式到 Tailwind CSS v4 统一暗色主题
- 移除 TypeScript import 中不必要的 `.js` 扩展名
- Redis 改为可选依赖
- 移除 Prisma，改用 Kysely + SQLite

### 修复
- 修复 UNO 游戏逻辑、状态同步与手牌显示问题
- 修复方向弧线 SVG 绘制重叠
- 修复卡角显示、手牌悬停动画
- 修复扔道具坐标计算（容器相对 → 视口坐标）
- 修复菜单被 overflow-hidden 裁剪（Portal 渲染）

## [0.1.0] - 2026-05-06

### 新增
- UNO Online 多人在线卡牌游戏初始版本
- React 客户端 + Node.js 服务端 + 共享游戏逻辑
- 开发模式：跳过 GitHub OAuth，仅用户名登录
- 服务端启动自动同步数据库表结构
- 登录重定向保持房间 URL
- 游戏交互打磨和 UX 反馈

### 修复
- 修复用户刷新页面丢失状态
- 修复游戏重连和出牌守卫
- 修复房间状态 bug：房主村规禁用、刷新丢失玩家
- 修复 Caddy 路由：区分 Auth API 和 SPA 回调页面

### 变更
- 默认全部部署使用 HTTPS
- 从 DOMAIN 推导 CLIENT_URL

### 基础设施
- 使用 Caddy 替换 nginx，支持自动 SSL
