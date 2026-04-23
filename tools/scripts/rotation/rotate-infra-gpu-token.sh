#!/bin/bash
# Rotate PLN_GPU_TOKEN — the token EC2 image service + enter worker (ACE-Step)
# use to authenticate requests to GPU worker instances.
#
# Usage: ./rotate-infra-gpu-token.sh [--execute] [NEW_TOKEN]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Trust boundary: EC2 image + enter worker → GPU workers (RunPod + Lambda Labs)
#
# Order matters:
#   1. SOPS → PR → main → production → deploy-enter-services triggers
#      (EC2 image redeploys with new token, starts sending new to GPUs)
#   2. SSH fan-out to 3 GPU hosts (each host's .env is replaced + workers restart)
#   3. Wrangler secret put (enter worker switches to new)
#
# Rejection windows (unavoidable without multi-token acceptance in GPU workers):
#   - After step 1, before step 2: image EC2 sends new to GPUs with old → ~2min
#   - After step 2, before step 3: enter sends old to updated GPUs → ~5s
# Both are minimised by running SSH + Wrangler back-to-back post-deploy.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
REPO="pollinations/pollinations"
ENTER_DIR="$REPO_ROOT/enter.pollinations.ai"

DRY_RUN=true
PROVIDED_TOKEN=""
while [ $# -gt 0 ]; do
    case "$1" in
        --execute) DRY_RUN=false; shift ;;
        --*) echo "Unknown flag: $1"; exit 1 ;;
        *)
            if [ -n "$PROVIDED_TOKEN" ]; then
                echo "Multiple positional args: '$PROVIDED_TOKEN' and '$1'"
                exit 1
            fi
            PROVIDED_TOKEN="$1"
            shift
            ;;
    esac
done

if [ -n "$PROVIDED_TOKEN" ] && ! [[ "$PROVIDED_TOKEN" =~ ^[A-Za-z0-9_-]{16,128}$ ]]; then
    echo "PROVIDED_TOKEN must be 16-128 chars of [A-Za-z0-9_-] (got ${#PROVIDED_TOKEN} chars)."
    echo "Reject shell-metacharacter tokens — they're interpolated into remote sed commands."
    exit 1
fi

source "$SCRIPT_DIR/_log.sh"
source "$SCRIPT_DIR/_pr-deploy.sh"

wrangler_cmd() {
    if [ -x "$REPO_ROOT/node_modules/.bin/wrangler" ]; then
        "$REPO_ROOT/node_modules/.bin/wrangler" "$@"
    else
        npx wrangler "$@"
    fi
}

SOPS_FILES=(
    "$REPO_ROOT/image.pollinations.ai/secrets/env.json"
    "$ENTER_DIR/secrets/dev.vars.json"
    "$ENTER_DIR/secrets/staging.vars.json"
    "$ENTER_DIR/secrets/prod.vars.json"
)
SOPS_SECRETS_SSH_SOURCE="$ENTER_DIR/secrets/prod.vars.json"
DEPLOY_WORKFLOW="deploy-enter-services.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
# GPU token gates image.pollinations.ai → GPU worker calls; verify image gen E2E
HEALTH_IMAGE_MODEL="zimage"

SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

extract_ssh_key() {
    local sops_key=$1
    local out="$TEMP_DIR/$sops_key"
    if ! sops -d "$SOPS_SECRETS_SSH_SOURCE" | jq -e -r --arg key "$sops_key" '.[$key] | select(. != null and . != "")' > "$out"; then
        return 1
    fi
    chmod 600 "$out"
    echo "$out"
}

verify_ssh_host() {
    local label=$1
    local host=$2
    local port=$3
    local ssh_key=$4
    local output
    local status

    set +e
    if [ -n "$port" ]; then
        output=$(ssh $SSH_OPTS -p "$port" -i "$ssh_key" "$host" "echo ok" 2>&1)
    else
        output=$(ssh $SSH_OPTS -i "$ssh_key" "$host" "echo ok" 2>&1)
    fi
    status=$?
    set -e

    if [ $status -eq 0 ]; then
        log "  SSH OK: $label"
    else
        error "SSH failed: $label"
        echo "  $output"
        return 1
    fi
}

