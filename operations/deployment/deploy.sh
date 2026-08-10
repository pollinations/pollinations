#!/usr/bin/env bash

set -euo pipefail

APP_PATH=${1:-}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

if [[ -z "$APP_PATH" || ! -f "$REPO_ROOT/$APP_PATH/deploy.json" ]]; then
    echo "Usage: operations/deployment/deploy.sh <app-path>" >&2
    exit 1
fi

MANIFEST="$REPO_ROOT/$APP_PATH/deploy.json"
APP_DIR="$REPO_ROOT/$APP_PATH"
APP_NAME=$(basename "$APP_PATH")

field() {
    MANIFEST="$MANIFEST" FIELD="$1" node -e '
        const config = require(process.env.MANIFEST);
        const value = config[process.env.FIELD];
        if (Array.isArray(value)) process.stdout.write(value.join("\n"));
        else if (value !== undefined && value !== null) process.stdout.write(String(value));
    '
}

run_command() {
    local command=$1
    [[ -z "$command" ]] || (cd "$APP_DIR" && bash -lc "$command")
}

verify_url() {
    local url=$1
    echo "Verifying $url"
    curl --fail --silent --show-error --output /dev/null \
        --retry 12 --retry-delay 10 --retry-all-errors "$url"
}

deploy_vps() {
    : "${POLLI_AZURE_HOST:?POLLI_AZURE_HOST is required}"
    : "${POLLI_AZURE_USER:?POLLI_AZURE_USER is required}"
    : "${POLLI_AZURE_SSH_KEY:?POLLI_AZURE_SSH_KEY is required}"

    local key_file
    key_file=$(mktemp)
    trap 'rm -f "$key_file"' EXIT
    printf '%s\n' "$POLLI_AZURE_SSH_KEY" > "$key_file"
    chmod 600 "$key_file"
    local ssh_options=(-i "$key_file" -o StrictHostKeyChecking=accept-new)
    local rsync_ssh="ssh -i $key_file -o StrictHostKeyChecking=accept-new"

    rsync -az --delete -e "$rsync_ssh" "$APP_DIR/" \
        "$POLLI_AZURE_USER@$POLLI_AZURE_HOST:/tmp/polli-deploy/"

    ssh "${ssh_options[@]}" "$POLLI_AZURE_USER@$POLLI_AZURE_HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
rsync -a --delete \
  --exclude '.env' \
  --exclude '*.pem' \
  --exclude 'data/' \
  --exclude '.venv/' \
  --exclude '.git/' \
  /tmp/polli-deploy/ /home/itachi/polli/
cd /home/itachi/polli
REQ_MARKER="$HOME/.polli-last-requirements.txt"
if ! cmp -s requirements.txt "$REQ_MARKER" 2>/dev/null; then
  ./.venv/bin/python -m pip install -r requirements.txt -q --no-deps
  cp requirements.txt "$REQ_MARKER"
fi
sudo systemctl restart polli.service
sleep 5
sudo systemctl is-active --quiet polli.service
rm -rf /tmp/polli-deploy
REMOTE
}

TARGET=$(field target)
INSTALL=$(field install)
BUILD=$(field build)
DEPLOY=$(field deploy)
OUTPUT=$(field output)
SUBDOMAIN=$(field subdomain)

echo "Deploying $APP_PATH ($TARGET)"

run_command "$INSTALL"
run_command "$BUILD"

case "$TARGET" in
    pages)
        OUTPUT=${OUTPUT:-dist}
        SUBDOMAIN=${SUBDOMAIN:-$APP_NAME}
        node "$SCRIPT_DIR/cloudflare-pages.cjs" "$APP_PATH" --phase=origin
        npx wrangler pages deploy "$APP_DIR/$OUTPUT" \
            --project-name="apps-$SUBDOMAIN" \
            --branch=production \
            --commit-dirty=true
        verify_url "https://$SUBDOMAIN.myceli.ai"
        node "$SCRIPT_DIR/cloudflare-pages.cjs" "$APP_PATH" --phase=cutover
        verify_url "https://$SUBDOMAIN.pollinations.ai"
        ;;
    worker)
        [[ -n "$DEPLOY" ]] || { echo "worker target requires deploy" >&2; exit 1; }
        run_command "$DEPLOY"
        if [[ -n "$SUBDOMAIN" ]]; then
            verify_url "https://$SUBDOMAIN.myceli.ai"
            verify_url "https://$SUBDOMAIN.pollinations.ai"
        fi
        ;;
    script)
        [[ -n "$DEPLOY" ]] || { echo "script target requires deploy" >&2; exit 1; }
        run_command "$DEPLOY"
        ;;
    vps)
        deploy_vps
        ;;
    *)
        echo "Unsupported deployment target: $TARGET" >&2
        exit 1
        ;;
esac

while IFS= read -r url; do
    [[ -z "$url" ]] || verify_url "$url"
done < <(field verify)

echo "Deployment complete: $APP_PATH"
