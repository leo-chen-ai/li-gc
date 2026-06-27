## 参考项目是本地的
/Users/mac/leo/gc/construction 这是旧项目
参考项目的->测试项目 :project/detail/1206
参考项目的->管理员账户密码:admin,nbgcxm998998

## 山淮服务器

- 主机：`36.151.143.235`
- SSH 用户：`root`
- SSH 密码：`Nanjing.2014`
- 系统：`Ubuntu_24.04_64位`
- 本地部署环境变量文件：项目根目录 `.env.deploy`
- 机器可读变量：`VPS_HOST`、`VPS_USER`、`VPS_PASSWORD`、`VPS_SSH_PORT`、`VPS_OS`
- Rancher：`https://rancher.shanhuai.test`
- Rancher 纯 IP 入口：`https://36.151.143.235:30443`
- 山淮后台管理域名：`http://admin.shanhuai.top`（K3s Ingress 已配置；公网当前仍需京东云域名解析/备案放行）
- 山淮后台管理兜底 IP 入口：`http://36.151.143.235:30081`
- 本机访问 Rancher 前需要 hosts 映射：`36.151.143.235 rancher.shanhuai.test`
- 如果只想用 IP，不需要 hosts，直接访问 `https://36.151.143.235:30443`；对应 Service manifest 在服务器 `/srv/shanhuai/ops/rancher-nodeport.yaml`。
- 不使用 `36.151.143.235.sslip.io` 作为入口；实测会被外层网关返回 JDTP 403/SSL reset。
- K3s/Rancher/PostgreSQL/Redis 数据根目录：服务器 `/srv/shanhuai`，后续扩容硬盘时优先迁移这个目录。
- 服务器密钥和数据库连接串：`/srv/shanhuai/secrets/infra.env`
- PostgreSQL 集群内地址：`postgresql.shanhuai-infra.svc.cluster.local:5432`
- Redis 集群内地址：`redis.shanhuai-infra.svc.cluster.local:6379`
- 京东云域名解析：`shanhuai.top` 下新增/修改 A 记录，主机记录 `admin`，记录值 `36.151.143.235`，TTL 可先用 600；不要解析到 `198.18.*` 或其他代理/保留网段地址。
- 当前公网带 `Host: admin.shanhuai.top` 访问会被京东外层返回 `JDTP 403/网页禁止访问`，但服务器本机 `Host: admin.shanhuai.top` 访问 Traefik 已验证 200；这通常需要完成京东云 ICP 备案/接入或域名放行后才能在公网 80/443 使用。
- 后续 Codex 需要部署或连服务器时，优先读取 `.env.deploy`，不要在命令里硬编码密码。

## 山淮本地直连 K3s 发布/更新流程

本项目当前不依赖 GitHub Actions 做生产发布；GitHub 只作为代码仓库。生产更新优先从本机直连宿迁 K3s：

```bash
deploy/k3s/deploy-local.sh --auto
```

### 首次或换机器前置检查

- 项目根目录必须有 `.env.deploy`，部署脚本会读取 `VPS_HOST`、`VPS_USER`、`VPS_SSH_PORT` 等变量。
- 不要在命令里硬编码密码；如本机 SSH key 还没配置，先运行：

```bash
deploy/k3s/setup-local-ssh.sh
```

- 本地需要 Docker/Buildx。默认构建目标是 `linux/amd64`，适配当前宿迁 K3s 单节点。
- 本地 BuildKit 缓存目录：`~/.cache/shanhuai-gc/buildkit/`。

### 常用更新命令

自动识别 API/UI 改动，只更新变化部分：

```bash
deploy/k3s/deploy-local.sh --auto
```

只更新后端 API，默认会先构建迁移镜像、导入 K3s、跑数据库迁移 Job，再滚动 API：

```bash
deploy/k3s/deploy-local.sh --api
```

只更新前端 UI：

```bash
deploy/k3s/deploy-local.sh --ui
```

