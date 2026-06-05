#!/bin/bash
# Rotate PLN_GPU_TOKEN — the token gen image routes + enter worker (ACE-Step)
# use to authenticate requests to GPU worker instances.
#
# Usage: ./rotate-infra-gpu-token.sh [--execute] [NEW_TOKEN]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Trust boundary: gen image + enter worker → GPU workers (RunPod + Lambda Labs)
#
# Order matters:
#   1. SOPS → PR → main → production → deploy-gen-cloudflare triggers
#      (gen image redeploys with new token, starts sending new to GPUs)
#   2. SSH fan-out to the directly-reachable GPU hosts: 2× A4500 Z-Image pods
#      (token lives inline in /root/launch.sh) + Lambda GH200 ($HOME/.env). The
#      3090 Z-Image pod + Klein are RunPod relay-only (no non-interactive SSH) —
#      the script prints manual restart steps for them. flux is on Fireworks now
#      (no GPU host; the gen redeploy in step 1 is all it needs).
#   3. Wrangler secret put (enter worker switches to new)
#
# Rejection windows (unavoidable without multi-token acceptance in GPU workers):
#   - After step 1, before step 2: gen image sends new to GPUs with old → ~2min
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
    "$ENTER_DIR/secrets/dev.vars.json"
    "$ENTER_DIR/secrets/staging.vars.json"
    "$ENTER_DIR/secrets/prod.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/dev.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/staging.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/prod.vars.json"
)
SOPS_SECRETS_SSH_SOURCE="$ENTER_DIR/secrets/prod.vars.json"
DEPLOY_WORKFLOW="deploy-gen-cloudflare.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
# GPU token gates gen worker → GPU worker calls; verify image gen E2E
HEALTH_IMAGE_MODEL="zimage"

SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Z-Image A4500 pods: directly SSH-able with the local id_ed25519 key (BatchMode OK).
# host:port:label — re-check IDs/ports with `runpodctl get pod` + GraphQL runtime.ports.
ZIMAGE_A4500_KEY="$HOME/.ssh/id_ed25519"
ZIMAGE_A4500_HOSTS=(
    "root@213.144.200.205:10859:zimage-a4500-a (8ikeaa96szx665)"
    "root@213.144.200.205:11608:zimage-a4500-b (ft8emi5vavb7hr)"
)
# Relay-only hosts (RunPod ssh.runpod.io) cannot run non-interactive commands, so the
# script can't fan out to them. Operator must restart these manually after rotation.
RELAY_MANUAL_HOSTS=(
    "zimage-3090 (lrrdd9jggqg9su) — bash /root/launch.sh"
    "Klein (lqh6weiexk4sth) — bash /workspace/restart.sh"
)

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

        case "\$RESTART_KIND" in
            zimage_launch)
                # A4500 Z-Image pods keep PLN_GPU_TOKEN inline in /root/launch.sh as
                # \`export PLN_GPU_TOKEN='...'\` (no .env file). Patch that line, then
                # relaunch detached (launch.sh ends in \`exec python server.py\`).
                [ -f /root/launch.sh ] || { echo "missing /root/launch.sh"; exit 1; }
                sed -i "s|^export PLN_GPU_TOKEN=.*|export PLN_GPU_TOKEN='${new_token}'|" /root/launch.sh
                grep -q "PLN_GPU_TOKEN='${new_token}'" /root/launch.sh || { echo "token not written to launch.sh"; exit 1; }
                echo "  remote: /root/launch.sh now PLN_GPU_TOKEN=${new_token:0:8}..."
                pkill -f 'z-image/server.py' 2>/dev/null || true
                sleep 2
                mkdir -p /root/logs
                nohup bash /root/launch.sh > /root/logs/zimage.log 2>&1 &
                sleep 1
                echo "  remote: relaunched (pid \$!)"
                ;;
            klein_workspace)
                [ -f "\$ENV_FILE" ] && sed -i 's/^PLN_GPU_TOKEN=.*/PLN_GPU_TOKEN=${new_token}/' "\$ENV_FILE"
                [ -f /workspace/restart.sh ] || { echo "missing /workspace/restart.sh"; exit 1; }
                bash /workspace/restart.sh
                ;;
            gh200_systemd)
                if [ -f "\$ENV_FILE" ]; then
                    sed -i 's/^PLN_GPU_TOKEN=.*/PLN_GPU_TOKEN=${new_token}/' "\$ENV_FILE"
                    grep -q PLN_GPU_TOKEN "\$ENV_FILE" || echo "PLN_GPU_TOKEN=${new_token}" >> "\$ENV_FILE"
                else
                    echo "PLN_GPU_TOKEN=${new_token}" > "\$ENV_FILE"
                fi
                echo "  remote: \${ENV_FILE} updated"
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
log "SOPS: PLN_GPU_TOKEN present in all 6 target files"

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
[ -f "$ZIMAGE_A4500_KEY" ] || { error "Missing local SSH key $ZIMAGE_A4500_KEY (Z-Image A4500 pods)"; exit 1; }
LAMBDA_KEY=$(extract_ssh_key SSH_LAMBDA_SANA_LTX2_ACESTEP) || { error "Missing SSH_LAMBDA_SANA_LTX2_ACESTEP in SOPS"; exit 1; }

