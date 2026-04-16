#!/bin/bash
# Rotate Tinybird workspace tokens using the Tinybird REST API.
#
# Usage:
#   ./rotate-ops-tinybird.sh [--execute] [--token TOKEN_NAME | --all]
#
# Default: dry-run. Pass --execute for the full end-to-end cycle.
#
# Canonical Tinybird tokens (current pollinations_enter workspace):
#   tinybird_ingest  → enter runtime append token
#   tinybird_read    → internal current-workspace read token
#   tinybird_sync    → GitHub sync token for D1 + app_directory
#
# Note: tinybird_legacy_read (consumed by apps/operation/economics) lives in
# the retired pollinations_ai workspace — not rotated here.
#
# Worker-consumed: after refresh, this script does `wrangler secret put`
# immediately so the enter worker switches to the new token in seconds.
# The PR + main→production push is for SOPS + GitHub-secrets audit sync.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
ENTER_DIR="$REPO_ROOT/enter.pollinations.ai"
GITHUB_REPO="pollinations/pollinations"

DRY_RUN=true
TARGET=""
ROTATE_ALL=false
while [[ "$1" == --* ]]; do
    case "$1" in
        --execute) DRY_RUN=false; shift ;;
        --token) TARGET="$2"; shift 2 ;;
        --all) ROTATE_ALL=true; shift ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

source "$SCRIPT_DIR/_load-admin-secrets.sh"

wrangler_cmd() {
    if [ -x "$REPO_ROOT/node_modules/.bin/wrangler" ]; then
        "$REPO_ROOT/node_modules/.bin/wrangler" "$@"
    else
        npx wrangler "$@"
    fi
}

API_HOST="${TINYBIRD_API_HOST:-api.europe-west2.gcp.tinybird.co}"
API_BASE="https://$API_HOST/v0"

# token_name | env_var_name | sops_files (csv) | sinks (space-sep: github:NAME wrangler:NAME)
TOKENS=(
    "tinybird_ingest|TINYBIRD_INGEST_TOKEN|enter.pollinations.ai/secrets/dev.vars.json,enter.pollinations.ai/secrets/staging.vars.json,enter.pollinations.ai/secrets/prod.vars.json|wrangler:TINYBIRD_INGEST_TOKEN"
    "tinybird_read|TINYBIRD_READ_TOKEN|enter.pollinations.ai/secrets/dev.vars.json,enter.pollinations.ai/secrets/staging.vars.json,enter.pollinations.ai/secrets/prod.vars.json,apps/operation/kpi/secrets/env.json,apps/operation/economics/secrets/secrets.vars.json|github:TINYBIRD_READ_TOKEN wrangler:TINYBIRD_READ_TOKEN"
    "tinybird_sync|TINYBIRD_SYNC_TOKEN|enter.pollinations.ai/secrets/dev.vars.json,enter.pollinations.ai/secrets/staging.vars.json,enter.pollinations.ai/secrets/prod.vars.json|github:TINYBIRD_SYNC_TOKEN wrangler:TINYBIRD_SYNC_TOKEN"
)

