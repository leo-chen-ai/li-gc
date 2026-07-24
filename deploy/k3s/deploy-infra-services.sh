#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_ROOT="${DATA_ROOT:-/srv/shanhuai}"
OPS_DIR="$DATA_ROOT/ops"
SECRETS_DIR="$DATA_ROOT/secrets"
LOCAL_PATH="$DATA_ROOT/local-path"
POSTGRES_BACKUP_MANIFEST="$SCRIPT_DIR/postgres-backup-cronjob.yaml"
POSTGRES_PVC_SIZE="${POSTGRES_PVC_SIZE:-20Gi}"
REDIS_PVC_SIZE="${REDIS_PVC_SIZE:-2Gi}"
KUBECTL=(/usr/local/bin/k3s kubectl)

log() {
  printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"
}

if [ ! -f "$SECRETS_DIR/infra.env" ]; then
  echo "Missing $SECRETS_DIR/infra.env. Run bootstrap-single-node.sh first." >&2
  exit 1
fi

if [ ! -f "$POSTGRES_BACKUP_MANIFEST" ]; then
  echo "Missing $POSTGRES_BACKUP_MANIFEST. Keep it beside deploy-infra-services.sh." >&2
  exit 1
fi

mkdir -p "$OPS_DIR" "$SECRETS_DIR" "$LOCAL_PATH" \
  "$DATA_ROOT/backups/postgres" "$DATA_ROOT/backups/redis" "$DATA_ROOT/backups/k3s"
chmod 700 "$SECRETS_DIR"

set -a
. "$SECRETS_DIR/infra.env"
set +a

log "Creating namespace and Kubernetes secret"
"${KUBECTL[@]}" create namespace shanhuai-infra --dry-run=client -o yaml | "${KUBECTL[@]}" apply -f -
"${KUBECTL[@]}" -n shanhuai-infra create secret generic shanhuai-infra-secrets \
  --from-literal=POSTGRES_USER="$POSTGRES_USER" \
  --from-literal=POSTGRES_DB="$POSTGRES_DB" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=REDIS_PASSWORD="$REDIS_PASSWORD" \
  --dry-run=client -o yaml | "${KUBECTL[@]}" apply -f -

log "Writing PostgreSQL and Redis manifests"
cat >"$OPS_DIR/postgres-redis.yaml" <<YAML
apiVersion: v1
kind: Service
metadata:
  name: postgresql
  namespace: shanhuai-infra
  labels:
    app.kubernetes.io/name: postgresql
    app.kubernetes.io/part-of: shanhuai-infra
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: postgresql
  ports:
    - name: postgres
      port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgresql
  namespace: shanhuai-infra
  labels:
    app.kubernetes.io/name: postgresql
    app.kubernetes.io/part-of: shanhuai-infra
spec:
  serviceName: postgresql
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: postgresql
  template:
    metadata:
      labels:
        app.kubernetes.io/name: postgresql
        app.kubernetes.io/part-of: shanhuai-infra
    spec:
      containers:
        - name: postgresql
          image: postgres:16-alpine
          imagePullPolicy: IfNotPresent
          ports:
            - name: postgres
              containerPort: 5432
          env:
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: shanhuai-infra-secrets
                  key: POSTGRES_USER
            - name: POSTGRES_DB
              valueFrom:
                secretKeyRef:
                  name: shanhuai-infra-secrets
                  key: POSTGRES_DB
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: shanhuai-infra-secrets
                  key: POSTGRES_PASSWORD
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 1Gi
          readinessProbe:
            exec:
              command:
                - sh
                - -c
                - pg_isready -U "\$POSTGRES_USER" -d "\$POSTGRES_DB"
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          livenessProbe:
            exec:
              command:
                - sh
                - -c
                - pg_isready -U "\$POSTGRES_USER" -d "\$POSTGRES_DB"
            initialDelaySeconds: 30
            periodSeconds: 20
            timeoutSeconds: 5
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: local-path
        resources:
          requests:
            storage: $POSTGRES_PVC_SIZE
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: shanhuai-infra
  labels:
    app.kubernetes.io/name: redis
    app.kubernetes.io/part-of: shanhuai-infra
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: redis
  ports:
    - name: redis
      port: 6379
      targetPort: 6379
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: shanhuai-infra
  labels:
    app.kubernetes.io/name: redis
    app.kubernetes.io/part-of: shanhuai-infra
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: redis
  template:
    metadata:
      labels:
        app.kubernetes.io/name: redis
        app.kubernetes.io/part-of: shanhuai-infra
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          imagePullPolicy: IfNotPresent
          ports:
            - name: redis
              containerPort: 6379
          env:
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: shanhuai-infra-secrets
                  key: REDIS_PASSWORD
          command:
            - sh
            - -c
            - exec redis-server --appendonly yes --requirepass "\$REDIS_PASSWORD" --maxmemory 256mb --maxmemory-policy allkeys-lru
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            exec:
              command:
                - sh
                - -c
                - redis-cli -a "\$REDIS_PASSWORD" ping | grep PONG
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5
          livenessProbe:
            exec:
              command:
                - sh
                - -c
                - redis-cli -a "\$REDIS_PASSWORD" ping | grep PONG
            initialDelaySeconds: 20
            periodSeconds: 20
            timeoutSeconds: 5
          volumeMounts:
            - name: redis-data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: redis-data
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: local-path
        resources:
          requests:
            storage: $REDIS_PVC_SIZE
