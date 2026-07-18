#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.deploy"
MANIFEST="$ROOT_DIR/deploy/k3s/shanhuai-messaging.yaml"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/shanhuai_k3s_deploy_ed25519}"
REMOTE_OPS_DIR="${REMOTE_OPS_DIR:-/srv/shanhuai/ops}"
REMOTE_MANIFEST="$REMOTE_OPS_DIR/shanhuai-messaging.yaml"

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
EMQX_DASHBOARD_USER="${EMQX_DASHBOARD_USER:-admin}"
EMQX_DASHBOARD_PASSWORD="${EMQX_DASHBOARD_PASSWORD:-}"

SSH_OPTS=(
  -i "$SSH_KEY"
  -p "$VPS_SSH_PORT"
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=15
)

echo "Uploading messaging manifest to $VPS_USER@$VPS_HOST:$REMOTE_MANIFEST"
ssh "${SSH_OPTS[@]}" "$VPS_USER@$VPS_HOST" "mkdir -p '$REMOTE_OPS_DIR'"
scp -i "$SSH_KEY" -P "$VPS_SSH_PORT" -o StrictHostKeyChecking=accept-new "$MANIFEST" \
  "$VPS_USER@$VPS_HOST:$REMOTE_MANIFEST"

echo "Applying NATS and EMQX manifests"
ssh "${SSH_OPTS[@]}" "$VPS_USER@$VPS_HOST" \
  "EMQX_DASHBOARD_USER='$EMQX_DASHBOARD_USER' EMQX_DASHBOARD_PASSWORD='$EMQX_DASHBOARD_PASSWORD' REMOTE_MANIFEST='$REMOTE_MANIFEST' bash -s" <<'REMOTE'
set -Eeuo pipefail
KUBECTL=(/usr/local/bin/k3s kubectl)

"${KUBECTL[@]}" create namespace shanhuai-infra --dry-run=client -o yaml | "${KUBECTL[@]}" apply -f -

if [ -z "$EMQX_DASHBOARD_PASSWORD" ]; then
  existing_password="$("${KUBECTL[@]}" -n shanhuai-infra get secret shanhuai-messaging-secret -o jsonpath='{.data.EMQX_DASHBOARD_PASSWORD}' 2>/dev/null || true)"
  if [ -n "$existing_password" ]; then
    EMQX_DASHBOARD_PASSWORD="$(printf '%s' "$existing_password" | base64 -d)"
  else
    EMQX_DASHBOARD_PASSWORD="$(openssl rand -hex 16)"
    echo "Generated EMQX_DASHBOARD_PASSWORD for this deployment."
  fi
fi

"${KUBECTL[@]}" -n shanhuai-infra create secret generic shanhuai-messaging-secret \
  --from-literal=EMQX_DASHBOARD_USER="$EMQX_DASHBOARD_USER" \
  --from-literal=EMQX_DASHBOARD_PASSWORD="$EMQX_DASHBOARD_PASSWORD" \
  --dry-run=client -o yaml | "${KUBECTL[@]}" apply -f -

"${KUBECTL[@]}" apply -f "$REMOTE_MANIFEST"
"${KUBECTL[@]}" -n shanhuai-infra rollout status statefulset/nats --timeout=8m
"${KUBECTL[@]}" -n shanhuai-infra rollout status statefulset/emqx --timeout=40m
"${KUBECTL[@]}" -n shanhuai-infra get svc,pods -l app.kubernetes.io/part-of=shanhuai-infra -o wide
REMOTE

cat <<EOF

Messaging services are ready.
- NATS cluster URL: nats://nats.shanhuai-infra.svc.cluster.local:4222
- EMQX cluster MQTT URL: mqtt://emqx.shanhuai-infra.svc.cluster.local:1883
- EMQX public MQTT fallback: mqtt://$VPS_HOST:31883
EOF