find_entry() {
    local token_name=$1
    for entry in "${TOKENS[@]}"; do
        IFS='|' read -r name _ _ _ <<< "$entry"
        if [ "$name" = "$token_name" ]; then
            echo "$entry"
            return 0
        fi
    done
    return 1
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

if [ -z "$TINYBIRD_ADMIN_TOKEN" ]; then
    error "TINYBIRD_ADMIN_TOKEN must be set (needs TOKENS scope)."
    echo "Copy from the Tinybird CLI: tb --cloud token copy \"admin token\""
    exit 1
fi

RESPONSE=$(curl -sS --max-time 15 \
    -H "Authorization: Bearer $TINYBIRD_ADMIN_TOKEN" \
    "$API_BASE/tokens")
TOKEN_COUNT=$(echo "$RESPONSE" | jq '.tokens | length' 2>/dev/null || echo 0)
if [ -z "$TOKEN_COUNT" ] || [ "$TOKEN_COUNT" -eq 0 ]; then
    error "Tinybird admin token invalid or workspace empty."
    echo "$RESPONSE" | head -5
    exit 1
fi
log "Tinybird admin token OK — $TOKEN_COUNT tokens in workspace"

if [ -z "$TARGET" ] && ! $ROTATE_ALL; then
    error "Specify --token TOKEN_NAME or --all."
    echo "Known tokens: tinybird_ingest, tinybird_read, tinybird_sync"
    exit 1
fi

# Build target list
TARGET_LIST=()
if $ROTATE_ALL; then
    for entry in "${TOKENS[@]}"; do
        IFS='|' read -r name _ _ _ <<< "$entry"
        TARGET_LIST+=("$name")
    done
else
    find_entry "$TARGET" >/dev/null || {
        error "Unknown Tinybird token: $TARGET"
        exit 1
    }
    TARGET_LIST+=("$TARGET")
fi

log "Will rotate: ${TARGET_LIST[*]}"

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
    echo
    log "Plan (per target token):"
    echo "  1. POST $API_BASE/tokens/<name>/refresh → get new value (old invalidated)"
    echo "  2. Update SOPS files mapped to this token"
    echo "  3. For each sink: wrangler secret put and/or gh secret set"
    echo "     (wrangler put closes the enter-worker rejection window in ~5s)"
    echo "  4. Collect all SOPS changes → single PR to main, auto-merge"
    echo "  5. Push main → production (audit sync)"
    echo "  6. Health check: directly verify each new token works against Tinybird"
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# For each target token: refresh + SOPS + fan-out
#######################################

declare -a ROTATED_TOKENS
declare -a ROTATED_VALUES

for token_name in "${TARGET_LIST[@]}"; do
    entry=$(find_entry "$token_name")
    IFS='|' read -r _ env_var sops_files sinks <<< "$entry"

    section "Refreshing $token_name"

    REFRESH_RESPONSE=$(curl -sS --fail-with-body \
        -X POST \
        -H "Authorization: Bearer $TINYBIRD_ADMIN_TOKEN" \
        "$API_BASE/tokens/$token_name/refresh") || {
        error "Failed to refresh $token_name."
        exit 1
    }
    NEW_VALUE=$(echo "$REFRESH_RESPONSE" | jq -r '.token // empty')
    if [ -z "$NEW_VALUE" ]; then
        error "Refresh response missing .token for $token_name."
        exit 1
    fi
    log "  refreshed: ${NEW_VALUE:0:8}..."

    ROTATED_TOKENS+=("$token_name")
    ROTATED_VALUES+=("$NEW_VALUE")

    # Update SOPS
    IFS=',' read -ra files <<< "$sops_files"
    for f in "${files[@]}"; do
        full_path="$REPO_ROOT/$f"
        if [ ! -f "$full_path" ]; then
            warn "  skipping $f — file not found"
            continue
        fi
        sops --set "[\"$env_var\"] \"$NEW_VALUE\"" "$full_path"
        log "  SOPS: $f"
    done

    # Fan-out to sinks (wrangler + github secrets)
    for sink in $sinks; do
        case "$sink" in
            github:*)
                secret_name="${sink#github:}"
                echo "$NEW_VALUE" | gh secret set "$secret_name" --repo "$GITHUB_REPO"
                log "  gh secret: $secret_name"
                ;;
            wrangler:*)
                secret_name="${sink#wrangler:}"
                for env in production staging; do
                    echo "$NEW_VALUE" | wrangler_cmd secret put "$secret_name" --env "$env" --config "$ENTER_DIR/wrangler.toml"
                    log "  wrangler: $secret_name ($env)"
                done
                ;;
        esac
    done
done

#######################################
# Collect SOPS changes → PR → main, auto-merge
#######################################
section "Opening PR to main"

BRANCH="rotate/tinybird-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add -A
git commit -m "rotate: Tinybird tokens (${TARGET_LIST[*]})"
git push -u origin "$BRANCH"

gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "rotate: Tinybird tokens (${TARGET_LIST[*]})" \
    --body "Rotates Tinybird tokens via the refresh API (in-place, immediate invalidation). Worker already has new values via live \`wrangler secret put\` inside the script. This PR syncs SOPS + GitHub secrets for audit trail and next deploy consistency. Tokens rotated: ${TARGET_LIST[*]}. Automated by \`rotate-ops-tinybird.sh\`."

log "Enabling auto-merge..."
gh pr merge "$BRANCH" --auto --squash

#######################################
# Poll until PR merged
#######################################
section "Waiting for PR to merge"

MERGE_TIMEOUT=900
MERGE_ELAPSED=0
while true; do
    STATE=$(gh pr view "$BRANCH" --json state -q .state 2>/dev/null || echo "UNKNOWN")
    case "$STATE" in
        MERGED) log "PR merged."; break ;;
        CLOSED) error "PR was closed without merging."; exit 1 ;;
    esac
    if [ "$MERGE_ELAPSED" -ge "$MERGE_TIMEOUT" ]; then
        error "Timed out waiting for PR merge after ${MERGE_TIMEOUT}s."
        exit 1
    fi
    sleep 15
    MERGE_ELAPSED=$((MERGE_ELAPSED + 15))
done

#######################################
# Push main → production (audit sync)
#######################################
section "Promoting main → production"

git checkout main
git pull --ff-only origin main
git fetch origin production
git push origin main:production
log "production advanced to main."

#######################################
# Health check: verify each new token works against Tinybird
#######################################
section "Health check (verify new tokens against Tinybird)"

FAILED_CHECK=0
for i in "${!ROTATED_TOKENS[@]}"; do
    tname="${ROTATED_TOKENS[$i]}"
    tvalue="${ROTATED_VALUES[$i]}"
    STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 \
        -H "Authorization: Bearer $tvalue" \
        "$API_BASE/tokens")
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "403" ]; then
        # 200 = ADMIN/TOKENS scope, 403 = narrower scope but token valid
        log "  $tname: new token authenticated (HTTP $STATUS)"
    else
        error "  $tname: new token failed (HTTP $STATUS)"
        FAILED_CHECK=1
    fi
done

if [ "$FAILED_CHECK" -eq 1 ]; then
    error "One or more new tokens failed health check. Investigate before re-running."
    exit 1
fi

#######################################
# Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "Tinybird Rotation Complete"
echo ""
for i in "${!ROTATED_TOKENS[@]}"; do
    log "${ROTATED_TOKENS[$i]}: ${ROTATED_VALUES[$i]:0:8}..."
done
echo ""
log "SOPS + GitHub secrets + Wrangler + production now aligned on the new tokens."
