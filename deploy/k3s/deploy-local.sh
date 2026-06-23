#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.deploy}"

usage() {
  cat <<'EOF'
Usage:
  deploy/k3s/deploy-local.sh [--auto|--all|--api|--ui] [--skip-migrate] [--tag TAG] [--apply-manifest] [--dry-run]

Default:
  --auto  Compare current Git HEAD with the image tag deployed in K3s, then build
          and roll out only changed API/UI parts.

Examples:
  deploy/k3s/setup-local-ssh.sh
  deploy/k3s/deploy-local.sh --auto
  deploy/k3s/deploy-local.sh --api
  deploy/k3s/deploy-local.sh --ui
  deploy/k3s/deploy-local.sh --all --skip-migrate
  deploy/k3s/deploy-local.sh --auto --dry-run

Environment:
  ENV_FILE=/path/to/.env.deploy
  SHANHUAI_SSH_KEY=~/.ssh/shanhuai_k3s_deploy_ed25519
  SHANHUAI_LOCAL_CACHE=~/.cache/shanhuai-gc/buildkit
  DEPLOY_PLATFORM=linux/amd64
  PUBLIC_WEB_URL=http://36.151.143.235:30081
  BUILDX_BUILDER=desktop-linux
EOF
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Put VPS_HOST/VPS_USER/VPS_SSH_PORT in it first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${VPS_HOST:?Missing VPS_HOST in $ENV_FILE}"
: "${VPS_USER:?Missing VPS_USER in $ENV_FILE}"
VPS_SSH_PORT="${VPS_SSH_PORT:-22}"

NAMESPACE="${SHANHUAI_K3S_NAMESPACE:-shanhuai-app}"
DEPLOY_PLATFORM="${DEPLOY_PLATFORM:-linux/amd64}"
PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-http://$VPS_HOST:30081}"
SSH_KEY="${SHANHUAI_SSH_KEY:-$HOME/.ssh/shanhuai_k3s_deploy_ed25519}"
CACHE_ROOT="${SHANHUAI_LOCAL_CACHE:-$HOME/.cache/shanhuai-gc/buildkit}"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

AUTO=true
DEPLOY_API=false
DEPLOY_UI=false
SKIP_MIGRATE=false
APPLY_MANIFEST=false
DRY_RUN=false
TAG=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --auto)
      AUTO=true
      ;;
    --all)
      AUTO=false
      DEPLOY_API=true
      DEPLOY_UI=true
      ;;
    --api)
      AUTO=false
      DEPLOY_API=true
      ;;
    --ui)
      AUTO=false
      DEPLOY_UI=true
      ;;
    --skip-migrate)
      SKIP_MIGRATE=true
      ;;
    --apply-manifest)
      APPLY_MANIFEST=true
      DEPLOY_API=true
      DEPLOY_UI=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --tag)
      shift
      TAG="${1:-}"
      if [ -z "$TAG" ]; then
        echo "--tag requires a value." >&2
        exit 1
      fi
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd ssh

if [ "$DRY_RUN" = false ]; then
  require_cmd docker
  require_cmd gzip
  require_cmd curl
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "Missing SSH key: $SSH_KEY" >&2
  echo "Run: deploy/k3s/setup-local-ssh.sh" >&2
  exit 1
fi

SSH_OPTS=(
  -i "$SSH_KEY"
  -p "$VPS_SSH_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=4
)
REMOTE="$VPS_USER@$VPS_HOST"

ssh_remote() {
  ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"
}

if ! ssh_remote true >/dev/null 2>&1; then
  echo "SSH key login failed for $REMOTE." >&2
  echo "Run: deploy/k3s/setup-local-ssh.sh" >&2
  exit 1
fi

if [ -z "$TAG" ]; then
  GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
  TAG="$GIT_SHA"
  if [ -n "$(git -C "$ROOT_DIR" status --porcelain -- api ui deploy/k3s/shanhuai-app.yaml)" ]; then
    TAG="$TAG-dirty-$(date +%Y%m%d%H%M%S)"
  fi
else
  GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
fi

API_IMAGE="shanhuai-api:local-$TAG"
MIGRATE_IMAGE="shanhuai-migrate:local-$TAG"
UI_IMAGE="shanhuai-ui:local-$TAG"

