# 玩家操作菜单设计

在房间大厅（waiting 阶段）为玩家列表添加交互菜单，支持移交房主、踢出房间、强制静音、调整本地音量。

## 交互方式

点击玩家行弹出 Popover 浮层。点击自己不触发。点击外部区域关闭。菜单项根据当前用户身份（房主/普通玩家）和目标玩家状态动态显示。

## 菜单项

| 操作 | 可见条件 | 说明 |
|------|---------|------|
| 移交房主 | 仅房主，仅 waiting 状态 | 将房主身份转交给目标玩家 |
| 踢出房间 | 仅房主，仅 waiting 状态 | 将目标玩家移出房间 |
| 强制静音/解除静音 | 仅房主 | 服务端强制禁麦，目标玩家无法自行解除；再次点击解除 |
| 调整音量 | 所有人（目标在语音中时） | 本地音量滑块 0-100，仅影响自己听到的音量 |

## Socket 事件

### 新增 Client → Server 事件

**`room:transfer_owner`** `{ targetId: string }`
- 校验：调用者是房主、房间处于 waiting 状态、目标在房间内且不是自己
- 处理：调用 `setRoomOwner(kv, roomCode, targetId)`，广播 `room:updated`

**`room:kick`** `{ targetId: string }`
- 校验：调用者是房主、房间处于 waiting 状态、目标不是自己
- 处理：移除目标玩家、向目标发送 `room:kicked`、广播 `room:updated`
- 复用已有 `room:kicked` 服务端→客户端事件（`{ reason: string }`）

**`voice:force_mute`** `{ targetId: string, muted: boolean }`
- 校验：调用者是房主、目标在房间内
- 处理：在 voice presence 中设置目标的 `forceMuted` 状态，广播更新的 presence

### 新增 Server → Client 事件

无需新增。`room:updated` 和 `voice:presence` 已足够覆盖所有状态变更通知。被踢玩家复用已有的 `room:kicked` 事件。

## 服务端改动

### voice-presence.ts

`VoicePresence` 接口新增 `forceMuted: boolean` 字段。

新增 `setForceMuted(io, roomCode, targetUserId, muted)` 函数：
- 设置目标用户的 `forceMuted` 状态
- 如果 `muted = true`，同时强制将 `micEnabled` 覆盖为 `false`
- 广播更新后的 presence

修改 `sanitizePresence`：`forceMuted` 字段由服务端控制，不接受客户端上报。

修改 presence 上报处理：如果用户当前被 `forceMuted`，拒绝将 `micEnabled` 设为 `true`，服务端强制覆盖。

### room-events.ts

新增 `room:transfer_owner` 处理器：
1. 校验房主身份、waiting 状态、目标有效性
2. 调用 `setRoomOwner`
3. 广播 `room:updated`

新增 `room:kick` 处理器：
1. 校验房主身份、waiting 状态、不能踢自己
2. 调用 `roomManager.leaveRoom(roomCode, targetId)`
3. 清理目标的 voice presence
4. 向目标 socket 发送 `room:kicked` 并强制离开 socket room
5. 广播 `room:updated`

新增 `voice:force_mute` 处理器：
1. 校验房主身份、目标在房间内
2. 调用 `setForceMuted`

## 客户端改动

### 新组件 `PlayerActionMenu`

位置：`packages/client/src/features/game/components/PlayerActionMenu.tsx`

Props：
- `targetPlayer`: 目标玩家信息
- `isOwner`: 当前用户是否房主
- `roomStatus`: 房间状态
- `position`: 弹出位置（基于点击事件坐标）
- `onClose`: 关闭回调

渲染逻辑：
- 根据 `isOwner` 和 `roomStatus` 动态显示菜单项
- 移交房主、踢出房间：点击后二次确认（`window.confirm`）再发送 socket 事件
- 强制静音：读取 voice presence 中目标的 `forceMuted` 状态，显示"强制静音"或"解除静音"
- 调整音量：内嵌 range 滑块，值变更时调用 voice engine 设置对应 peer 的播放音量

### RoomPage.tsx 改动

- 玩家行添加 `onClick` 处理器（点击自己不触发）
- 维护 `selectedPlayer` 和菜单位置 state
- 渲染 `PlayerActionMenu` 组件

### 语音强制静音客户端执行

**被静音者视角：**
- 监听 `voice:presence` 广播，检测自己的 `forceMuted` 状态
- `forceMuted = true` 时：禁用麦克风、禁用麦克风按钮（灰色不可点击）、显示"已被房主静音"提示
- `forceMuted = false` 时：恢复正常控制

**其他玩家视角（接收端过滤）：**
- 播放语音帧时，检查发送者在 presence 中的 `forceMuted` 状态
- 如果 `forceMuted = true`，丢弃该用户的音频帧，不播放
- 这是防绕过的关键：即使被静音者 hack 客户端继续发音频，其他人不会听到

### 音量调节

复用 VoicePanel 中已有的 `peerVolumes` 逻辑。需要解决 Mumble userId 和游戏 userId 的映射：
- voice presence 广播中已包含游戏 userId
- Mumble usersById 中有 Mumble userId 和 username
- 通过 username（由 nickname 转换）建立映射

## 安全约束

- 所有权限校验在服务端完成，客户端 UI 隐藏仅为体验优化
- 强制静音双重保障：服务端拦截 presence 上报 + 接收端丢弃音频帧
- 踢人和移交房主需要 waiting 状态，防止游戏进行中滥用
- 强制静音不限制房间状态，游戏中也可使用