for entry in "${ZIMAGE_A4500_HOSTS[@]}"; do
    host="${entry%%:*}"; rest="${entry#*:}"; port="${rest%%:*}"; label="${rest#*:}"
    verify_ssh_host "$label" "$host" "$port" "$ZIMAGE_A4500_KEY" || exit 1
done
verify_ssh_host "Lambda GH200" "ubuntu@192.222.51.105" "" "$LAMBDA_KEY" || exit 1

warn "Relay-only hosts (cannot be reached non-interactively) — restart MANUALLY after rotation:"
for h in "${RELAY_MANUAL_HOSTS[@]}"; do echo "    - $h"; done

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan:"
    echo "  1. Generate new PLN_GPU_TOKEN (openssl rand -hex 32)"
    echo "  2. Update SOPS (6 files: enter + gen, dev/staging/prod each)"
    echo "  3. Open PR: rotate/gpu-token-<date> → main, auto-merge"
    echo "  4. Push main → production (admin) → deploy-gen-cloudflare deploys gen"
    echo "  5. SSH fan-out: update .env + restart workers on the 2 A4500 Z-Image pods + Lambda GH200"
    echo "     (relay-only hosts — 3090 Z-Image + Klein — must be restarted manually; see warning above)"
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
# 3. PR + deploy (gen image picks up new token)
#######################################
section "Opening PR and deploying"

BRANCH="rotate/gpu-token-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${SOPS_FILES[@]}"
git commit -m "rotate: PLN_GPU_TOKEN"

open_pr_and_merge "$BRANCH" \
    "rotate: PLN_GPU_TOKEN" \
    "Rotates \`PLN_GPU_TOKEN\` (gen image + enter worker → GPU workers). Updates 6 SOPS files. After merge, main→production triggers gen image deploy; the script then SSH-fans-out to GPU hosts, then updates the Wrangler secret so the worker switches too. Automated by \`rotate-infra-gpu-token.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed. GPUs still have OLD token, EC2 now has NEW. Production is in a broken state — SSH fan-out not attempted."
    exit 1
}

#######################################
# 7. SSH fan-out to GPU hosts (close the image↔GPU rejection window)
#######################################
section "Updating GPU hosts via SSH"

# Z-Image A4500 pods (directly SSH-able, non-interactive)
for entry in "${ZIMAGE_A4500_HOSTS[@]}"; do
    host="${entry%%:*}"; rest="${entry#*:}"; port="${rest%%:*}"; label="${rest#*:}"
    update_remote_env "$host" "$port" "$ZIMAGE_A4500_KEY" '/root/launch.sh' \
        "$label" 'zimage_launch' "$NEW_TOKEN" || {
        error "SSH fan-out failed for $label. Fix manually."
        exit 1
    }
done

# Lambda GH200 (LTX-2 + ACE-Step + Sana)
update_remote_env 'ubuntu@192.222.51.105' '' "$LAMBDA_KEY" '$HOME/.env' \
    'Lambda GH200 (LTX-2+ACE-Step+Sana)' 'gh200_systemd' "$NEW_TOKEN" || {
    error "SSH fan-out failed for Lambda GH200 host. Fix manually."
    exit 1
}

# Relay-only hosts can't be reached non-interactively — operator must do these by hand.
warn "MANUAL STEP REQUIRED — relay-only hosts not updated by this script:"
for h in "${RELAY_MANUAL_HOSTS[@]}"; do echo "    - $h"; done
warn "SSH each via the RunPod dashboard 'Connect' tab, set PLN_GPU_TOKEN=${NEW_TOKEN:0:4}...${NEW_TOKEN: -4} in its env, and run the restart command above."

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
    error "Likely cause: a GPU worker (Z-Image/Klein/LTX-2) didn't pick up the new token. Did you complete the manual relay-host steps?"
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
log "SOPS + gen image + A4500 Z-Image pods (2) + Lambda GH200 + enter worker now aligned."
warn "Still MANUAL: 3090 Z-Image (lrrdd9jggqg9su) + Klein (lqh6weiexk4sth) — relay-only. Update + restart them by hand, then re-run the health check."
