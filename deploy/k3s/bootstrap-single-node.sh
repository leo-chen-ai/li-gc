#!/usr/bin/env bash
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive

DATA_ROOT="${DATA_ROOT:-/srv/shanhuai}"
OPS_DIR="$DATA_ROOT/ops"
SECRETS_DIR="$DATA_ROOT/secrets"
LOCAL_PATH="$DATA_ROOT/local-path"
RANCHER_HOSTNAME="${RANCHER_HOSTNAME:?RANCHER_HOSTNAME is required}"
POSTGRES_USER="${POSTGRES_USER:-shanhuai}"
POSTGRES_DB="${POSTGRES_DB:-shanhuai_gc}"
POSTGRES_PVC_SIZE="${POSTGRES_PVC_SIZE:-20Gi}"
REDIS_PVC_SIZE="${REDIS_PVC_SIZE:-2Gi}"
K3S_VERSION="${K3S_VERSION:-v1.35.5-k3s1}"
K3S_ARTIFACT_URL="${K3S_ARTIFACT_URL:-https://rancher-mirror.rancher.cn/k3s}"
HELM_VERSION="${HELM_VERSION:-v3.21.2}"

log() {
  printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"
}

kubectl_k3s() {
  /usr/local/bin/k3s kubectl "$@"
}

wait_for_k3s() {
  log "Waiting for K3s service and API"
  systemctl enable --now k3s
  for i in $(seq 1 60); do
    if systemctl is-active --quiet k3s && kubectl_k3s get nodes >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  systemctl status k3s --no-pager || true
  journalctl -u k3s -n 160 --no-pager || true
  return 1
}

write_postgres_redis_manifest() {
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
}

log "Creating portable data directories under $DATA_ROOT"
mkdir -p "$OPS_DIR" "$SECRETS_DIR" "$LOCAL_PATH" \
  "$DATA_ROOT/backups/postgres" "$DATA_ROOT/backups/redis" "$DATA_ROOT/backups/k3s" \
  /etc/rancher/k3s
chmod 700 "$SECRETS_DIR"

log "Installing base packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg jq openssl tar gzip

log "Writing K3s config"
cat >/etc/rancher/k3s/config.yaml <<K3SCONFIG
data-dir: $DATA_ROOT/k3s
write-kubeconfig-mode: "0600"
node-name: shanhuai-single-1
K3SCONFIG

cat >/etc/rancher/k3s/registries.yaml <<'REGISTRIES'
mirrors:
  docker.io:
    endpoint:
      - "https://docker.1ms.run"
      - "https://docker.m.daocloud.io"
      - "https://mirror.baidubce.com"
      - "https://dockerproxy.com"
  registry.k8s.io:
    endpoint:
      - "https://registry.cn-hangzhou.aliyuncs.com/google_containers"
  quay.io:
    endpoint:
      - "https://quay.m.daocloud.io"
REGISTRIES

if ! command -v k3s >/dev/null 2>&1; then
  log "Installing K3s $K3S_VERSION single-node server"
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="$K3S_VERSION" \
    INSTALL_K3S_ARTIFACT_URL="$K3S_ARTIFACT_URL" \
    sh -s - server
else
  log "K3s already installed; restarting to apply config"
  systemctl restart k3s
fi

wait_for_k3s
kubectl_k3s wait --for=condition=Ready node/shanhuai-single-1 --timeout=180s

log "Configuring root kubeconfig"
mkdir -p /root/.kube
cp /etc/rancher/k3s/k3s.yaml /root/.kube/config
chmod 600 /root/.kube/config
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

log "Waiting for local-path provisioner resources"
for i in $(seq 1 60); do
  if kubectl_k3s -n kube-system get configmap local-path-config >/dev/null 2>&1 && \
    kubectl_k3s -n kube-system get deployment local-path-provisioner >/dev/null 2>&1; then
    break
  fi
  sleep 3
  if [ "$i" = 60 ]; then
    kubectl_k3s -n kube-system get pods,cm,deploy || true
    exit 1
  fi
done

log "Moving local-path PVC root to $LOCAL_PATH"
kubectl_k3s -n kube-system patch configmap local-path-config --type merge -p "{\"data\":{\"config.json\":\"{\\n  \\\"nodePathMap\\\":[\\n    {\\\"node\\\":\\\"DEFAULT_PATH_FOR_NON_LISTED_NODES\\\",\\\"paths\\\":[\\\"$LOCAL_PATH\\\"]}\\n  ]\\n}\"}}"
kubectl_k3s -n kube-system rollout restart deployment/local-path-provisioner
kubectl_k3s -n kube-system rollout status deployment/local-path-provisioner --timeout=15m

if ! command -v helm >/dev/null 2>&1; then
  log "Installing Helm $HELM_VERSION"
  HELM_TMP="$(mktemp -d)"
  curl -fsSL --retry 3 --retry-delay 3 \
    -o "$HELM_TMP/helm-linux-amd64.tar.gz" \
    "https://get.helm.sh/helm-$HELM_VERSION-linux-amd64.tar.gz"
  tar -C "$HELM_TMP" -zxf "$HELM_TMP/helm-linux-amd64.tar.gz"
  install -m 0755 "$HELM_TMP/linux-amd64/helm" /usr/local/bin/helm
  rm -rf "$HELM_TMP"