#######################################
# Update token on a remote GPU host + restart workers
#######################################
update_remote_env() {
    local host=$1
    local port=$2
    local ssh_key=$3
    local env_path=$4
    local label=$5
    local restart_kind=$6
    local new_token=$7

    local ssh_target
    if [ -n "$port" ]; then
        ssh_target="ssh $SSH_OPTS -p $port -i $ssh_key $host"
    else
        ssh_target="ssh $SSH_OPTS -i $ssh_key $host"
    fi

    if $ssh_target "bash -s" <<REMOTE_EOF
        ENV_FILE="$env_path"
        RESTART_KIND="$restart_kind"
        if [ -f "\$ENV_FILE" ]; then
            sed -i 's/^PLN_GPU_TOKEN=.*/PLN_GPU_TOKEN=${new_token}/' "\$ENV_FILE"
            if ! grep -q PLN_GPU_TOKEN "\$ENV_FILE"; then
                echo "PLN_GPU_TOKEN=${new_token}" >> "\$ENV_FILE"
            fi
        else
            echo "PLN_GPU_TOKEN=${new_token}" > "\$ENV_FILE"
        fi
        VERIFY=\$(grep PLN_GPU_TOKEN "\$ENV_FILE" | cut -d= -f2)
        echo "  remote: \${ENV_FILE} now PLN_GPU_TOKEN=\${VERIFY:0:8}..."

        start_screen_worker() {
            local name=\$1 workdir=\$2 gpu=\$3 port=\$4 public_ip=\$5 service_type=\$6 log_file=\$7
            screen -S "\$name" -X quit 2>/dev/null || true
            screen -dmS "\$name" bash -lc "cd '\$workdir' && set -a && [ -f \$HOME/.env ] && source \$HOME/.env && set +a && source venv/bin/activate && CUDA_VISIBLE_DEVICES=\$gpu PORT=\$port PUBLIC_IP=\$public_ip PUBLIC_PORT=443 SERVICE_TYPE=\$service_type python server.py 2>&1 | tee \$log_file"
        }

        case "\$RESTART_KIND" in
            flux_zimage_screen)
                command -v screen >/dev/null 2>&1 || { echo "screen not available"; exit 1; }
                start_screen_worker flux-gpu0 /opt/pollinations/image.pollinations.ai/nunchaku 0 8765 hsl3ksl31lvrcc-8765.proxy.runpod.net flux /tmp/flux-gpu0.log
                start_screen_worker flux-gpu1 /opt/pollinations/image.pollinations.ai/nunchaku 1 8766 hsl3ksl31lvrcc-8766.proxy.runpod.net flux /tmp/flux-gpu1.log
                start_screen_worker zimage-gpu2 /opt/pollinations/image.pollinations.ai/z-image 2 8767 hsl3ksl31lvrcc-8767.proxy.runpod.net zimage /tmp/zimage-gpu2.log
                start_screen_worker zimage-gpu3 /opt/pollinations/image.pollinations.ai/z-image 3 8768 hsl3ksl31lvrcc-8768.proxy.runpod.net zimage /tmp/zimage-gpu3.log
                screen -ls
                ;;
            klein_workspace)
                [ -f /workspace/restart.sh ] || { echo "missing /workspace/restart.sh"; exit 1; }
                bash /workspace/restart.sh
                ;;
            gh200_systemd)
                sudo systemctl restart ltx2.service acestep.service sana.service
                ;;
        esac
REMOTE_EOF
    then
        log "  $label: updated + restarted"
    else
        error "  $label: update or restart FAILED"
        return 1
    fi
}

#######################################
# Pre-flight
#######################################
section "Pre-flight: checks"

cd "$REPO_ROOT"

