# UNO Online — MCP 使用指南

UNO Online 提供 MCP (Model Context Protocol) 服务端，AI 客户端可以通过工具加入房间、执行游戏操作并查询状态。

## 准备 API Key

在个人资料页的 API Keys 区域创建一个 API Key。API Key 明文只会在创建时显示一次。

## 方式一：通过 npm 使用

```json
{
  "mcpServers": {
    "uno": {
      "command": "npx",
      "args": [
        "-y",
        "@uno-online/mcp",
        "--api-key",
        "uno_ak_your_key_here",
        "--server",
        "https://your-server.com"
      ]
    }
  }
}
```

## 方式二：从本地源码使用

```bash
git clone https://github.com/letsuno/uno-online.git ~/uno-online
cd ~/uno-online
pnpm install
```

```json
{
  "mcpServers": {
    "uno": {
      "command": "npx",
      "args": [
        "tsx",
        "~/uno-online/packages/mcp/src/index.ts",
        "--api-key",
        "uno_ak_your_key_here",
        "--server",
        "https://your-server.com"
      ]
    }
  }
}
```

## 方式三：环境变量

```bash
export UNO_API_KEY=uno_ak_your_key_here
export UNO_SERVER_URL=https://your-server.com
npx -y @uno-online/mcp
```

## 工具列表

| 分类 | 工具 |
|------|------|
| 房间管理 | `create_room`, `join_room`, `leave_room`, `ready`, `start_game`, `update_room_settings`, `dissolve_room`, `kick_player` |
| 游戏操作 | `play_card`, `draw_card`, `pass`, `call_uno`, `catch_uno`, `challenge`, `accept`, `choose_color`, `choose_swap_target`, `vote_next_round`, `rematch` |
| 查询 | `get_game_state`, `get_hand`, `get_room_info`, `get_rules` |

MCP 服务端会通过日志通道推送实时通知，例如轮到你出牌、游戏事件和状态变化。
