# PostgreSQL K3s 备份

生产环境使用 `shanhuai-infra/postgresql-backup` CronJob 每天备份 PostgreSQL：

- 执行时间：每天北京时间 02:00。
- 备份格式：`pg_dump` custom archive（`.dump`）。
- 保存位置：宿迁节点 `/srv/shanhuai/backups/postgres`。
- 保留策略：每次成功生成并校验新备份后，只保留最新 3 份。
- 并发策略：`Forbid`，上一轮未结束时不会启动新一轮。
- 失败保护：先写隐藏临时文件，`pg_restore --list` 校验通过后再原子改名；失败时不清理已有成功备份。

## 部署

```bash
k3s kubectl apply -f /srv/shanhuai/ops/postgres-backup-cronjob.yaml
k3s kubectl -n shanhuai-infra get cronjob postgresql-backup
```

仓库清单为 `deploy/k3s/postgres-backup-cronjob.yaml`。部署到 K3s 后，应移除旧的宿主机定时任务 `/etc/cron.d/shanhuai-infra-backup`，避免每天重复备份。

## 手动执行与检查

```bash
job="postgresql-backup-manual-$(date +%s)"
k3s kubectl -n shanhuai-infra create job --from=cronjob/postgresql-backup "$job"
k3s kubectl -n shanhuai-infra wait --for=condition=complete "job/$job" --timeout=30m
k3s kubectl -n shanhuai-infra logs "job/$job"
find /srv/shanhuai/backups/postgres -maxdepth 1 -type f -name '*.dump' -printf '%f %s bytes\n' | sort
```

## 恢复

恢复前先停止会写数据库的 API 和 Worker，并另行保留恢复前备份。以下命令会清空目标数据库中的现有对象，只能在明确选择好备份后执行：

```bash
backup=/srv/shanhuai/backups/postgres/<选中的备份文件>.dump
cat "$backup" | k3s kubectl -n shanhuai-infra exec -i postgresql-0 -- \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

当前备份与数据库数据同在一台宿迁节点，能防误操作和逻辑损坏，但不能防整机或磁盘故障。若需要灾备，应再把这 3 份同步到京东云 OSS 或北京 CI 机，并定期做临时库恢复演练。
