#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.deploy}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Put VPS_HOST/VPS_USER/VPS_PASSWORD/VPS_SSH_PORT in it first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${VPS_HOST:?Missing VPS_HOST in $ENV_FILE}"
: "${VPS_USER:?Missing VPS_USER in $ENV_FILE}"
: "${VPS_PASSWORD:?Missing VPS_PASSWORD in $ENV_FILE}"
VPS_SSH_PORT="${VPS_SSH_PORT:-22}"

SSH_KEY="${SHANHUAI_SSH_KEY:-$HOME/.ssh/shanhuai_k3s_deploy_ed25519}"
SSH_PUB_KEY="$SSH_KEY.pub"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ ! -f "$SSH_KEY" ]; then
  ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "shanhuai-k3s-deploy@$(hostname)"
fi

chmod 600 "$SSH_KEY"

if ssh -i "$SSH_KEY" \
  -p "$VPS_SSH_PORT" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  "$VPS_USER@$VPS_HOST" true >/dev/null 2>&1; then
  echo "SSH key login already works: $VPS_USER@$VPS_HOST"
  exit 0
fi

if ! command -v expect >/dev/null 2>&1; then
  echo "expect is required for the one-time password login step." >&2
  echo "Install it or manually append $SSH_PUB_KEY to $VPS_USER@$VPS_HOST:~/.ssh/authorized_keys." >&2
  exit 1
fi

VPS_PASSWORD="$VPS_PASSWORD" expect -f - "$VPS_HOST" "$VPS_USER" "$VPS_SSH_PORT" "$SSH_PUB_KEY" <<'EXPECT'
set timeout 60
log_user 0
set host [lindex $argv 0]
set user [lindex $argv 1]
set port [lindex $argv 2]
set pub_key_file [lindex $argv 3]
set password $env(VPS_PASSWORD)

set fd [open $pub_key_file r]
set pub_key [string trim [read $fd]]
close $fd

set remote_cmd "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qxF '$pub_key' ~/.ssh/authorized_keys || printf '%s\\n' '$pub_key' >> ~/.ssh/authorized_keys) && chmod 600 ~/.ssh/authorized_keys"

spawn ssh -p $port -o StrictHostKeyChecking=accept-new $user@$host $remote_cmd
expect {
  "*continue connecting*" {
    send "yes\r"
    exp_continue
  }
  "*assword:" {
    send "$password\r"
    after 500
  }
  "*Permission denied*" {
    exit 1
  }
  timeout {
    exit 1
  }
  eof {
    exit 1
  }
}
expect eof
set result [wait]
exit [lindex $result 3]
EXPECT

if ssh -i "$SSH_KEY" \
  -p "$VPS_SSH_PORT" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  "$VPS_USER@$VPS_HOST" true >/dev/null; then
  echo "SSH key login configured: $VPS_USER@$VPS_HOST"
else
  echo "SSH key login still failed. Check server ~/.ssh/authorized_keys permissions." >&2
  exit 1
fi
