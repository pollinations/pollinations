#!/bin/bash
# Rotate Cloudflare API tokens using the Cloudflare REST API.
#
# Usage:
#   ./rotate-ops-cloudflare.sh [--dry-run] [--token api|observability|all]
#
# Tokens managed:
#   api           — CLOUDFLARE_API_TOKEN (image service, Workers AI, D1)
#   observability — CLOUDFLARE_OBSERVABILITY_TOKEN (observability pipeline)
#   all           — both (default)
#
# This script:
# 1. Identifies the token ID by verifying the current token
# 2. Rolls (rotates) the token via PUT /tokens/{id}/value
# 3. Updates SOPS + GitHub Actions secrets
#
# The roll endpoint generates a new secret while keeping the same token ID,
# name, and permissions. The old secret is immediately invalidated.
#
# Environment variables:
#   CF_MANAGEMENT_TOKEN — a Cloudflare token with "API Tokens: Edit" permission
#     (if not set, the script tries to use the token being rotated to roll itself,
#     which works if it has the "API Tokens: Edit" permission)
#   CLOUDFLARE_API_TOKEN — legacy alias for the management token in CI
#
# Prerequisites:
# - sops, jq, curl installed
# - gh CLI authenticated (for GitHub secrets)
#
# After running, commit SOPS changes and redeploy affected services.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

DRY_RUN=false
VERIFY_ONLY=false
TARGET="all"

while [[ "$1" == --* ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --verify) VERIFY_ONLY=true; shift ;;
        --token) TARGET="$2"; shift 2 ;;
        *) echo "Unknown flag: $1"; exit 1 ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }

CF_API="https://api.cloudflare.com/client/v4"
IMAGE_SOPS="$REPO_ROOT/image.pollinations.ai/secrets/env.json"
ENTER_SOPS="$REPO_ROOT/enter.pollinations.ai/secrets/env.json"

FAILURES=()

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made"
fi

verify_token_status() {
    local label=$1
    local token=$2
    local response
    local success
    local status
    local message

    response=$(curl -s --max-time 15 \
        "$CF_API/user/tokens/verify" \
        -H "Authorization: Bearer $token")
    success=$(echo "$response" | jq -r '.success // false')
    status=$(echo "$response" | jq -r '.result.status // empty')
    message=$(echo "$response" | jq -r '.errors[0].message // .messages[0].message // "unknown response"')

    if [ "$success" = "true" ] && [ "$status" = "active" ]; then
        log "$label valid (status: active)"
        return 0
    fi

    error "$label invalid (status: ${status:-unknown}; message: $message)"
    FAILURES+=("$label")
    return 1
}

