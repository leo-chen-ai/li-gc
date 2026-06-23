# 山淮本地直连 K3s 部署

这套部署绕开 GitHub Actions 和镜像仓库：本机直接构建镜像，通过 SSH 导入宿迁 K3s，然后滚动更新 Deployment。

## 首次配置

项目根目录需要有 `.env.deploy`，至少包含：

```bash
VPS_HOST=36.151.143.235
VPS_USER=root
VPS_SSH_PORT=22
VPS_PASSWORD=...
```

首次把本机部署公钥写入服务器：

```bash
deploy/k3s/setup-local-ssh.sh
```

这个步骤只用一次密码，后续部署走 SSH key。默认 key 路径是 `~/.ssh/shanhuai_k3s_deploy_ed25519`。

## 部署命令

自动识别 API/UI 改动并只更新变化部分：

```bash
deploy/k3s/deploy-local.sh --auto
```

手动只更新后端：

```bash
deploy/k3s/deploy-local.sh --api
```

手动只更新前端：

```bash
deploy/k3s/deploy-local.sh --ui
```

全量更新：

```bash
deploy/k3s/deploy-local.sh --all
```

后端更新但跳过数据库迁移：

```bash
deploy/k3s/deploy-local.sh --api --skip-migrate
```

只看自动识别结果，不实际构建和发布：

```bash
deploy/k3s/deploy-local.sh --auto --dry-run
```

## 工作方式

- 默认构建平台是 `linux/amd64`，适配当前宿迁 K3s 节点。
- 默认使用当前 Docker Buildx builder；如果要指定 builder，可设置 `BUILDX_BUILDER=desktop-linux`。
- 本地 Docker BuildKit 缓存在 `~/.cache/shanhuai-gc/buildkit/`，重复构建会快一些。
- 后端部署会构建 `shanhuai-api` 和 `shanhuai-migrate`，先导入镜像，再跑迁移 Job，最后滚动更新 API。
- 前端部署会用 `PUBLIC_WEB_URL` 作为 `VITE_API_URL`，默认是 `http://36.151.143.235:30081`。
- 发布完成后会验证 `http://36.151.143.235:30081/` 和 `/health`。

## GitHub 的角色

GitHub 现在只作为代码仓库使用。PRD 自动部署 workflow 已移除，CI workflow 也改成手动触发，避免国内网络和单台 runner 影响发布。
