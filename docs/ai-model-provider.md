# 社区 AI 插件接口

UNO Online 将 AI 分为两条互不覆盖的分支：

- **内建 AI**：项目随包发布的规则 Bot 与经过哈希封存的内建 ONNX RL 模型。
- **社区 AI 插件**：管理员安装的 `TypeScript` 策略，可选择携带自己的 ONNX 模型，也可只执行传统规则决策。

社区插件只在服务启动时发现、校验、编译和创建 ONNX 会话。运行中不会扫描目录或热加载代码。管理员可在 `/admin/ai-plugins` 独立启停已经加载的插件；新增、替换或删除插件文件后必须重启服务。每个 RL Bot 必须显式记录 `aiProviderId`，系统不提供默认引擎。

## 核心边界

服务器先使用正式规则引擎枚举当前决策的全部合法候选。插件可以依据其清单中声明的数据权限查看场内信息，并从候选中返回一个 `candidateId`。服务器会再次校验这个 ID、应用防循环保护、验证状态版本，然后执行对应动作。

因此插件可以实现公平 AI，也可以明确实现读取对手手牌或摸牌堆的“作弊难度”，但它始终不能绕过规则引擎执行非法操作。

社区插件是管理员审核的可信本地代码，拥有服务端进程权限。`dataAccess` 只用于能力和公平性标识。VM 负责限制动态代码生成和同步执行时间，不是安全沙箱。

## 目录结构

默认插件根目录为 `data/ai-plugins/`：

```text
data/ai-plugins/
└── community-example/
    ├── ai-plugin.json
    ├── strategy.ts
    └── model.onnx        # 可选
```

目录可通过 `UNO_AI_PLUGINS_DIR` 修改。每个一级子目录代表一个插件，清单文件固定命名为 `ai-plugin.json`。

使用仓库内的 Docker Compose 时，宿主机插件目录默认为 `data/ai-plugins/`，并只读挂载到容器的 `/ai/plugins`；启停状态写入宿主机 `data/ai-plugin-state/settings.json`。可分别通过 `UNO_AI_PLUGINS_HOST_DIR` 和 `UNO_AI_PLUGIN_STATE_HOST_DIR` 修改这两个宿主目录。Compose 会把插件超时和 ONNX 执行后端配置显式传入服务容器。

## `ai-plugin.json`

下面是同时使用 TypeScript 和 ONNX 的完整示例：

```json
{
  "pluginSchemaVersion": 1,
  "id": "community-example-v1",
  "displayName": "Community Example V1",
  "version": "1.0.0",
  "entry": "strategy.ts",
  "entrySha256": "strategy.ts 的小写 SHA-256",
  "featureSchema": "uno.rl.action-value.577.v1",
  "dataAccess": ["candidate-features", "public-state", "own-hand"],
  "onnx": {
    "modelFile": "model.onnx",
    "onnxSha256": "model.onnx 的小写 SHA-256"
  },
  "capabilities": {
    "minPlayers": 2,
    "maxPlayers": 10,
    "supportedHouseRules": "all"
  }
}
```

纯传统决策插件直接省略 `onnx`。文件名必须是插件目录内的单个本地文件名，不能使用绝对路径、子目录或 `..`。服务启动时会校验入口与 ONNX 的 SHA-256、编译策略并创建模型会话；社区模型没有宿主规定的输入名、输出名、特征数或张量形状。SHA-256 只验证文件与清单一致，不能证明作者或内容可信。

`featureSchema` 只声明宿主提供的候选特征版本，不是社区 ONNX 的输入协议。插件可以完全不用候选特征，也可以把已获授权的任意场内数据转换成自己的模型输入。

## 数据权限

插件必须在 `dataAccess` 中声明 TypeScript 策略需要读取的数据：

| 权限                 | 提供内容                                                         | 分级     |
| -------------------- | ---------------------------------------------------------------- | -------- |
| `candidate-features` | 每个合法候选的 577 维特征                                        | 公平     |
| `public-state`       | 阶段、轮次、完整弃牌堆历史、玩家手牌数、规则、罚牌状态等公开信息 | 公平     |
| `own-hand`           | 当前插件 Bot 的完整手牌                                          | 公平     |
| `opponent-hands`     | 所有对手的完整手牌                                               | 作弊     |
| `draw-piles`         | 左右摸牌堆的完整顺序                                             | 作弊     |
| `chat-history`       | 当前牌局聊天记录                                                 | 信息增强 |

候选 ID、规则先验分数和教师标记属于决策接口的基础数据。未声明 `candidate-features` 时，候选特征不会暴露给插件，ONNX 也没有绕过权限读取特征的内部通道。`prepareOnnx` 只能使用当前插件已经获准看到的上下文来构造张量。

只要声明了 `opponent-hands` 或 `draw-piles`，管理后台和房间模型列表就会把插件标记为“作弊信息”。声明 `chat-history` 会标记为“信息增强”。

## TypeScript 策略

入口必须默认导出一个带同步 `decide(context)` 方法的对象。携带 ONNX 时还必须提供同步 `prepareOnnx(context)`。不能导入运行时模块，也不能返回 Promise；ONNX Runtime 由插件引擎负责调用。

```ts
export default {
  prepareOnnx(context: any) {
    const inputName = context.onnx.model.inputs[0].name;
    const outputName = context.onnx.model.outputs[0].name;
    const featureCount = context.candidates[0].features.length;

    return {
      inputs: {
        [inputName]: {
          type: 'float32',
          dims: [context.candidates.length, featureCount],
          data: context.candidates.flatMap((candidate: any) => candidate.features),
        },
      },
      outputNames: [outputName],
    };
  },

  decide(context: any) {
    const outputName = context.onnx.model.outputs[0].name;
    const values = context.onnx.outputs[outputName].data;
    const bestIndex = values.indexOf(Math.max(...values));
    return context.candidates[bestIndex].id;
  },
};
```

