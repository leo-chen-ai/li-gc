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