deployment_exists() {
  ssh_remote "k3s kubectl -n '$NAMESPACE' get deployment/$1 >/dev/null 2>&1"
}

deployment_image() {
  ssh_remote "k3s kubectl -n '$NAMESPACE' get deployment/$1 -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true"
}

image_git_sha() {
  local image="$1"
  case "$image" in
    *:local-*)
      image="${image##*:local-}"
      echo "${image%%-*}"
      ;;
    *:prd-*)
      image="${image##*:prd-}"
      echo "${image%%-*}"
      ;;
    *)
      echo ""
      ;;
  esac
}

git_ref_exists() {
  git -C "$ROOT_DIR" rev-parse --verify --quiet "$1^{commit}" >/dev/null 2>&1
}

has_changes_since() {
  local base="$1"
  shift

  if [ -z "$base" ] || ! git_ref_exists "$base"; then
    return 0
  fi

  if ! git -C "$ROOT_DIR" diff --quiet "$base"..HEAD -- "$@"; then
    return 0
  fi

  if [ -n "$(git -C "$ROOT_DIR" status --porcelain -- "$@")" ]; then
    return 0
  fi

  return 1
}

select_changed_parts() {
  if ! deployment_exists shanhuai-api || ! deployment_exists shanhuai-ui; then
    APPLY_MANIFEST=true
    DEPLOY_API=true
    DEPLOY_UI=true
    return
  fi

  local api_base
  local ui_base
  api_base="$(image_git_sha "$(deployment_image shanhuai-api)")"
  ui_base="$(image_git_sha "$(deployment_image shanhuai-ui)")"

  if has_changes_since "$api_base" api deploy/k3s/shanhuai-app.yaml; then
    DEPLOY_API=true
  fi

  if has_changes_since "$ui_base" ui deploy/k3s/shanhuai-app.yaml; then
    DEPLOY_UI=true
  fi

  if has_changes_since "$api_base" deploy/k3s/shanhuai-app.yaml || has_changes_since "$ui_base" deploy/k3s/shanhuai-app.yaml; then
    APPLY_MANIFEST=true
    DEPLOY_API=true
    DEPLOY_UI=true
  fi
}

promote_cache() {
  local cache_dir="$1"
  if [ -d "$cache_dir-new" ]; then
    rm -rf "$cache_dir"
    mv "$cache_dir-new" "$cache_dir"
  fi
}

build_image() {
  local image="$1"
  local cache_name="$2"
  shift 2

  if docker image inspect "$image" >/dev/null 2>&1; then
    echo "Using existing local image: $image"
    return
  fi

  local cache_dir="$CACHE_ROOT/$cache_name"
  mkdir -p "$cache_dir"
  rm -rf "$cache_dir-new"

  if [ -n "${BUILDX_BUILDER:-}" ]; then
    docker buildx build \
      --builder "$BUILDX_BUILDER" \
      --platform "$DEPLOY_PLATFORM" \
      --load \
      --tag "$image" \
      --cache-from "type=local,src=$cache_dir" \
      --cache-to "type=local,dest=$cache_dir-new,mode=max" \
      "$@"
  else
    docker buildx build \
      --platform "$DEPLOY_PLATFORM" \
      --load \
      --tag "$image" \
      --cache-from "type=local,src=$cache_dir" \
      --cache-to "type=local,dest=$cache_dir-new,mode=max" \
      "$@"
  fi

  promote_cache "$cache_dir"
}

import_image() {
  local image="$1"
  echo "Importing $image into K3s on $VPS_HOST..."
  docker save "$image" \
    | gzip -1 \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" 'gzip -d | k3s ctr images import -'
}

ensure_manifests() {
  if [ "$APPLY_MANIFEST" = true ] || ! ssh_remote "k3s kubectl -n '$NAMESPACE' get deployment/shanhuai-api deployment/shanhuai-ui >/dev/null 2>&1"; then
    echo "Applying K3s app manifest..."
    ssh "${SSH_OPTS[@]}" "$REMOTE" 'cat > /tmp/shanhuai-app.yaml && k3s kubectl apply -f /tmp/shanhuai-app.yaml' < "$ROOT_DIR/deploy/k3s/shanhuai-app.yaml"
    DEPLOY_API=true
    DEPLOY_UI=true
  fi

  if ! ssh_remote "k3s kubectl -n '$NAMESPACE' get secret/shanhuai-app-secret >/dev/null 2>&1"; then
    echo "Missing Kubernetes secret: $NAMESPACE/shanhuai-app-secret" >&2
    echo "Create it from the server-side /srv/shanhuai/secrets/infra.env before deploying the app." >&2
    exit 1
  fi
}