if ! $DRY_RUN; then
    if [ -n "$(git status --porcelain)" ]; then
        error "Working tree not clean — commit or stash before --execute."
        git status --short
        exit 1
    fi
fi

if ! command -v gh >/dev/null || ! gh auth status >/dev/null 2>&1; then
    error "gh CLI not authenticated."
    exit 1
fi

if ! wrangler_cmd whoami >/dev/null 2>&1; then
    error "wrangler not authenticated."
    exit 1
fi

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    if [ ! -f "$f" ] || ! sops -d "$f" | jq -e 'has("PLN_GPU_TOKEN")' >/dev/null; then
        error "PLN_GPU_TOKEN missing from $fname"
        exit 1
    fi
done
log "SOPS: PLN_GPU_TOKEN present in all 4 target files"

if [ ! -f "$TESTING_TOKENS_FILE" ]; then
    error "Required for provider-specific health check: $TESTING_TOKENS_FILE"
    exit 1
fi
TEST_TOKEN=$(grep -E '^ENTER_API_TOKEN_REMOTE=' "$TESTING_TOKENS_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$TEST_TOKEN" ]; then
    error "ENTER_API_TOKEN_REMOTE missing from $TESTING_TOKENS_FILE"
    exit 1
fi

section "Pre-flight: SSH reachability"
FLUX_ZIMAGE_KEY=$(extract_ssh_key SSH_RUNPOD_FLUX_ZIMAGE) || { error "Missing SSH_RUNPOD_FLUX_ZIMAGE in SOPS"; exit 1; }
KLEIN_KEY=$(extract_ssh_key SSH_RUNPOD_KLEIN) || { error "Missing SSH_RUNPOD_KLEIN in SOPS"; exit 1; }
LAMBDA_KEY=$(extract_ssh_key SSH_LAMBDA_SANA_LTX2_ACESTEP) || { error "Missing SSH_LAMBDA_SANA_LTX2_ACESTEP in SOPS"; exit 1; }

verify_ssh_host "RunPod Flux+Z-Image" "root@38.65.239.17" "19489" "$FLUX_ZIMAGE_KEY" || exit 1
verify_ssh_host "RunPod Klein" "root@213.144.200.243" "10207" "$KLEIN_KEY" || exit 1
verify_ssh_host "Lambda GH200" "ubuntu@192.222.51.105" "" "$LAMBDA_KEY" || exit 1

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Generate new PLN_GPU_TOKEN (openssl rand -hex 32)"
    echo "  2. Update SOPS (4 files: image + enter dev/staging/prod)"
    echo "  3. Open PR: rotate/gpu-token-<date> → main, auto-merge"
    echo "  4. Push main → production (admin) → deploy-enter-services deploys EC2"
    echo "  5. SSH fan-out: update .env + restart workers on 3 GPU hosts"
    echo "  6. Wrangler secret put (enter worker switches to new token)"
    echo "  7. Health check via $GEN_BASE/image/{prompt}?model=$HEALTH_IMAGE_MODEL (verifies GPU token end-to-end)"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# 1. Generate or use provided token
#######################################
if [ -n "$PROVIDED_TOKEN" ]; then
    section "Using provided token"
    NEW_TOKEN="$PROVIDED_TOKEN"
else
    section "Generating new PLN_GPU_TOKEN"
    NEW_TOKEN=$(openssl rand -hex 32)
fi
log "Token: ${NEW_TOKEN:0:4}...${NEW_TOKEN: -4}"

#######################################
# 2. Update SOPS
#######################################
section "Updating SOPS-encrypted files"

for f in "${SOPS_FILES[@]}"; do
    fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
    sops --set "[\"PLN_GPU_TOKEN\"] $(printf '%s' "$NEW_TOKEN" | jq -Rs .)" "$f"
    log "  $fname updated"
done

#######################################
# 3. PR + deploy (image EC2 picks up new token)
#######################################
section "Opening PR and deploying"