if $VERIFY_ONLY; then
    section "Verifying Cloudflare API tokens"

    if [ "$TARGET" = "all" ] || [ "$TARGET" = "api" ]; then
        CF_TOKEN=$(sops -d "$IMAGE_SOPS" | jq -r '.CLOUDFLARE_API_TOKEN')
        if ! verify_token_status "CLOUDFLARE_API_TOKEN" "$CF_TOKEN"; then
            :
        fi
    fi

    if [ "$TARGET" = "all" ] || [ "$TARGET" = "observability" ]; then
        if [ -f "$ENTER_SOPS" ]; then
            OBS_TOKEN=$(sops -d "$ENTER_SOPS" | jq -r '.CLOUDFLARE_OBSERVABILITY_TOKEN // empty')
            if [ -n "$OBS_TOKEN" ]; then
                if ! verify_token_status "CLOUDFLARE_OBSERVABILITY_TOKEN" "$OBS_TOKEN"; then
                    :
                fi
            fi
        fi
    fi

    if [ ${#FAILURES[@]} -eq 0 ]; then
        exit 0
    fi
    exit 1
fi

#######################################
# Helper: roll a single Cloudflare token
#######################################
roll_token() {
    local sops_key=$1       # SOPS key name
    local sops_file=$2      # SOPS file path
    local gh_secret=$3      # GitHub secret name (or empty)
    local label=$4

    section "Rolling $label"

    # Read current token from SOPS
    if [ ! -f "$sops_file" ]; then
        error "SOPS file not found: $sops_file"
        FAILURES+=("$label: SOPS file missing")
        return 1
    fi

    local current_token
    current_token=$(sops -d "$sops_file" | jq -r ".$sops_key")
    if [ -z "$current_token" ] || [ "$current_token" = "null" ]; then
        error "Could not read $sops_key from SOPS"
        FAILURES+=("$label: missing in SOPS")
        return 1
    fi
    log "Current token: ${current_token:0:8}..."

    # Use management token or the token itself
    local auth_token="${CF_MANAGEMENT_TOKEN:-${CLOUDFLARE_API_TOKEN:-$current_token}}"

    # Verify and get token ID
    if ! $DRY_RUN; then
        local verify_response
        verify_response=$(curl -s --fail-with-body \
            "$CF_API/user/tokens/verify" \
            -H "Authorization: Bearer $current_token") || {
            error "Token verification failed: $verify_response"
            FAILURES+=("$label: verify failed")
            return 1
        }

        local token_id
        token_id=$(echo "$verify_response" | jq -r '.result.id')
        local token_status
        token_status=$(echo "$verify_response" | jq -r '.result.status')
        log "Token ID: $token_id (status: $token_status)"

        # Roll the token
        local roll_response
        roll_response=$(curl -s --fail-with-body \
            -X PUT \
            "$CF_API/user/tokens/$token_id/value" \
            -H "Authorization: Bearer $auth_token") || {
            error "Failed to roll token: $roll_response"
            FAILURES+=("$label: roll failed")
            return 1
        }

        local new_token
        new_token=$(echo "$roll_response" | jq -r '.result // empty')
        if [ -z "$new_token" ]; then
            error "No token value in roll response"
            echo "$roll_response" | jq . 2>/dev/null || echo "$roll_response"
            FAILURES+=("$label: no value in response")
            return 1
        fi
        log "New token: ${new_token:0:8}..."
        warn "Old token is immediately invalidated"
    else
        new_token="cf-dry-run-token"
        log "[dry-run] Would verify and roll $sops_key"
    fi

    # Update SOPS
    local fname
    fname=$(basename "$(dirname "$(dirname "$sops_file")")")/$(basename "$sops_file")
    if $DRY_RUN; then
        log "[dry-run] sops --set $sops_key in $fname"
    else
        if sops --set "[\"$sops_key\"] \"$new_token\"" "$sops_file"; then
            log "SOPS: $fname"
        else
            error "SOPS: $fname"
            FAILURES+=("$label: SOPS update")
        fi
    fi

    # Update GitHub secret if specified
    if [ -n "$gh_secret" ]; then
        if $DRY_RUN; then
            log "[dry-run] gh secret set $gh_secret"
        else
            if echo "$new_token" | gh secret set "$gh_secret" --repo pollinations/pollinations; then
                log "GitHub secret: $gh_secret"
            else
                error "GitHub secret: $gh_secret"
                FAILURES+=("$label: GitHub secret")
            fi
        fi
    fi
}

#######################################
# Rotate requested tokens
#######################################

if [ "$TARGET" = "all" ] || [ "$TARGET" = "api" ]; then
    roll_token \
        "CLOUDFLARE_API_TOKEN" \
        "$IMAGE_SOPS" \
        "CLOUDFLARE_API_TOKEN" \
        "CLOUDFLARE_API_TOKEN (image service)"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "observability" ]; then
    roll_token \
        "CLOUDFLARE_OBSERVABILITY_TOKEN" \
        "$ENTER_SOPS" \
        "" \
        "CLOUDFLARE_OBSERVABILITY_TOKEN (observability)"
fi

#######################################
# Summary
#######################################
section "Cloudflare Token Rotation Summary"

echo ""
warn "Rolled tokens are immediately invalidated."
warn "Deploy affected services NOW to pick up new tokens."
echo ""
echo "Affected services:"
if [ "$TARGET" = "all" ] || [ "$TARGET" = "api" ]; then
    echo "  - image.pollinations.ai (EC2 deploy)"
    echo "  - GitHub Actions workflows (secret updated)"
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "observability" ]; then
    echo "  - enter.pollinations.ai observability"
fi
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Deploy affected EC2 services IMMEDIATELY"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
