# 数据报送 Worker

该服务是山淮后台“数据报送”模块的独立 Chromium 执行容器。API 只负责配置、任务、日志和数据查询；一个 Worker 从 PostgreSQL 任务队列领取任务。

## 运行约束

- 全局最多同时运行 1 个任务，数据库 advisory lock 和活动租约共同保证该限制。
- 同一配置同一时刻只会运行一个任务。
- 每个 Worker 一次只启动一个 Chromium；空闲时不启动浏览器。
- 正式配置每天按 `Asia/Shanghai` 时区运行一次，`config_id + scheduled_date` 唯一索引防止重复调度。
- 密码、飞书凭证和人员敏感字段使用 `REPORT_FORWARD_CREDENTIAL_KEY` 加密保存，API 只返回脱敏值。
- 下载文件、转换文件和错误明细写入对象存储，数据库永久保留任务、项目、人员、回执和阶段日志。

## 测试阶段

管理端可以分别创建源站登录、项目列表、下载、转换、目标站登录、上传校验（不最终提交）、真实提交和全流程测试。所有测试也进入统一队列并受两个并发限制。

## 本地运行

先执行数据库迁移，再启动一个 Worker：

```bash
docker compose --profile full up -d postgres api
docker compose --profile full up -d report-worker
```

本地必须设置一个至少 32 字符的 `REPORT_FORWARD_CREDENTIAL_KEY`；生产环境由 K3s Secret 提供。


## 源网站和验证码模式

- 原配置继续使用 `xzy_zjzwfw`（姜太公网站）；新增 `huaxing_zjzwfw`（华瑆网站）。用户在报送配置填写各自账号、密码及项目名称，不保存临时 Token。
- 华瑆使用 `POST /api/system/login` 登录，通过当前用户信息获取 uid，分页搜索 `/api/api/project/list`，再分页读取 `/api/api/worker/list`。指定项目按完整名称匹配，并执行排除列表。
- 华瑆 `entryTime`（兼容 `entry_time`）映射到现有花名册的“最新进场时间”，随后按配置天数筛选并转换政务网模板；不使用 `createTime` 或 `updateTime` 替代进场时间。字段缺失或分页异常时停止处理。
- 自动模式继续通过飞书获取验证码。手动模式不启用每日调度、不自动重试，也不会在 Worker 重启后自动恢复中断的任务。正式配置可直接点击“手动执行”。
- 手动执行自动打开详情，收到目标网站短信后弹出输入框，提交后继续。每轮输入有独立请求 ID，默认等待 120 秒；已提交、过期、取消任务的验证码不能重复提交。验证码加密暂存，消费后删除；只有发起任务的账号或系统管理员 admin 可以提交。
- 上线前先应用 `065_report_manual_verification` 迁移，再更新 API/UI/Worker。迁移包含中文表、字段备注，以及手动模式禁止调度的数据库约束。
- 本地 Worker 设置 `REPORT_FORWARD_WORKER_TARGET=local`，只领取本地任务且不创建生产定时任务。真实网站验证由用户填写配置后在本地 Docker 执行源站登录、下载/转换和目标站登录测试，确认后再发布。
