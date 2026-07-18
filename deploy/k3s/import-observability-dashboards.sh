#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.deploy"
DASHBOARD_DIR="$ROOT_DIR/deploy/k3s/observability/dashboards"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/shanhuai_k3s_deploy_ed25519}"
REMOTE_OPS_DIR="${REMOTE_OPS_DIR:-/srv/shanhuai/ops/observability}"
REMOTE_DASHBOARD_DIR="$REMOTE_OPS_DIR/dashboards"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-/srv/shanhuai/secrets/observability.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Run deploy/k3s/setup-local-ssh.sh first if this is a new machine." >&2
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "Missing SSH key $SSH_KEY. Run deploy/k3s/setup-local-ssh.sh first." >&2
  exit 1
fi

if ! compgen -G "$DASHBOARD_DIR/*.json" >/dev/null; then
  echo "No dashboard JSON files found in $DASHBOARD_DIR." >&2
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

echo "Uploading dashboards to $VPS_USER@$VPS_HOST:$REMOTE_DASHBOARD_DIR"
ssh_remote "mkdir -p '$REMOTE_DASHBOARD_DIR'"
scp -i "$SSH_KEY" -P "$VPS_SSH_PORT" -o StrictHostKeyChecking=accept-new \
  "$DASHBOARD_DIR"/*.json \
  "$VPS_USER@$VPS_HOST:$REMOTE_DASHBOARD_DIR/"

echo "Importing dashboards into Grafana"
ssh_remote "REMOTE_DASHBOARD_DIR='$REMOTE_DASHBOARD_DIR' REMOTE_ENV_FILE='$REMOTE_ENV_FILE' bash -s" <<'REMOTE'
set -Eeuo pipefail

if [ ! -f "$REMOTE_ENV_FILE" ]; then
  echo "Missing $REMOTE_ENV_FILE on server. Deploy observability first." >&2
  exit 1
fi

. "$REMOTE_ENV_FILE"
export GRAFANA_ADMIN_USER GRAFANA_ADMIN_PASSWORD REMOTE_DASHBOARD_DIR

python3 - <<'PY'
import base64
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base_url = "http://127.0.0.1:30082"
user = os.environ.get("GRAFANA_ADMIN_USER", "admin")
password = os.environ["GRAFANA_ADMIN_PASSWORD"]
dashboard_dir = Path(os.environ["REMOTE_DASHBOARD_DIR"])
auth_header = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


def request_json(method, path, payload=None):
    data = None
    headers = {"Authorization": auth_header}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = Request(base_url + path, data=data, headers=headers, method=method)
    with urlopen(req, timeout=20) as response:
        body = response.read()
    if not body:
        return {}
    return json.loads(body)


datasources = request_json("GET", "/api/datasources")
victoria_uid = next(
    item["uid"]
    for item in datasources
    if item.get("type") == "prometheus" and item.get("name") == "VictoriaMetrics"
)
loki_uid = next(
    item["uid"]
    for item in datasources
    if item.get("type") == "loki" and item.get("name") == "Loki"
)

try:
    request_json("GET", "/api/folders/shanhuai")
except HTTPError as exc:
    if exc.code != 404:
        raise
    request_json("POST", "/api/folders", {"uid": "shanhuai", "title": "Shanhuai"})


def replace_placeholders(value):
    if isinstance(value, dict):
        return {key: replace_placeholders(item) for key, item in value.items()}
    if isinstance(value, list):
        return [replace_placeholders(item) for item in value]
    if isinstance(value, str):
        return value.replace("__VICTORIA_UID__", victoria_uid).replace("__LOKI_UID__", loki_uid)
    return value


for dashboard_path in sorted(dashboard_dir.glob("*.json")):
    dashboard = replace_placeholders(json.loads(dashboard_path.read_text()))
    payload = {
        "dashboard": dashboard,
        "folderUid": "shanhuai",
        "message": "Import Shanhuai observability dashboard",
        "overwrite": True,
    }
    result = request_json("POST", "/api/dashboards/db", payload)
    print(f"Imported {dashboard['title']}: {result.get('url', '')}")
PY
REMOTE
