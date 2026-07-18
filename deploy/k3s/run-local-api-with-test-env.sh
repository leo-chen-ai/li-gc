#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_ENV="$ROOT_DIR/.env.deploy"
SSH_KEY="${SHANHUAI_SSH_KEY:-$HOME/.ssh/shanhuai_k3s_deploy_ed25519}"
DB_PORT="${LOCAL_TEST_DB_PORT:-15432}"
REDIS_PORT="${LOCAL_TEST_REDIS_PORT:-16379}"
MQTT_PORT="${LOCAL_TEST_MQTT_PORT:-11883}"

if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "Missing $DEPLOY_ENV" >&2
  exit 1
fi

set -a
source "$DEPLOY_ENV"
source "$ROOT_DIR/api/.env"
set +a

remote() {
  ssh -i "$SSH_KEY" -p "$VPS_SSH_PORT" "$VPS_USER@$VPS_HOST" "$@"
}

secret() {
  remote "k3s kubectl -n shanhuai-app get secret shanhuai-app-secret -o jsonpath='{.data.$1}'" \
    | base64 --decode
}

db_ip="$(remote "k3s kubectl -n shanhuai-infra get svc postgresql -o jsonpath='{.spec.clusterIP}'")"
redis_ip="$(remote "k3s kubectl -n shanhuai-infra get svc redis -o jsonpath='{.spec.clusterIP}'")"
mqtt_ip="$(remote "k3s kubectl -n shanhuai-infra get svc emqx -o jsonpath='{.spec.clusterIP}'")"

ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -i "$SSH_KEY" -p "$VPS_SSH_PORT" \
  -L "127.0.0.1:$DB_PORT:$db_ip:5432" \
  -L "127.0.0.1:$REDIS_PORT:$redis_ip:6379" \
  -L "127.0.0.1:$MQTT_PORT:$mqtt_ip:1883" \
  "$VPS_USER@$VPS_HOST" &
tunnel_pid=$!
trap 'kill "$tunnel_pid" 2>/dev/null || true' EXIT INT TERM
sleep 1

export DATABASE_URL="$(secret DATABASE_URL | sed -E "s/@[^:/]+:5432\//@127.0.0.1:$DB_PORT\//")"
export REDIS_URL="$(secret REDIS_URL | sed -E "s/@?[^/@:]+:6379/@127.0.0.1:$REDIS_PORT/")"
export MQTT_BROKER_URL="mqtt://127.0.0.1:$MQTT_PORT"
export JWT_ACCESS_SECRET="$(secret JWT_ACCESS_SECRET)"
export JWT_REFRESH_SECRET="$(secret JWT_REFRESH_SECRET)"
export SERVER_PORT="${SERVER_PORT:-8080}"

echo "Starting local API on http://127.0.0.1:$SERVER_PORT with K3s test database, Redis, and MQTT"
cd "$ROOT_DIR/api"
cargo run