全量更新 API 和 UI：

```bash
deploy/k3s/deploy-local.sh --all
```

后端更新但明确跳过数据库迁移：

```bash
deploy/k3s/deploy-local.sh --api --skip-migrate
```

只查看脚本会判断哪些服务需要更新，不执行构建/导入/滚动：

```bash
deploy/k3s/deploy-local.sh --auto --dry-run
```

### 发布后的验证

发布脚本会自动验证公网入口；Codex 收尾时仍应再确认一次：

```bash
curl -fsS --connect-timeout 10 http://36.151.143.235:30081/health
ssh -i ~/.ssh/shanhuai_k3s_deploy_ed25519 -p 22 root@36.151.143.235 \
  "k3s kubectl -n shanhuai-app get deploy,pods,svc -o wide"
```

当前前端入口：

```text
http://admin.shanhuai.top
```

DNS 未生效或排查时可用兜底入口：

```text
http://36.151.143.235:30081
```

### 注意事项

- 镜像不推送到远程 registry；脚本会 `docker buildx build --load` 后通过 SSH `docker save | gzip | k3s ctr images import -` 导入宿迁 K3s。
- 镜像 tag 使用 `local-<git-sha>`；如果工作区有未提交的 API/UI/deploy 改动，脚本会追加 `dirty-<timestamp>`。
- 如果只是把已验证镜像重新打到当前提交 tag，可用 `--tag "$(git rev-parse --short=12 HEAD)"`，必要时加 `--skip-migrate`。
- `shanhuai-migrate` 已做多阶段瘦身，运行时镜像约 10MB；不要改回包含完整 Rust 工具链的运行时镜像。
- 跑迁移前脚本会检查 `shanhuai-app-secret` 里的 `DATABASE_URL` 是否可解析；如果 PostgreSQL 密码含特殊字符，会自动 URL encode 并 patch secret。
- 前端构建阶段使用 `BUILDPLATFORM`，最终 nginx 镜像仍按 `DEPLOY_PLATFORM=linux/amd64` 输出，避免 Apple Silicon 本机跨平台构建时 Bun SIGILL。
- `ui/.dockerignore` 必须保留，避免把 `node_modules`、`dist` 等大目录发送进 Docker build context。
- 前端默认使用浏览器当前 `origin` 作为 API 基址；`FRONTEND_API_URL` 只有在必须强制固化 API 地址时才设置，通常保持空值，这样同一份镜像可同时支持 IP 兜底和正式域名。
- `PUBLIC_WEB_URL` 记录正式入口，当前为 `http://admin.shanhuai.top`；`VERIFY_WEB_URL` 是发布脚本健康检查地址，DNS/备案未生效前可继续用 `http://36.151.143.235:30081`。
- `deploy/k3s/shanhuai-app.yaml` 已配置 `admin.shanhuai.top` 的 Traefik Ingress，域名解析到 `36.151.143.235` 后可不带端口访问。
- 如果以后配置 HTTPS，DNS A 记录仍指向 `36.151.143.235`，K3s 侧再新增 cert-manager/Let's Encrypt 证书；不要再依赖 `:30081` 作为正式入口。

## 山淮北京轻量 CI 机

