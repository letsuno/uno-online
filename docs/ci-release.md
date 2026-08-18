# GitHub CI 与自动发版

## 工作流

### CI

`.github/workflows/ci.yml` 在以下情况运行：

- Pull Request
- push 到 `main`
- GitHub UI 手动触发

它包含两个必须同时通过的 job：

- `Validate`：冻结锁文件安装、发布元数据校验、shared 构建、server 类型检查、client 构建、全仓测试和全仓构建
- `Docker targets`：实际构建 `Dockerfile` 的 `server` 与 `caddy` target，但不推送

所有外部 Action 都固定到完整 commit SHA；Dependabot 每周检查 `.github` Action 更新。

### Release

`.github/workflows/release.yml` 通常由 `v*.*.*` Tag push 触发；已有 Tag 的故障恢复也可从 GitHub UI 或
`gh workflow run` 手动触发。无论触发方式如何，工作流都只检出现有 Tag，并执行相同的 Tag/main/版本校验。工作流会：

1. 确认 Tag 指向 `origin/main` 可达的提交。
2. 确认 Tag、根版本、六个 workspace 版本一致。
3. 确认 CHANGELOG 与客户端 changelog 包含该版本。
4. 使用冻结锁文件重新执行 build、test 和 MCP pack 预检。
5. 构建并推送 Docker Hub：
   - `djkcyl/uno-online-server:v<版本号>`
   - `djkcyl/uno-online-caddy:v<版本号>`
   - 稳定版本同时更新两个镜像的 `latest`
   - `*-beta.N` 版本同时更新两个镜像的 `beta`，但不更新 `latest`
6. 通过 npm Trusted Publishing（OIDC）发布 `@uno-online/mcp@<版本号>`。
7. 从 CHANGELOG 生成或更新 GitHub Release。

预发布 Tag（例如 `v1.2.0-beta.0`）会创建 GitHub prerelease，更新 Docker `beta` 但不更新 Docker
`latest`；npm 包使用预发布标识的第一个字段作为 dist-tag，例如 `0.15.0-beta.0` 发布到 `beta`，不会覆盖
`latest`。
工作流不发布 `mumble-gateway`，也不连接或重启生产服务器。

生产 Komodo 每天 03:00 检查当前选择的镜像通道，并自动更新 UNO 的 `server` 与 `caddy`。因此“GitHub
workflow 不直接部署”不等于“生产永远需要手工部署”：兼容版本会在制品发布后由 Komodo 的下一次检查接管；
需要立即上线时可在 Komodo 中手动 Check/Deploy。Beta 制品只有在 Stack 已切到 `beta` 时才会自动上线。
破坏性发布必须在推送会移动当前镜像通道的版本 Tag 之前关闭 Stack Auto Update，具体操作见
[部署文档](deployment.md)。

## 一次性配置

### Docker Hub

在 GitHub 仓库 `Settings → Environments → release → Environment secrets` 添加：

- `DOCKERHUB_USERNAME`：对 `djkcyl/uno-online-server` 和 `djkcyl/uno-online-caddy` 有 push 权限的账号
- `DOCKERHUB_TOKEN`：Docker Hub access token，不要保存账号密码

Release job 绑定 `release` Environment，因此当前统一使用 Environment secrets，不需要再创建同名的仓库级
Actions secrets。

### npm Trusted Publisher

在 npm 的 `@uno-online/mcp` 包设置中添加 GitHub Actions Trusted Publisher：

- GitHub organization/user：`letsuno`
- Repository：`uno-online`
- Workflow filename：`release.yml`
- Environment：`release`

工作流使用 Node 22 和固定的 npm 11.19.0，并请求 `id-token: write`。不需要、也不应创建长期
`NPM_TOKEN`。

### GitHub Environment

在仓库 `Settings → Environments` 创建 `release`。可按需要添加 required reviewer；如果添加，Tag 发版会在
发布前等待审批。npm Trusted Publisher 的 Environment 必须与 workflow 中的 `release` 完全一致。

### main 保护

在 `Settings → Rules → Rulesets` 中为 `main` 启用分支规则，要求 PR，并把以下检查设为 required：

- `Validate`
- `Docker targets`

不要把 `Release` 设为 main 合并检查；它只在 Tag 上运行。

## 发版

版本号、CHANGELOG、客户端 changelog 和兼容性判断应先通过 PR 合并。合并后同步 main：

### Beta 迭代

Beta 版本使用 `X.Y.Z-beta.N`。每次发布前比较上一个 Beta Tag 到当前分支，只为本次 Beta 增量编写
`CHANGELOG.md` 和客户端 changelog。客户端可以在测试期间显示 Beta 条目；Beta Tag 会更新 Docker 与 npm 的
`beta` 通道，不更新 `latest`。

### Beta 转正式版

正式版说明不能只汇总“最后一个 Beta 之后”的提交。准备 `X.Y.Z` 时先执行：

```bash
git fetch --tags --prune
pnpm release:stable-diff
```

命令自动找到 `HEAD` 可达的上一个正式 `vX.Y.Z` Tag，并输出该 Tag 到 `HEAD` 的提交记录、
`git diff --stat` 和文件变更清单。根据这个完整范围编写正式版 `CHANGELOG.md`。

客户端 changelog 的处理不同：删除同一版本的全部 `X.Y.Z-beta.N` 条目，再在数组顶部添加唯一的 `X.Y.Z`
正式版条目。因此 Beta 日志只在 Beta 测试期间展示，正式发布后前端只显示汇总后的正式版日志。正式
`CHANGELOG.md` 保留历史 Beta 段落，因为它们已经用于对应的 GitHub prerelease。

`pnpm release:check` 会强制客户端首条 changelog 等于当前包版本，并在正式版中拒绝同版本的预发布条目。

### 合并与 Tag

```bash
git fetch --prune origin
git switch main
git pull --ff-only
git tag -a v<版本号> -m "release: v<版本号>"
git push origin v<版本号>
```

Tag push 后在 GitHub Actions 等待 `Release / Publish release` 全部完成。状态兼容发布可等待 Komodo 下次自动
更新，或在面板中立即部署；破坏性发布按[部署文档](deployment.md)中的维护窗口流程手动执行。

## 失败与重试

- 不要移动或复用已经发布的 Tag；代码变更应使用新版本。
- 同一 workflow 可以安全 rerun：已存在的 MCP 版本会跳过 npm publish，GitHub Release 会更新正文。
- Docker 发布失败时可 rerun；相同版本 Tag 始终从同一 Git 提交重新构建。
- 如果 Tag/版本/changelog 校验失败，删除尚未产生任何制品的错误 Tag，修正版本 PR 后创建正确的新 Tag。
- 如果已经有任一制品成功发布，不要删除或移动 Tag。若只需修复发布工作流而制品源码不变，先通过 PR 修复
  `release.yml`，再从默认分支针对原 Tag 执行恢复发布：

  ```bash
  gh workflow run release.yml --ref main -f tag=v<版本号>
  ```

  手动运行仍会检出原 Tag 并执行完整校验；已有 npm 版本会跳过，Docker 镜像从同一 Tag 重建，GitHub Release
  会创建或更新。若必须修改制品源码，则发布新的版本，不能复用原版本号。
