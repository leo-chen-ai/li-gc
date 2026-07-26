#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_ENV="$ROOT_DIR/.env.deploy"
MANIFEST="$ROOT_DIR/deploy/k3s/integration-mock.yaml"
CONTEXT="$ROOT_DIR/integration-mock"
SSH_KEY="${SHANHUAI_SSH_KEY:-$HOME/.ssh/shanhuai_k3s_deploy_ed25519}"
PLATFORM="${DEPLOY_PLATFORM:-linux/amd64}"
NAMESPACE="shanhuai-mock"
DEPLOYMENT="shanhuai-integration-mock"
NINGBO_APP_KEY="${MOCK_NINGBO_APP_KEY:-mock-ningbo-app-key}"
NINGBO_APP_SECRET="${MOCK_NINGBO_APP_SECRET:-mock-ningbo-secret}"
XINLEDA_APP_ID="${MOCK_XINLEDA_APP_ID:-mock-xinleda-app}"
XINLEDA_APP_SECRET="${MOCK_XINLEDA_APP_SECRET:-1234567890abcdef}"
YONGXIN_APP_KEY="${MOCK_YONGXIN_APP_KEY:-mock-yongxin-app}"
YONGXIN_APP_SECRET="${MOCK_YONGXIN_APP_SECRET:-1234567890abcdef}"

if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "Missing $DEPLOY_ENV" >&2
  exit 1
fi
if [[ ! -f "$SSH_KEY" ]]; then
  echo "Missing SSH key $SSH_KEY. Run deploy/k3s/setup-local-ssh.sh first." >&2
  exit 1
fi

set -a
source "$DEPLOY_ENV"
set +a

git_sha="$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
if [[ -n "$(git -C "$ROOT_DIR" status --short -- integration-mock deploy/k3s/integration-mock.yaml deploy/k3s/deploy-integration-mock.sh)" ]]; then
  tag="local-${git_sha}-dirty-$(date +%Y%m%d%H%M%S)"
else
  tag="local-${git_sha}"
fi
image="$DEPLOYMENT:$tag"

remote() {
  ssh -i "$SSH_KEY" -p "$VPS_SSH_PORT" "$VPS_USER@$VPS_HOST" "$@"
}

echo "Building $image for $PLATFORM"
docker buildx build --platform "$PLATFORM" --load -t "$image" "$CONTEXT"

echo "Importing $image into K3s"
docker save "$image" | gzip -1 | ssh -i "$SSH_KEY" -p "$VPS_SSH_PORT" \
  "$VPS_USER@$VPS_HOST" "gzip -d | k3s ctr images import -"

echo "Creating namespace and persistent mock credentials"
remote "k3s kubectl create namespace $NAMESPACE --dry-run=client -o yaml | k3s kubectl apply -f -"
admin_token="$(remote "if k3s kubectl -n $NAMESPACE get secret shanhuai-integration-mock-secrets >/dev/null 2>&1; then k3s kubectl -n $NAMESPACE get secret shanhuai-integration-mock-secrets -o jsonpath='{.data.MOCK_ADMIN_TOKEN}' | base64 -d; else openssl rand -hex 24; fi")"
remote "k3s kubectl -n $NAMESPACE create secret generic shanhuai-integration-mock-secrets \
  --from-literal=MOCK_ADMIN_TOKEN='$admin_token' \
  --from-literal=MOCK_NINGBO_APP_KEY='$NINGBO_APP_KEY' \
  --from-literal=MOCK_NINGBO_APP_SECRET='$NINGBO_APP_SECRET' \
  --from-literal=MOCK_XINLEDA_APP_ID='$XINLEDA_APP_ID' \
  --from-literal=MOCK_XINLEDA_APP_SECRET='$XINLEDA_APP_SECRET' \
  --from-literal=MOCK_YONGXIN_APP_KEY='$YONGXIN_APP_KEY' \
  --from-literal=MOCK_YONGXIN_APP_SECRET='$YONGXIN_APP_SECRET' \
  --dry-run=client -o yaml | k3s kubectl apply -f -"
unset admin_token

echo "Applying manifests"
sed "s|image: shanhuai-integration-mock:local|image: $image|" "$MANIFEST" \
  | ssh -i "$SSH_KEY" -p "$VPS_SSH_PORT" "$VPS_USER@$VPS_HOST" "k3s kubectl apply -f -"

remote "k3s kubectl -n $NAMESPACE rollout status deployment/$DEPLOYMENT --timeout=120s"
remote "k3s kubectl -n $NAMESPACE get deployment,pods,svc,pvc -o wide"

echo "Verifying public health endpoint"
curl -fsS --connect-timeout 10 "http://$VPS_HOST:30083/health"
echo
echo "Integration mock deployed: http://$VPS_HOST:30083"
echo "Cluster URL: http://$DEPLOYMENT.$NAMESPACE.svc.cluster.local:3000"
echo "Read the admin token with:"
echo "  ssh -i $SSH_KEY -p $VPS_SSH_PORT $VPS_USER@$VPS_HOST \"k3s kubectl -n $NAMESPACE get secret shanhuai-integration-mock-secrets -o jsonpath='{.data.MOCK_ADMIN_TOKEN}' | base64 -d\""