BRANCH="rotate/gpu-token-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${SOPS_FILES[@]}"
git commit -m "rotate: PLN_GPU_TOKEN"

open_pr_and_merge "$BRANCH" \
    "rotate: PLN_GPU_TOKEN" \
    "Rotates \`PLN_GPU_TOKEN\` (EC2 image + enter worker → GPU workers). Updates 4 SOPS files. After merge, main→production triggers EC2 image deploy; the script then SSH-fans-out to GPU hosts, then updates the Wrangler secret so the worker switches too. Automated by \`rotate-infra-gpu-token.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. GPUs still have OLD token, EC2 now has NEW. Production is in a broken state — SSH fan-out not attempted."
    exit 1
}

#######################################
# 7. SSH fan-out to GPU hosts (close the image↔GPU rejection window)
#######################################
section "Updating GPU hosts via SSH"

update_remote_env 'root@38.65.239.17' '19489' "$FLUX_ZIMAGE_KEY" '$HOME/.env' \
    'RunPod hsl3ksl31lvrcc (Flux+Z-Image)' 'flux_zimage_screen' "$NEW_TOKEN" || {
    error "SSH fan-out failed for Flux+Z-Image host. Fix manually."
    exit 1
}
update_remote_env 'root@213.144.200.243' '10207' "$KLEIN_KEY" '/workspace/.env' \
    'RunPod pi90tfk3sa9t12 (Klein)' 'klein_workspace' "$NEW_TOKEN" || {
    error "SSH fan-out failed for Klein host. Fix manually."
    exit 1
}
update_remote_env 'ubuntu@192.222.51.105' '' "$LAMBDA_KEY" '$HOME/.env' \
    'Lambda GH200 (LTX-2+ACE-Step+Sana)' 'gh200_systemd' "$NEW_TOKEN" || {
    error "SSH fan-out failed for Lambda GH200 host. Fix manually."
    exit 1
}

#######################################
# 8. Wrangler secret put (enter worker switches to new token)
#######################################
section "Updating Wrangler secret (enter worker switches to new token)"

for env in production staging; do
    echo "$NEW_TOKEN" | wrangler_cmd secret put PLN_GPU_TOKEN --env "$env" --config "$ENTER_DIR/wrangler.toml"
    log "  wrangler: $env"
done

#######################################
# 9. Health check (image generation E2E — verifies GPU workers got the new token)
#######################################
section "Health check (image: $HEALTH_IMAGE_MODEL)"

HC_TMP=$(mktemp)
trap 'rm -f "$HC_TMP"' EXIT
HC_META=$(curl -sS --max-time 120 -o "$HC_TMP" \
    -w "%{http_code}|%{content_type}|%{size_download}" \
    "$GEN_BASE/image/healthcheck%20cat?model=$HEALTH_IMAGE_MODEL&width=512&height=512&nologo=true&seed=$(date +%s)" \
    -H "Authorization: Bearer $TEST_TOKEN")
HC_CODE="${HC_META%%|*}"
HC_REST="${HC_META#*|}"
HC_CT="${HC_REST%%|*}"
HC_SIZE="${HC_REST#*|}"
if [ "$HC_CODE" != "200" ] || ! echo "$HC_CT" | grep -q "^image/"; then
    error "Health check failed: HTTP $HC_CODE content-type=$HC_CT"
    error "Body preview: $(head -c 500 "$HC_TMP")"
    error "Likely cause: a GPU worker (Flux/Z-Image/Klein/LTX-2) didn't pick up the new token."
    exit 1
fi
log "Health check OK: $HC_CT, $HC_SIZE bytes"
rm -f "$HC_TMP"; trap - EXIT

#######################################
# Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "PLN_GPU_TOKEN Rotation Complete"
echo ""
log "New token: ${NEW_TOKEN:0:4}...${NEW_TOKEN: -4}"
echo ""
log "SOPS + EC2 image + GPU hosts (3) + enter worker now aligned on the new token."