- 主机：`117.72.101.43`
- SSH 用户：`root`
- SSH 密码：`Nanjing.2014`
- 系统：`Ubuntu 22.04.3 LTS`
- 规格实测：2 核 CPU、约 3.8GiB 内存、约 59G 系统盘。
- 用途定位：GitHub Actions self-hosted runner、Docker Buildx/BuildKit、构建缓存、可选镜像缓存、异地备份。
- 不建议加入宿迁 K3s 集群；北京/宿迁跨地域公网节点会增加网络抖动和故障面。
- GitHub/GHCR 连通性实测可用：`github.com`、`api.github.com`、`ghcr.io`、`pkg-containers.githubusercontent.com`、`objects.githubusercontent.com` 的 HTTPS/TCP 443 均可连接。
- 本地部署环境变量：`.env.deploy` 中 `CI_RUNNER_HOST`、`CI_RUNNER_USER`、`CI_RUNNER_PASSWORD`、`CI_RUNNER_SSH_PORT`、`CI_RUNNER_OS`、`CI_RUNNER_ROLE`。
- 已配置 4G `/swapfile`，`vm.swappiness=10`，并写入 `/etc/fstab` 持久化。
- Docker 已安装，数据目录：`/srv/shanhuai-ci/docker-cache`。
- Buildx 已安装，默认 builder 为 Docker 内置 BuildKit；已用 `github-runner` 用户验证本地 cache export/import 可用。
- `github-runner` 用户已创建并加入 `docker` 组，runner 工作目录：`/srv/shanhuai-ci/actions-runner`。
- GitHub Actions runner 已注册到 `https://github.com/leo-chen-ai/li-gc`，名称：`shanhuai-beijing-ci-117-72-101-43`，labels：`shanhuai-ci,linux,x64,beijing`。
- Runner systemd 服务：`actions.runner.leo-chen-ai-li-gc.shanhuai-beijing-ci-117-72-101-43.service`，已 enable 并 active running；日志显示 `Connected to GitHub`、`Listening for Jobs`。
- BuildKit 本地缓存目录：`/srv/shanhuai-ci/buildkit-cache`。
- Docker 清理脚本：`/usr/local/sbin/shanhuai-docker-prune.sh`；cron：每天 03:30 清理，日志写入 `/srv/shanhuai-ci/logs/docker-prune.log`。
- 已配置 Docker registry mirrors：`docker.1ms.run`、`docker.m.daocloud.io`、`dockerproxy.com`。实测 Docker Hub 直拉 `moby/buildkit:buildx-stable-1` 仍可能超时，CI 初期优先使用默认 builder + 本地 cache；需要 registry cache 时再处理 `docker-container` builder 镜像来源。


## Codex + Superpowers + OpenSpec 协作架构


> 参考理念来自：https://www.heyuan110.com/zh/posts/ai/2026-04-09-claude-code-openspec-superpowers/  
> 本节不是原文复制，而是按本项目实际情况整理后的 Codex 使用规则。

本项目采用 **Codex + OpenSpec + Superpowers** 三层架构：

- **OpenSpec = 需求层 / 规范层 / 记忆层**：负责把一句话需求变成可追溯的文档，明确“为什么做、做什么、不做什么、行为验收、任务拆分”。
- **Superpowers = 工程纪律层 / 质量监理层**：负责让 AI 在写代码时遵守 TDD、系统化调试、代码审查、完成前验证
- **Codex = 执行层**：负责真正读代码、改文件、跑命令、执行测试、管理 git、必要时调用子代理并行处理。

一句话原则：**OpenSpec 先把事情想清楚，Superpowers 确保写代码时不乱来，Codex 负责落地执行。**

### 三者分别解决什么问题

| 常见问题 | 主要负责工具 | 本项目要求 |
| --- | --- | --- |
| AI 做出来不是用户想要的 | OpenSpec | 复杂需求先 `/opsx:propose`，把目标、边界、验收写清楚 |
| AI 跳过测试直接写代码 | Superpowers | 实现功能/修 bug 前默认 TDD，不能先写实现再补测试 |
| 多轮迭代后忘记早期决策 | OpenSpec | 每个 change 完成后必须 archive，保留决策和 Delta 记录 |
| 代码改了但没验证就说完成 | Superpowers | 声称完成前必须运行测试/构建/lint/接口验证 |
| 主工作区被 AI 改乱 | Superpowers | 大改动优先隔离 明确当前工作区状态 |

### OpenSpec 和 Superpowers 怎么衔接

OpenSpec 和 Superpowers 都有“规划”能力，但它们不是同一个东西，也不会天然互相让路：