run_migrations() {
  local job="shanhuai-migrate-$(date +%Y%m%d%H%M%S)"
  echo "Running database migrations with $MIGRATE_IMAGE..."

  ssh "${SSH_OPTS[@]}" "$REMOTE" "k3s kubectl apply -f -" <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: $job
  namespace: $NAMESPACE
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 86400
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: $MIGRATE_IMAGE
          imagePullPolicy: IfNotPresent
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: shanhuai-app-secret
                  key: DATABASE_URL
YAML

  if ! ssh_remote "k3s kubectl -n '$NAMESPACE' wait --for=condition=complete job/$job --timeout=10m"; then
    ssh_remote "k3s kubectl -n '$NAMESPACE' logs job/$job --all-containers=true --tail=200 || true"
    exit 1
  fi
}

annotate_deployment() {
  local deployment="$1"
  local image="$2"
  ssh_remote "k3s kubectl -n '$NAMESPACE' annotate deployment/$deployment shanhuai.gc/git-sha='$GIT_SHA' shanhuai.gc/image='$image' shanhuai.gc/deployed-at='$DEPLOYED_AT' --overwrite >/dev/null"
}

rollout_api() {
  echo "Rolling out API: $API_IMAGE"
  ssh_remote "k3s kubectl -n '$NAMESPACE' set image deployment/shanhuai-api api='$API_IMAGE'"
  annotate_deployment shanhuai-api "$API_IMAGE"
  ssh_remote "k3s kubectl -n '$NAMESPACE' rollout status deployment/shanhuai-api --timeout=8m"
}

rollout_ui() {
  echo "Rolling out UI: $UI_IMAGE"
  ssh_remote "k3s kubectl -n '$NAMESPACE' set image deployment/shanhuai-ui ui='$UI_IMAGE'"
  annotate_deployment shanhuai-ui "$UI_IMAGE"
  ssh_remote "k3s kubectl -n '$NAMESPACE' rollout status deployment/shanhuai-ui --timeout=5m"
}

verify_public_endpoint() {
  echo "Verifying $PUBLIC_WEB_URL ..."
  curl -fsS --connect-timeout 10 "$PUBLIC_WEB_URL/" >/dev/null
  curl -fsS --connect-timeout 10 "$PUBLIC_WEB_URL/health" >/dev/null
  ssh_remote "k3s kubectl -n '$NAMESPACE' get pods,svc -o wide"
}

if [ "$AUTO" = true ]; then
  select_changed_parts
fi

if [ "$DEPLOY_API" = false ] && [ "$DEPLOY_UI" = false ]; then
  echo "No API/UI changes detected. Nothing to deploy."
  exit 0
fi

echo "Target: $REMOTE / namespace=$NAMESPACE / platform=$DEPLOY_PLATFORM / tag=$TAG"
echo "Deploy API: $DEPLOY_API"
echo "Deploy UI : $DEPLOY_UI"

if [ "$DRY_RUN" = true ]; then
  echo "Dry run only. No build/import/rollout was performed."
  exit 0
fi

ensure_manifests

if [ "$DEPLOY_API" = true ]; then
  build_image "$API_IMAGE" api \
    --build-arg "CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-1}" \
    "$ROOT_DIR/api"
  build_image "$MIGRATE_IMAGE" migrate \
    --file "$ROOT_DIR/api/Dockerfile.migrate" \
    "$ROOT_DIR/api"
  import_image "$API_IMAGE"
  import_image "$MIGRATE_IMAGE"

  if [ "$SKIP_MIGRATE" = false ]; then
    run_migrations
  fi

  rollout_api
fi

if [ "$DEPLOY_UI" = true ]; then
  build_image "$UI_IMAGE" ui \
    --build-arg "VITE_API_URL=$PUBLIC_WEB_URL" \
    "$ROOT_DIR/ui"
  import_image "$UI_IMAGE"
  rollout_ui
fi

verify_public_endpoint