YAML

"${KUBECTL[@]}" apply -f "$OPS_DIR/postgres-redis.yaml"
"${KUBECTL[@]}" -n shanhuai-infra rollout status statefulset/postgresql --timeout=12m
"${KUBECTL[@]}" -n shanhuai-infra rollout status statefulset/redis --timeout=12m

log "Deploying PostgreSQL backup CronJob"
install -m 0644 "$POSTGRES_BACKUP_MANIFEST" "$OPS_DIR/postgres-backup-cronjob.yaml"
"${KUBECTL[@]}" apply -f "$OPS_DIR/postgres-backup-cronjob.yaml"
rm -f /etc/cron.d/shanhuai-infra-backup

log "Writing backup script and operations README"
cat >"$OPS_DIR/backup-infra.sh" <<'BACKUP'
#!/usr/bin/env bash
set -Eeuo pipefail
DATA_ROOT=/srv/shanhuai
SECRETS_FILE="$DATA_ROOT/secrets/infra.env"
BACKUP_ROOT="$DATA_ROOT/backups"
KUBECTL="/usr/local/bin/k3s kubectl"
source "$SECRETS_FILE"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_ROOT/postgres" "$BACKUP_ROOT/redis" "$BACKUP_ROOT/k3s"
$KUBECTL -n shanhuai-infra exec statefulset/postgresql -- sh -c "PGPASSWORD=\"$POSTGRES_PASSWORD\" pg_dump -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -Fc" > "$BACKUP_ROOT/postgres/$stamp-$POSTGRES_DB.dump"
set -- "$BACKUP_ROOT/postgres"/*-"$POSTGRES_DB".dump
if [ -e "$1" ]; then
  while [ "$#" -gt 3 ]; do
    rm -f "$1"
    shift
  done
fi
$KUBECTL -n shanhuai-infra exec statefulset/redis -- sh -c "redis-cli -a \"$REDIS_PASSWORD\" BGSAVE >/dev/null || true"
sleep 3
$KUBECTL -n shanhuai-infra cp redis-0:/data/dump.rdb "$BACKUP_ROOT/redis/$stamp-dump.rdb" >/dev/null 2>&1 || true
tar -C /srv -czf "$BACKUP_ROOT/k3s/$stamp-k3s-server-db.tgz" shanhuai/k3s/server/db shanhuai/ops 2>/dev/null || true
find "$BACKUP_ROOT" -type f -mtime +14 -delete
BACKUP
chmod 700 "$OPS_DIR/backup-infra.sh"

cat >"$OPS_DIR/README.md" <<README
# Shanhuai single-node K3s environment

- Data root: $DATA_ROOT
- K3s data-dir: $DATA_ROOT/k3s
- Local PV root: $LOCAL_PATH
- Rancher URL: https://$RANCHER_HOSTNAME
- Rancher bootstrap/admin password: stored in $SECRETS_DIR/infra.env
- PostgreSQL service: postgresql.shanhuai-infra.svc.cluster.local:5432
- Redis service: redis.shanhuai-infra.svc.cluster.local:6379
- Kubernetes manifests: $OPS_DIR/postgres-redis.yaml
- PostgreSQL backup manifest: $OPS_DIR/postgres-backup-cronjob.yaml
- PostgreSQL backup CronJob: shanhuai-infra/postgresql-backup (daily at 02:00 Asia/Shanghai, keeps 3)
- Manual full infrastructure backup script: $OPS_DIR/backup-infra.sh

Migration note: stop k3s, copy /srv/shanhuai plus /etc/rancher/k3s/config.yaml to the new disk/server, restore permissions, then start k3s and verify pods.
README

log "Running backup and connectivity checks"
"$OPS_DIR/backup-infra.sh"
"${KUBECTL[@]}" get nodes -o wide
"${KUBECTL[@]}" get pods -A
"${KUBECTL[@]}" get pvc -A
"${KUBECTL[@]}" -n shanhuai-infra exec statefulset/postgresql -- sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc 'select 1'"
"${KUBECTL[@]}" -n shanhuai-infra exec statefulset/redis -- sh -c "redis-cli -a \"\$REDIS_PASSWORD\" ping"
curl -kfsS --resolve "$RANCHER_HOSTNAME:443:127.0.0.1" "https://$RANCHER_HOSTNAME/ping"

log "Infrastructure services are ready"
