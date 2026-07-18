#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.deploy"
VALUES_DIR="$ROOT_DIR/deploy/k3s/observability"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/shanhuai_k3s_deploy_ed25519}"
NAMESPACE="${OBSERVABILITY_NAMESPACE:-shanhuai-observability}"
REMOTE_OPS_DIR="${REMOTE_OPS_DIR:-/srv/shanhuai/ops/observability}"
REMOTE_SECRETS_DIR="${REMOTE_SECRETS_DIR:-/srv/shanhuai/secrets}"
REMOTE_ENV_FILE="$REMOTE_SECRETS_DIR/observability.env"
DEPLOY_PLATFORM="${DEPLOY_PLATFORM:-linux/amd64}"
SKIP_IMAGE_IMPORT="${SKIP_IMAGE_IMPORT:-0}"
IMAGE_MIRROR_PREFIXES="${IMAGE_MIRROR_PREFIXES:-docker.m.daocloud.io docker.1ms.run}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Run deploy/k3s/setup-local-ssh.sh first if this is a new machine." >&2
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "Missing SSH key $SSH_KEY. Run deploy/k3s/setup-local-ssh.sh first." >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

VPS_HOST="${VPS_HOST:?Missing VPS_HOST in .env.deploy}"
VPS_USER="${VPS_USER:-root}"
VPS_SSH_PORT="${VPS_SSH_PORT:-22}"

SSH_OPTS=(
  -i "$SSH_KEY"
  -p "$VPS_SSH_PORT"
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=15
)

ssh_remote() {
  ssh "${SSH_OPTS[@]}" "$VPS_USER@$VPS_HOST" "$@"
}

pull_image_for_import() {
  local image="$1"
  local repository="$image"
  local candidate

  if [[ "$image" == docker.io/* ]]; then
    repository="${image#docker.io/}"
    for mirror in $IMAGE_MIRROR_PREFIXES; do
      candidate="$mirror/$repository"
      echo "Trying mirror image $candidate"
      if docker pull --platform "$DEPLOY_PLATFORM" "$candidate"; then
        docker tag "$candidate" "$image"
        return
      fi
    done
  fi

  docker pull --platform "$DEPLOY_PLATFORM" "$image"
}

import_images() {
  if [ "$SKIP_IMAGE_IMPORT" = "1" ]; then
    echo "Skipping local image import because SKIP_IMAGE_IMPORT=1."
    return
  fi

  if ! docker version >/dev/null 2>&1; then
    echo "Docker is not available locally; Kubernetes will pull images from registries." >&2
    return
  fi

  while IFS= read -r image; do
    [ -n "$image" ] || continue
    case "$image" in \#*) continue ;; esac

    echo "Pulling $image for $DEPLOY_PLATFORM"
    pull_image_for_import "$image"

    echo "Importing $image into K3s containerd"
    docker save --platform "$DEPLOY_PLATFORM" "$image" | gzip -1 | ssh_remote "/usr/bin/gzip -dc | /usr/local/bin/k3s ctr images import -"
  done <"$VALUES_DIR/images.txt"
}

echo "Uploading observability manifests to $VPS_USER@$VPS_HOST:$REMOTE_OPS_DIR"
ssh_remote "mkdir -p '$REMOTE_OPS_DIR' '$REMOTE_SECRETS_DIR' && chmod 700 '$REMOTE_SECRETS_DIR'"
scp -i "$SSH_KEY" -P "$VPS_SSH_PORT" -o StrictHostKeyChecking=accept-new \
  "$VALUES_DIR"/victoria-values.yaml \
  "$VALUES_DIR"/loki-values.yaml \
  "$VALUES_DIR"/alloy.yaml \
  "$VALUES_DIR"/grafana-nodeport.yaml \
  "$VPS_USER@$VPS_HOST:$REMOTE_OPS_DIR/"

import_images

echo "Installing observability stack"
ssh_remote "NAMESPACE='$NAMESPACE' REMOTE_OPS_DIR='$REMOTE_OPS_DIR' REMOTE_ENV_FILE='$REMOTE_ENV_FILE' VPS_HOST='$VPS_HOST' bash -s" <<'REMOTE'
set -Eeuo pipefail
KUBECTL=(/usr/local/bin/k3s kubectl)

"${KUBECTL[@]}" create namespace "$NAMESPACE" --dry-run=client -o yaml | "${KUBECTL[@]}" apply -f -

if [ -f "$REMOTE_ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$REMOTE_ENV_FILE"
fi

GRAFANA_ADMIN_USER="${GRAFANA_ADMIN_USER:-admin}"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-}"

if [ -z "$GRAFANA_ADMIN_PASSWORD" ]; then
  GRAFANA_ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
  umask 077
  cat >"$REMOTE_ENV_FILE" <<EOF
GRAFANA_ADMIN_USER=$GRAFANA_ADMIN_USER
GRAFANA_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD
GRAFANA_URL=http://$VPS_HOST:30082
LOKI_RETENTION=168h
EOF
  echo "Generated Grafana admin password in $REMOTE_ENV_FILE."
fi

"${KUBECTL[@]}" -n "$NAMESPACE" create secret generic shanhuai-grafana-admin \
  --from-literal=admin-user="$GRAFANA_ADMIN_USER" \
  --from-literal=admin-password="$GRAFANA_ADMIN_PASSWORD" \
  --dry-run=client -o yaml | "${KUBECTL[@]}" apply -f -

helm upgrade --install shanhuai-loki oci://ghcr.io/grafana/helm-charts/loki \
  --version 7.0.0 \
  --namespace "$NAMESPACE" \
  --values "$REMOTE_OPS_DIR/loki-values.yaml" \
  --wait \
  --timeout 20m

helm upgrade --install shanhuai-vm oci://ghcr.io/victoriametrics/helm-charts/victoria-metrics-k8s-stack \
  --version 0.85.8 \
  --namespace "$NAMESPACE" \
  --values "$REMOTE_OPS_DIR/victoria-values.yaml" \
  --wait \
  --timeout 20m

"${KUBECTL[@]}" apply -f "$REMOTE_OPS_DIR/grafana-nodeport.yaml"
"${KUBECTL[@]}" apply -f "$REMOTE_OPS_DIR/alloy.yaml"

"${KUBECTL[@]}" -n "$NAMESPACE" rollout status statefulset/shanhuai-loki --timeout=10m
"${KUBECTL[@]}" -n "$NAMESPACE" rollout status deployment/shanhuai-loki-gateway --timeout=10m
"${KUBECTL[@]}" -n "$NAMESPACE" rollout status deployment/shanhuai-vm-grafana --timeout=10m
"${KUBECTL[@]}" -n "$NAMESPACE" rollout status deployment/shanhuai-vm-victoria-metrics-operator --timeout=10m
"${KUBECTL[@]}" -n "$NAMESPACE" rollout status daemonset/shanhuai-alloy --timeout=10m

"${KUBECTL[@]}" -n "$NAMESPACE" get deploy,sts,ds,pods,svc -o wide
REMOTE

if compgen -G "$VALUES_DIR/dashboards/*.json" >/dev/null; then
  "$ROOT_DIR/deploy/k3s/import-observability-dashboards.sh"
fi

cat <<EOF

Observability stack deployed.
- Grafana: http://$VPS_HOST:30082
- Grafana credentials: $REMOTE_ENV_FILE on the server
- Loki log retention: 168h
EOF
