#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_ENV="$ROOT_DIR/.env.deploy"
COMPOSE_FILE="$ROOT_DIR/docker-compose.report-local.yml"
STATE_DIR="$ROOT_DIR/tmp/report-local-docker"
SSH_KEY="${SHANHUAI_SSH_KEY:-$HOME/.ssh/shanhuai_k3s_deploy_ed25519}"
DB_PORT="${LOCAL_REPORT_DB_PORT:-15432}"
REDIS_PORT="${LOCAL_REPORT_REDIS_PORT:-16379}"
NATS_PORT="${LOCAL_REPORT_NATS_PORT:-14222}"
MQTT_PORT="${LOCAL_REPORT_MQTT_PORT:-11883}"
TUNNEL_HOST="${LOCAL_REPORT_TUNNEL_HOST:-host.docker.internal}"
UI_PORT="${REPORT_LOCAL_UI_PORT:-8073}"
CONTROL_SOCKET="$STATE_DIR/ssh-control"
ACTION="${1:-up}"

if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "Missing $DEPLOY_ENV" >&2
  exit 1
fi

mkdir -p "$STATE_DIR"
set -a
source "$DEPLOY_ENV"
set +a

remote() {
  ssh -i "$SSH_KEY" -p "$VPS_SSH_PORT" "$VPS_USER@$VPS_HOST" "$@"
}

secret() {
  remote "k3s kubectl -n shanhuai-app get secret shanhuai-app-secret -o jsonpath='{.data.$1}'" \
    | base64 --decode
}

config_value() {
  remote "k3s kubectl -n shanhuai-app get configmap shanhuai-app-config -o jsonpath='{.data.$1}'"
}

stop_tunnel() {
  if [[ -S "$CONTROL_SOCKET" || -e "$CONTROL_SOCKET" ]]; then
    ssh -S "$CONTROL_SOCKET" -O exit "$VPS_USER@$VPS_HOST" >/dev/null 2>&1 || true
    rm -f "$CONTROL_SOCKET"
  fi
}

if [[ "$ACTION" == "down" ]]; then
  docker compose -f "$COMPOSE_FILE" down
  stop_tunnel
  exit 0
fi

if [[ "$ACTION" == "logs" ]]; then
  docker compose -f "$COMPOSE_FILE" logs -f --tail=200
  exit 0
fi

if [[ "$ACTION" != "up" ]]; then
  echo "Usage: $0 [up|down|logs]" >&2
  exit 2
fi

command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }
docker info >/dev/null

db_ip="$(remote "k3s kubectl -n shanhuai-infra get svc postgresql -o jsonpath='{.spec.clusterIP}'")"
redis_ip="$(remote "k3s kubectl -n shanhuai-infra get svc redis -o jsonpath='{.spec.clusterIP}'")"
nats_ip="$(remote "k3s kubectl -n shanhuai-infra get svc nats -o jsonpath='{.spec.clusterIP}'")"
mqtt_ip="$(remote "k3s kubectl -n shanhuai-infra get svc emqx -o jsonpath='{.spec.clusterIP}'")"

stop_tunnel
ssh -fN -M -S "$CONTROL_SOCKET" \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -i "$SSH_KEY" -p "$VPS_SSH_PORT" \
  -L "0.0.0.0:$DB_PORT:$db_ip:5432" \
  -L "0.0.0.0:$REDIS_PORT:$redis_ip:6379" \
  -L "0.0.0.0:$NATS_PORT:$nats_ip:4222" \
  -L "0.0.0.0:$MQTT_PORT:$mqtt_ip:1883" \
  "$VPS_USER@$VPS_HOST"

export REPORT_LOCAL_DATABASE_URL="$(secret DATABASE_URL | sed -E "s#@[^:/]+:5432/#@$TUNNEL_HOST:$DB_PORT/#")"
export REPORT_LOCAL_REDIS_URL="$(secret REDIS_URL | sed -E "s#@?[^/@:]+:6379#@$TUNNEL_HOST:$REDIS_PORT#")"
export REPORT_LOCAL_NATS_URL="nats://$TUNNEL_HOST:$NATS_PORT"
export REPORT_LOCAL_MQTT_URL="mqtt://$TUNNEL_HOST:$MQTT_PORT"
export JWT_ACCESS_SECRET="$(secret JWT_ACCESS_SECRET)"
export JWT_REFRESH_SECRET="$(secret JWT_REFRESH_SECRET)"
export REPORT_FORWARD_CREDENTIAL_KEY="$(secret REPORT_FORWARD_CREDENTIAL_KEY)"
export STORAGE_DRIVER="$(config_value STORAGE_DRIVER)"
export UPLOAD_BASE_URL="$(secret UPLOAD_BASE_URL)"
export JD_OSS_ACCESS_KEY_ID="$(secret JD_OSS_ACCESS_KEY_ID)"
export JD_OSS_ACCESS_KEY_SECRET="$(secret JD_OSS_ACCESS_KEY_SECRET)"
export JD_OSS_BUCKET="$(secret JD_OSS_BUCKET)"
export JD_OSS_ENDPOINT="$(secret JD_OSS_ENDPOINT)"
export JD_OSS_PUBLIC_BASE_URL="$(secret JD_OSS_PUBLIC_BASE_URL)"
export JD_OSS_REGION="$(secret JD_OSS_REGION)"

if ! docker run --rm --add-host host.docker.internal:host-gateway postgres:16-alpine \
  pg_isready -h "$TUNNEL_HOST" -p "$DB_PORT" -t 10 >/dev/null; then
  echo "Docker cannot reach the K3s PostgreSQL tunnel." >&2
  stop_tunnel
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans; then
  docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
  stop_tunnel
  exit 1
fi

echo "Local report stack is ready: http://localhost:$UI_PORT"
echo "Local test tasks are pinned to the local worker; K3s production tasks remain on K3s."
echo "Use '$0 logs' to follow logs and '$0 down' to stop the local stack."
