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

## 山淮微信小程序 OSS 图片上传

- 小程序图片外链前缀：`https://shanhuai-gc.s3.cn-east-2.jdcloud-oss.com/wx`，配置在 `wx/config/assets.js`。
- 小程序首页模块图、登录图等静态资源上传到京东云 OSS 的 `wx/` 对象前缀，例如源文件 `module-teams.png` 对应远端对象 `wx/module-teams.png`。源文件可临时放在桌面、`tmp/` 或其他工作目录，上传后不要为了运行依赖保留在小程序包里。
- OSS 凭据优先读取 `api/.env` 里的 `JD_OSS_ACCESS_KEY_ID`、`JD_OSS_ACCESS_KEY_SECRET`、`JD_OSS_BUCKET`、`JD_OSS_ENDPOINT`、`JD_OSS_REGION`、`JD_OSS_PUBLIC_BASE_URL`；不要把密钥硬编码进命令、脚本或回复。
- 当前仓库没有安装 `aws`/`s3cmd`/`mc`/`ossutil` CLI 时，可以复用后端 `api/src/infrastructure/storage/jdcloud_oss.rs` 的 AWS4 S3 签名逻辑，用临时 Python/Node 脚本直接 `PUT https://<bucket>.<endpoint>/<key>`。
- 上传请求必须包含并参与签名的 headers：`content-type`、`host`、`x-amz-content-sha256`、`x-amz-date`；`Authorization` 使用 `AWS4-HMAC-SHA256`，credential scope 为 `<YYYYMMDD>/<JD_OSS_REGION>/s3/aws4_request`。
- 上传后必须用公开 URL 重新 `GET` 校验，至少比对远端内容的 SHA256 和本地文件 SHA256 一致；为绕过缓存可在 URL 后追加 `?verify=<timestamp>`。
- 微信开发者工具或真机如果仍显示旧图，先清缓存/重新编译；代码仍使用同名外链时，覆盖 OSS 同名对象即可生效。




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


### 极简流程：一次性/探索性任务

适用于：临时脚本、一次性数据查看、纯调研、不会进生产的探索。

- 可以直接让 Codex 执行。
- 但不能编造结果，结论仍要基于命令输出、文件内容或可验证证据。

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

- 是否有漏测场景。
- 是否有安全、并发、兼容性、回滚风险。
- 是否引入不必要复杂度。
