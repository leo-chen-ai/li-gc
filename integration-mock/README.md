# 三方平台接口模拟服务

这是一个独立的 Node.js + SQLite 服务，用于模拟仓库 `docs/对接文档` 中的接口：

- 宁波市住建（市平台）：12 个 REST 接口。
- 薪乐达：`/openapi` 下 11 个 Method，以及 `/upfiles` 文件上传。
- 甬薪 V2：8 个 REST 接口。

一共覆盖 32 个文档入口。请求、工人、班组、项目人员、异步任务和上传元数据保存在 SQLite；图片和附件本身不落盘。

## 地址

本地启动后，三个平台的 Base URL 都是：

```text
http://127.0.0.1:3000
```

K3s 部署后：

```text
公网/本机：http://36.151.143.235:30083
集群内部：http://shanhuai-integration-mock.shanhuai-mock.svc.cluster.local:3000
```

薪乐达会在 Base URL 后调用 `/openapi` 和 `/upfiles`，无需额外添加路径。

市平台客户端具有目标主机白名单保护。山淮 API 连接集群内模拟服务时，需要把下面的值加入 API 环境变量 `NINGBO_HOUSING_ALLOWED_HOSTS`：

```text
shanhuai-integration-mock.shanhuai-mock.svc.cluster.local
```

## 模拟凭据

K3s 默认以严格模式运行，模拟凭据存放在 Kubernetes Secret `shanhuai-integration-mock-secrets` 中。本地可用 `MOCK_AUTH_MODE=permissive` 临时切换为仅记录验签结果、不拦截错误请求。

严格模式实现的校验：

- 市平台：校验 Header 中的 `AppKey`、以 2000-01-01 为纪元的 `CurTime`、`SHA256(AppSecret + CurTime)`，时间窗为 2 小时。
- 薪乐达：校验全部标准参数、AppID、版本、格式、10 分钟时间窗、参数排序后 SHA256 签名，并持久化 Nonce 防止时间窗内重放；`/upfiles` 按文档单独验签。
- 甬薪：校验项目码、AppKey、10 分钟时间窗及 `MD5(appKey + "&" + appSecret + "&" + timestamp)`；图片上传接口按文档只校验请求体 AppKey。

```text
市平台 AppKey:     mock-ningbo-app-key
市平台 AppSecret:  mock-ningbo-secret
市平台项目 ID:     1206
市平台项目 GUID:   00000000-0000-0000-0000-000000001206

薪乐达 AppID:      mock-xinleda-app
薪乐达 AppSecret:  1234567890abcdef

甬薪 AppKey:       mock-yongxin-app
甬薪 AppSecret:    1234567890abcdef
甬薪项目码:         MOCK-PROJECT-001
```

## 本地运行和测试

需要 Node.js 24 或更高版本；项目没有第三方 npm 依赖。

```bash
cd integration-mock
MOCK_DATABASE_PATH=./data/integration-mock.sqlite node src/server.js
node --test
npm run smoke -- http://127.0.0.1:3000
```

健康检查：

```bash
curl http://127.0.0.1:3000/health
```

## 管理接口

除 `/health` 外，`/__mock/*` 都需要管理 Token：

```http
Authorization: Bearer <MOCK_ADMIN_TOKEN>
```

可用接口：

- `GET /__mock`：服务配置、模拟凭据和接口目录。
- `GET /__mock/routes`：32 个文档入口清单。
- `GET /__mock/requests?platform=yongxin&operation=attend%2Fv2%2Fadd&limit=100`：查看请求和响应记录。
- `GET /__mock/faults`：查看故障注入规则。
- `POST /__mock/faults`：为指定接口注入固定次数的延迟或错误。
- `POST /__mock/reset`：清空模拟业务数据、请求记录和故障规则。

故障注入示例：让甬薪考勤下一次返回 HTTP 503：

```json
{
  "platform": "yongxin",
  "operation": "attend/v2/add",
  "remaining": 1,
  "status": 503,
  "delayMs": 0,
  "body": { "code": 503, "msg": "mock transient failure" }
}
```

`platform` 使用 `ningbo`、`xinleda` 或 `yongxin`；`operation` 使用接口目录中的 operation 原值。

## K3s 部署

项目根目录执行：

```bash
bash deploy/k3s/deploy-integration-mock.sh
```

脚本会构建 `linux/amd64` 镜像、通过 SSH 导入宿迁 K3s、创建或复用管理 Token、部署 1Gi SQLite PVC，并验证 rollout 和健康接口。管理 Token 可从集群 Secret 读取：

```bash
k3s kubectl -n shanhuai-mock get secret shanhuai-integration-mock-secrets \
  -o jsonpath='{.data.MOCK_ADMIN_TOKEN}' | base64 -d
```
