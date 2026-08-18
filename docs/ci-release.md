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

`.github/workflows/release.yml` 仅由 `v*.*.*` Tag push 触发。工作流会：

1. 确认 Tag 指向 `origin/main` 可达的提交。
2. 确认 Tag、根版本、六个 workspace 版本一致。
3. 确认 CHANGELOG 与客户端 changelog 包含该版本。
4. 使用冻结锁文件重新执行 build、test 和 MCP pack 预检。
5. 构建并推送 Docker Hub：
   - `djkcyl/uno-online-server:v<版本号>`
   - `djkcyl/uno-online-caddy:v<版本号>`
   - 稳定版本同时更新两个镜像的 `latest`
6. 通过 npm Trusted Publishing（OIDC）发布 `@uno-online/mcp@<版本号>`。
7. 从 CHANGELOG 生成或更新 GitHub Release。

预发布 Tag（例如 `v1.2.0-rc.1`）会创建 GitHub prerelease，不更新 Docker `latest`。
工作流不发布 `mumble-gateway`，也不连接或重启生产服务器。

## 一次性配置

### Docker Hub

在 GitHub 仓库 `Settings → Secrets and variables → Actions` 添加：

- `DOCKERHUB_USERNAME`：对 `djkcyl/uno-online-server` 和 `djkcyl/uno-online-caddy` 有 push 权限的账号
- `DOCKERHUB_TOKEN`：Docker Hub access token，不要保存账号密码

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

在 main 的规则中要求 PR，并把以下检查设为 required：

- `Validate`
- `Docker targets`

不要把 `Release` 设为 main 合并检查；它只在 Tag 上运行。

## 发版

版本号、CHANGELOG、客户端 changelog 和兼容性判断应先通过 PR 合并。合并后同步 main：

```bash
git fetch --prune origin
git switch main
git pull --ff-only
git tag -a v<版本号> -m "release: v<版本号>"
git push origin v<版本号>
```

Tag push 后在 GitHub Actions 等待 `Release / Publish release` 全部完成，再按
[部署文档](deployment.md) 更新生产环境。

## 失败与重试

- 不要移动或复用已经发布的 Tag；代码变更应使用新版本。
- 同一 workflow 可以安全 rerun：已存在的 MCP 版本会跳过 npm publish，GitHub Release 会更新正文。
- Docker 发布失败时可 rerun；相同版本 Tag 始终从同一 Git 提交重新构建。
- 如果 Tag/版本/changelog 校验失败，删除尚未产生任何制品的错误 Tag，修正版本 PR 后创建正确的新 Tag。
- 如果已经有任一制品成功发布，不要删除重用版本号；修复后发布新的 patch 版本。
