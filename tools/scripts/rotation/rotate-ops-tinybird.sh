#!/bin/bash
# Rotate Tinybird machine tokens using the Tinybird REST API.
#
# Usage:
#   ./rotate-ops-tinybird.sh [--execute] [--token TOKEN_NAME | --all]
#
# Default: dry-run (verify admin token + preview, no mutation).
# Pass --execute to actually rotate.
#
# Canonical Tinybird tokens:
#   tinybird_ingest       → enter runtime append token
#   tinybird_read         → internal current-workspace read token
#   tinybird_sync         → GitHub sync token for D1 + app_directory
#
# Note: tinybird_legacy_read (consumed by apps/operation/economics) lives in
# the retired pollinations_ai workspace. It is not rotated by this script —
# the current admin token can't reach that workspace. Rotate manually if
# needed, or migrate economics off the legacy workspace.
#
# This script:
# 1. Verifies the Tinybird admin token (optional)
# 2. Refreshes one or more Tinybird tokens by name
# 3. Updates SOPS files, GitHub Actions secrets, and Wrangler secrets

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

run() {
    if $DRY_RUN; then
        log "[dry-run] $1"
        return 0
    fi

    set +e
    eval "$2"
    local status=$?
    set -e
    return $status
}

API_HOST="${TINYBIRD_API_HOST:-api.europe-west2.gcp.tinybird.co}"
API_BASE="https://$API_HOST/v0"

if [ -z "$TINYBIRD_ADMIN_TOKEN" ]; then
    error "TINYBIRD_ADMIN_TOKEN must be set (needs TOKENS scope)"
    echo "Create one: tb token create static tinybird_admin --scope TOKENS --scope ADMIN"
    exit 1
fi

#######################################
# Pre-flight: verify Tinybird admin token
#######################################
section "Pre-flight: verifying Tinybird admin token"
RESPONSE=$(curl -s --max-time 15 \
    -H "Authorization: Bearer $TINYBIRD_ADMIN_TOKEN" \
    "$API_BASE/tokens")
TOKEN_COUNT=$(echo "$RESPONSE" | jq '.tokens | length' 2>/dev/null)
if [ -z "$TOKEN_COUNT" ] || [ "$TOKEN_COUNT" -eq 0 ]; then
    error "Tinybird admin token invalid or no tokens found"
    echo "$RESPONSE" | head -5
    exit 1
fi
log "Tinybird admin token valid — $TOKEN_COUNT tokens in workspace"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

if [ -z "$TARGET" ] && ! $ROTATE_ALL; then
    echo "Usage: $0 [--execute] [--token TOKEN_NAME | --all]"
    echo ""
    echo "Known Tinybird token names:"
    echo "  tinybird_ingest"
    echo "  tinybird_read"
    echo "  tinybird_sync"
    echo ""
    echo "Run with --all to rotate all known tokens, or --token <name> for one."
    exit 1
fi

FAILURES=()

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

section "Listing workspace tokens"
if ! $DRY_RUN; then
    TOKEN_LIST=$(curl -s --fail-with-body \
        -H "Authorization: Bearer $TINYBIRD_ADMIN_TOKEN" \
        "$API_BASE/tokens") || {
        error "Failed to list tokens"
        exit 1
    }
    TOKEN_COUNT=$(echo "$TOKEN_LIST" | jq '.tokens | length')
    log "Found $TOKEN_COUNT tokens in workspace"
else
    log "[dry-run] Would list workspace tokens"
fi

refresh_and_update() {
    local token_name=$1
    local entry

    entry=$(find_entry "$token_name") || {
        error "Unknown Tinybird token: $token_name"
        FAILURES+=("Unknown token: $token_name")
        return 1
    }

    IFS='|' read -r _ env_var sops_files sinks <<< "$entry"

    section "Refreshing token: $token_name"

    if $DRY_RUN; then
        log "[dry-run] Would refresh $token_name via $API_BASE/tokens/$token_name/refresh"
        log "[dry-run] Would update $env_var in SOPS/GitHub/Wrangler"
        return 0
    fi

    REFRESH_RESPONSE=$(curl -s --fail-with-body \
        -X POST \
        -H "Authorization: Bearer $TINYBIRD_ADMIN_TOKEN" \
        "$API_BASE/tokens/$token_name/refresh") || {
        error "Failed to refresh $token_name"
        FAILURES+=("Refresh: $token_name")
        return 1
    }

    NEW_VALUE=$(echo "$REFRESH_RESPONSE" | jq -r '.token // empty')
    if [ -z "$NEW_VALUE" ]; then
        error "No token value in refresh response for $token_name"
        FAILURES+=("Refresh: $token_name — no token in response")
        return 1
    fi

    log "Refreshed: ${NEW_VALUE:0:8}..."

    IFS=',' read -ra files <<< "$sops_files"
    for f in "${files[@]}"; do
        local full_path="$REPO_ROOT/$f"
        local fname
        fname=$(basename "$f")
        if [ ! -f "$full_path" ]; then
            warn "Skipping $fname — file not found"
            continue
        fi
        run "sops --set $env_var in $fname" \
            "sops --set '[\"$env_var\"] \"$NEW_VALUE\"' '$full_path'"
        if [ $? -eq 0 ] || $DRY_RUN; then
            log "  SOPS $env_var in $fname"
        else
            error "  SOPS $env_var in $fname"
            FAILURES+=("SOPS $env_var: $fname")
        fi
    done

    for sink in $sinks; do
        case "$sink" in
            github:*)
                secret_name="${sink#github:}"
                run "gh secret set $secret_name" \
                    "echo '$NEW_VALUE' | gh secret set '$secret_name' --repo '$GITHUB_REPO'"
                if [ $? -eq 0 ] || $DRY_RUN; then
                    log "  GitHub $secret_name"
                else
                    error "  GitHub $secret_name"
                    FAILURES+=("GitHub $secret_name")
                fi
                ;;
            wrangler:*)
                secret_name="${sink#wrangler:}"
                for env in production staging; do
                    run "wrangler secret put $secret_name --env $env" \
                        "echo '$NEW_VALUE' | npx wrangler secret put '$secret_name' --env '$env' --config '$ENTER_DIR/wrangler.toml'"
                    if [ $? -eq 0 ] || $DRY_RUN; then
                        log "  Wrangler $secret_name ($env)"
                    else
                        error "  Wrangler $secret_name ($env)"
                        FAILURES+=("Wrangler $secret_name: $env")
                    fi
                done
                ;;
        esac
    done
}

if $ROTATE_ALL; then
    for entry in "${TOKENS[@]}"; do
        IFS='|' read -r token_name _ _ _ <<< "$entry"
        refresh_and_update "$token_name"
    done
else
    refresh_and_update "$TARGET"
fi

section "Tinybird Rotation Summary"
echo ""
echo "API host: $API_HOST"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Deploy enter/economics/KPI consumers that use the rotated tokens"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