else
  log "Helm already installed"
fi

log "Preparing secrets"
INFRA_ENV="$SECRETS_DIR/infra.env"
if [ ! -f "$INFRA_ENV" ]; then
  umask 077
  RANCHER_BOOTSTRAP_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
  POSTGRES_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
  REDIS_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
  cat >"$INFRA_ENV" <<SECRETENV
RANCHER_HOSTNAME=$RANCHER_HOSTNAME
RANCHER_BOOTSTRAP_PASSWORD=$RANCHER_BOOTSTRAP_PASSWORD
POSTGRES_USER=$POSTGRES_USER
POSTGRES_DB=$POSTGRES_DB
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@postgresql.shanhuai-infra.svc.cluster.local:5432/$POSTGRES_DB
REDIS_URL=redis://:$REDIS_PASSWORD@redis.shanhuai-infra.svc.cluster.local:6379
SECRETENV
else
  log "Reusing existing $INFRA_ENV"
fi
chmod 600 "$INFRA_ENV"
set -a
. "$INFRA_ENV"
set +a

log "Installing cert-manager and Rancher"
helm repo add rancher-stable https://releases.rancher.com/server-charts/stable >/dev/null 2>&1 || true
helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo update

helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true \
  --wait --timeout 10m

kubectl_k3s create namespace cattle-system --dry-run=client -o yaml | kubectl_k3s apply -f -
helm upgrade --install rancher rancher-stable/rancher \
  --namespace cattle-system \
  --set hostname="$RANCHER_HOSTNAME" \
  --set replicas=1 \
  --set bootstrapPassword="$RANCHER_BOOTSTRAP_PASSWORD" \
  --set ingress.tls.source=rancher \
  --set resources.requests.cpu=100m \
  --set resources.requests.memory=512Mi \
  --set resources.limits.memory=2Gi \
  --wait --timeout 30m

log "Deploying PostgreSQL and Redis"
kubectl_k3s create namespace shanhuai-infra --dry-run=client -o yaml | kubectl_k3s apply -f -
kubectl_k3s -n shanhuai-infra create secret generic shanhuai-infra-secrets \
  --from-literal=POSTGRES_USER="$POSTGRES_USER" \
  --from-literal=POSTGRES_DB="$POSTGRES_DB" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=REDIS_PASSWORD="$REDIS_PASSWORD" \
  --dry-run=client -o yaml | kubectl_k3s apply -f -

write_postgres_redis_manifest
kubectl_k3s apply -f "$OPS_DIR/postgres-redis.yaml"
kubectl_k3s -n shanhuai-infra rollout status statefulset/postgresql --timeout=8m
kubectl_k3s -n shanhuai-infra rollout status statefulset/redis --timeout=8m

log "Writing backup script and ops notes"
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
$KUBECTL -n shanhuai-infra exec statefulset/redis -- sh -c "redis-cli -a \"$REDIS_PASSWORD\" BGSAVE >/dev/null || true"
sleep 3
$KUBECTL -n shanhuai-infra cp redis-0:/data/dump.rdb "$BACKUP_ROOT/redis/$stamp-dump.rdb" >/dev/null 2>&1 || true
tar -C /srv -czf "$BACKUP_ROOT/k3s/$stamp-k3s-server-db.tgz" shanhuai/k3s/server/db shanhuai/ops 2>/dev/null || true
find "$BACKUP_ROOT" -type f -mtime +14 -delete
BACKUP
chmod 700 "$OPS_DIR/backup-infra.sh"

cat >/etc/cron.d/shanhuai-infra-backup <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root /srv/shanhuai/ops/backup-infra.sh >/var/log/shanhuai-infra-backup.log 2>&1
CRON

cat >"$OPS_DIR/README.md" <<README
# Shanhuai single-node K3s environment

- Data root: $DATA_ROOT
- K3s data-dir: $DATA_ROOT/k3s
- Local PV root: $LOCAL_PATH
- Rancher URL: https://$RANCHER_HOSTNAME
- Rancher bootstrap/admin password: stored in $INFRA_ENV
- PostgreSQL service: postgresql.shanhuai-infra.svc.cluster.local:5432
- Redis service: redis.shanhuai-infra.svc.cluster.local:6379
- Kubernetes manifests: $OPS_DIR/postgres-redis.yaml
- Backup script: $OPS_DIR/backup-infra.sh
- Daily backup cron: /etc/cron.d/shanhuai-infra-backup

Migration note: stop k3s, copy /srv/shanhuai plus /etc/rancher/k3s/config.yaml to the new disk/server, restore permissions, then start k3s and verify pods.
README

log "Running connectivity checks"
kubectl_k3s get nodes -o wide
kubectl_k3s get pods -A
kubectl_k3s get pvc -A
kubectl_k3s -n shanhuai-infra exec statefulset/postgresql -- sh -c "PGPASSWORD=\"$POSTGRES_PASSWORD\" psql -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -tAc 'select 1'"
kubectl_k3s -n shanhuai-infra exec statefulset/redis -- sh -c "redis-cli -a \"$REDIS_PASSWORD\" ping"
curl -kfsS --resolve "$RANCHER_HOSTNAME:443:127.0.0.1" "https://$RANCHER_HOSTNAME/ping"
"$OPS_DIR/backup-infra.sh"

log "Setup complete"