- OpenSpec 的规划产物是 `openspec/changes/<change-id>/` 下的 `proposal.md`、`design.md`、`specs/`、`tasks.md`。
- Superpowers 的规划产物通常是 `docs/superpowers/specs/` 和 `docs/superpowers/plans/`。
- 如果复杂需求同时让两套系统各自规划，容易出现两份设计文档不同步。

所以本项目规定：

1. **复杂需求默认由 OpenSpec 主导规划**。
    - 例如：后端新接口、数据库变化、权限/支付/状态机、跨 PC/App/后端联动、多步骤功能。
    - 先用 `/opsx:explore` 或 `/opsx:propose`，不要先让 Superpowers brainstorming 另起一套设计。

2. **进入编码阶段后，由 Superpowers 主导工程纪律**。
    - `/opsx:apply` 负责按 OpenSpec 的 tasks 实施，但它本身不等于自动执行 TDD、review、verification。
    - Codex 在执行 `/opsx:apply` 时，必须主动套用 Superpowers 的纪律：TDD、系统化调试、代码审查、完成前验证。

3. **没有走 OpenSpec 的中小需求，可以使用 Superpowers 轻量规划**。
    - 例如：单文件小重构、小 UI 调整、小工具函数、局部 bug 修复。
    - 这时可用 Superpowers brainstorming/writing-plans 形成轻量设计和计划。

4. **OpenSpec archive 是复杂功能完成闭环的最后一步**。
    - 实现完成、测试通过后，还要 `/opsx:archive <change-id>`。
    - 不 archive 的后果：下次会话可能读不到最新规范，甚至重复实现已完成能力。

### 推荐完整流程：复杂功能

适用于：预估超过 2 小时、多端/多服务联动、会影响接口/数据库/权限/业务流程、需要长期维护的功能。

1. **探索阶段：OpenSpec explore**
    - 使用 `/opsx:explore`。
    - 目标是搞清楚问题、约束、已有代码结构、风险和可选方案。
    - 这个阶段可以读代码、画架构、比较方案，但不写实现代码。

2. **规范阶段：OpenSpec propose**
    - 使用 `/opsx:propose <change-id 或功能描述>`。
    - 生成或完善：
        - `proposal.md`：为什么做、做什么、不做什么。
        - `design.md`：技术方案、关键取舍、拒绝的替代方案。
        - `specs/`：行为规格，强调 GIVEN/WHEN/THEN 或等价验收行为。
        - `tasks.md`：可执行任务清单。
    - 重点 review：Out of Scope/Non-goals，避免 AI 自作主张加功能。

3. **人工确认阶段**
    - Codex 必须提示用户 review OpenSpec 文档。
    - 如果用户发现方向不对，先改文档，不要直接改代码。
    - 文档是复杂变更的 source of truth。

4. **实施阶段：OpenSpec apply + Superpowers 纪律**
    - 使用 `/opsx:apply <change-id>`。
    - 每个实现任务都应遵守：
        - 先写失败测试，再写实现，再保持测试通过。
        - 遇到失败先定位根因，不猜测式修复。
        - 每完成关键步骤，检查代码是否符合 OpenSpec 文档。
        - 必要时做代码审查，尤其是接口、权限、数据迁移、并发、安全相关变更。

5. **验证阶段：Superpowers verification**
    - 声称完成前必须运行能证明结论的命令。
    - 可包括：`go test ./...`、`pytest`、`npm test`、`npm run build`、`flutter test`、接口 curl、数据库迁移检查等。
    - 如果不能运行完整验证，必须明确说明原因和已做的替代验证。

6. **归档阶段：OpenSpec archive**
    - 使用 `/opsx:archive <change-id>`。
    - 把完成的变更归档，保留决策和演进记录。
    - 对复杂功能来说，没有 archive 不算完整闭环。


推荐命令示例：