上例只是一个 `[候选数, 特征数]` 模型的写法，不是引擎限制。插件可以使用多个输入、不同数据类型、固定或动态形状，并自由选择需要取回的输出。

`decide` 只接受候选 ID 字符串作为返回值。返回不存在的候选、超时、抛出异常或 ONNX 推理失败时，本次动作会回退到内建公平规则策略，不会中断牌局。

策略上下文的稳定字段为：

```ts
interface CommunityAiContext {
  decisionId: string;
  phase: string;
  playerCount: number;
  enabledHouseRules: string[];
  featureSchema: 'uno.rl.action-value.577.v1';
  deadlineMs: number;
  candidates: Array<{
    id: string;
    heuristicScore: number;
    teacherPreferred: boolean;
    features?: number[]; // 需要 candidate-features
  }>;
  arena?: {
    publicState?: object;
    ownHand?: object[];
    opponentHands?: Array<{ playerId: string; cards: object[] }>;
    drawPiles?: { left: object[]; right: object[] };
    chatHistory?: object[];
  };
  onnx?: {
    model: {
      inputs: OnnxValueMetadata[];
      outputs: OnnxValueMetadata[];
    };
    // prepareOnnx 阶段不存在；decide 阶段提供本次推理的原始输出。
    outputs?: Record<string, OnnxTensor>;
  };
}

interface OnnxValueMetadata {
  name: string;
  type: OnnxTensorType;
  shape: Array<number | string>; // 可包含 ONNX 的符号维度
}

interface OnnxTensor {
  type: OnnxTensorType;
  dims: number[];
  data: Array<number | string | boolean>;
}

type OnnxTensorType =
  | 'float32'
  | 'float64'
  | 'float16'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'int4'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'uint4'
  | 'bool'
  | 'string';
```

## ONNX 协议

社区 ONNX 没有统一形状协议。插件引擎只提供四项能力：

1. 启动时校验模型哈希并创建 ONNX Runtime 会话。
2. 把模型的真实输入/输出名称、类型和声明形状放入 `context.onnx.model`。
3. 执行 `prepareOnnx(context)` 返回的张量。
4. 把原始输出张量放入 `context.onnx.outputs`，再调用 `decide(context)`。

`prepareOnnx` 返回值为：

```ts
interface PrepareOnnxResult {
  inputs: Record<string, OnnxTensor>;
  outputNames?: string[]; // 省略时取回模型的全部输出
}
```

输入名必须来自当前模型，且必须提供模型要求的全部输入；输出名同样由模型决定。`dims` 必须是非负整数、与 `data` 长度一致并满足下述资源护栏，之后由 ONNX Runtime 按模型自身协议检查。宿主不再假设 `features`、`values`、577 维、候选批量或“一候选一分数”。

`int64`/`uint64` 可用十进制字符串或安全整数作为输入，输出统一为十进制字符串。`float16` 的 `data` 使用 uint16 位模式，`int4`/`uint4` 使用 ONNX Runtime 的压缩字节表示；其余数值类型使用普通有限数字。

引擎不解释输出与候选动作之间的关系。分类、排序、掩码、多头输出、规则融合和最终候选选择全部属于插件自己的 `decide` 逻辑。宿主只在最后验证返回值确实是当前合法候选。

为避免可信插件的配置错误拖垮服务，宿主设置以下固定资源护栏：TypeScript 入口最大 512 KiB、ONNX 文件最大 256 MiB、单张量最多 800 万个元素且不超过 64 MiB、单次推理的输入与输出分别最多 64 MiB、VM 单阶段输入或返回消息最多 32 MiB。这些限制用于故障保护，不构成不可信代码隔离。

## 管理与选择

- 停用只阻止新决策选用插件，不卸载或重新执行 TypeScript。
- 新建 AI Bot 使用 `room:add_bot` 的 `{ difficulty: 'rl', aiProviderId }` 分支；现有 Bot 使用 `room:set_bot_ai` 选择一个已启用且适配当前人数与村规的插件。普通人机请求不能携带 `aiProviderId`。
- `room:list_ai_providers` 使用 `{ intent: 'add' | 'switch' }` 区分新增 Bot 与切换现有 Bot，只返回已启用且适配对应人数和当前村规的内建 AI 与社区插件。
- 显式选择的插件被停用或单次执行失败时，该回合使用公平规则策略，避免牌局被插件异常卡死；新建 RL Bot 未提供 `aiProviderId` 会直接被拒绝。

## 配置项

| 环境变量                       |                         默认值 | 说明                                |
| ------------------------------ | -----------------------------: | ----------------------------------- |
| `UNO_AI_PLUGINS_DIR`           |              `data/ai-plugins` | 社区插件根目录                      |
| `UNO_AI_PLUGIN_SETTINGS_FILE`  | `data/ai-plugin-settings.json` | 管理状态持久化文件                  |
| `UNO_AI_DECISION_TIMEOUT_MS`   |                         `1500` | 单次完整插件决策上限（毫秒）        |
| `UNO_RL_ONNX_EP`               |                          `cpu` | `cpu`、`cuda` 或 `dml`              |
| `UNO_AI_PLUGINS_HOST_DIR`      |            `./data/ai-plugins` | Docker Compose 的宿主机插件目录     |
| `UNO_AI_PLUGIN_STATE_HOST_DIR` |       `./data/ai-plugin-state` | Docker Compose 的宿主机管理状态目录 |