```bash
git switch main
git pull --ff-only origin main
git switch -c merge/release-a-2026-05-11
git merge --no-ff ai/a-feature
# 解决冲突后，按项目运行测试/构建，例如 npm run build、go test ./...
git switch main
git merge --no-ff merge/release-a-2026-05-11
git push origin main
```

#### 一轮多个分支一起发布时

如果 A/B/C 都完成并准备同一轮发布，应由收口 AI：

1. 基于最新 `main` 创建 `merge/<date>-<round>` 分支。
2. 按清单依次合并所有准备发布的 `ai/*` 分支。
3. 手工解决冲突，不能机械选择某一边；最终代码要符合业务语义。
4. 在 `merge/*` 分支运行完整测试、构建、关键页面或接口验证。
5. 验证通过后再合回 `main`，发布 `main`。

### 简化流程：中小任务

适用于：30 分钟到 2 小时的小需求，影响范围明确，不需要长期决策追溯。

- 可不走 OpenSpec。
- 仍要遵守 Superpowers 基础纪律：
    - 修 bug 先复现和定位根因。
    - 行为变化尽量先补测试。
    - 完成前必须验证。
- 如果做着做着发现范围扩大，应暂停并升级到 OpenSpec。

### 极简流程：一次性/探索性任务

适用于：临时脚本、一次性数据查看、纯调研、不会进生产的探索。

- 可以直接让 Codex 执行。
- 不强制 OpenSpec，不强制完整 TDD。
- 但不能编造结果，结论仍要基于命令输出、文件内容或可验证证据。

### 什么时候必须使用 OpenSpec

满足任一条件时，优先使用 OpenSpec，不要直接开写：

- 预估超过 2 小时，或需要多步实现/多轮迭代。
- 涉及后端接口、数据库结构、权限、支付、状态机、跨端联动、生产风险。
- 涉及 `gc-echo-backend`、`construction_frontend`、`app_flutter` 之间的联动。
- 需要保留决策记录，后续可能复盘“为什么当时这么设计”。
- 团队协作或需要让下一个 Codex 会话继续接手。
- 用户说“先设计”“先讨论方案”“复杂一点”“后面还会迭代”。

推荐命令：

```text
/opsx:explore
/opsx:propose <change-id 或功能描述>
/opsx:apply <change-id>
/opsx:archive <change-id>
```



### Superpowers 在本项目的强制纪律

#### TDD：实现前先测试

实现功能、修 bug、改变行为前，默认采用 TDD：

1. 写一个能表达目标行为的测试。
2. 运行测试，确认它失败，而且失败原因正确。
3. 写最小实现让测试通过。
4. 再运行相关测试，确认没有回归。
5. 必要时重构，但保持测试为绿。

例外情况：

- 纯配置变更。
- 一次性脚本。
- 没有现成测试框架且建立测试成本明显高于改动本身。

即使例外，也必须说明替代验证方式。

#### Systematic Debugging：先根因，后修复

遇到 bug、测试失败、构建失败、线上异常、接口不符合预期时：

1. 读完整错误信息和堆栈。
2. 稳定复现问题。
3. 查最近变更和相关代码路径。
4. 在关键边界加日志或最小化验证，定位根因。
5. 只针对根因修复，不做碰运气式修改。
6. 加回归测试或可重复验证步骤。

禁止：没复现、没定位，就连续尝试多个“可能修复”。

#### Code Review：关键步骤后自审

完成以下改动后，必须按 review 思维检查：

- 新接口或接口返回结构变化。
- 数据库 schema、迁移、索引、事务。
- 权限、登录、鉴权、支付、隐私相关逻辑。
- 并发、缓存、队列、定时任务。
- 大面积前端状态管理或路由变更。

Review 重点：

- 是否符合 OpenSpec 的 proposal/design/specs/tasks。
- 是否有漏测场景。
- 是否有安全、并发、兼容性、回滚风险。
- 是否引入不必要复杂度。
