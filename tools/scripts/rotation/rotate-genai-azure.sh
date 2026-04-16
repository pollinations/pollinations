#!/bin/bash
# Rotate Azure Cognitive Services keys using key1/key2 alternation.
#
# Usage: ./rotate-genai-azure.sh [--execute] [--resource east|sweden|safety|all]
#
# Default: dry-run, --resource all. Pass --execute for the full cycle.
#
# Zero-downtime via dual-key alternation:
# 1. Detect which key slot (key1 or key2) matches the value in SOPS
# 2. Regenerate the OTHER slot (unused — no production impact)
# 3. Update SOPS to point to the OTHER slot's new value
# 4. Deploy: EC2 switches to the OTHER slot. Previously-active slot stays
#    valid in Azure (so any in-flight requests finish cleanly).
# 5. Next rotation regenerates what was previously active.
#
# Resources managed:
#   east   — AZURE_MYCELI_PROD_API_KEY         (text.pollinations.ai)
#   sweden — AZURE_MYCELI_PROD_SWEDEN_API_KEY  (text + image)
#   safety — AZURE_CONTENT_SAFETY_API_KEY       (image.pollinations.ai)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

DRY_RUN=true
TARGET="all"
while [[ "$1" == --* ]]; do
    case "$1" in
        --execute) DRY_RUN=false; shift ;;
        --resource) TARGET="$2"; shift 2 ;;
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

IMAGE_SOPS="$REPO_ROOT/image.pollinations.ai/secrets/env.json"
TEXT_SOPS="$REPO_ROOT/text.pollinations.ai/secrets/env.json"
DEPLOY_WORKFLOW="deploy-enter-services.yml"
HEALTH_URL="https://gen.pollinations.ai/v1/models"

extract_resource_name() {
    echo "$1" | sed -E 's|https?://([^.]+)\..*|\1|'
}

find_resource_group() {
    local resource_name=$1
    az cognitiveservices account list \
        --query "[?name=='$resource_name'].resourceGroup | [0]" -o tsv 2>/dev/null
}

# Process one Azure resource: detect active slot, regenerate other slot,
# update SOPS. Echoes a line per action taken.
rotate_resource() {
    local label=$1
    local endpoint_key=$2
    local api_key_name=$3
    local sops_source=$4
    shift 4
    local sops_targets=("$@")

    section "Resource: $label"

    local endpoint
    endpoint=$(sops -d "$sops_source" | jq -r ".$endpoint_key")
    if [ -z "$endpoint" ] || [ "$endpoint" = "null" ]; then
        error "Could not read $endpoint_key from SOPS."
        return 1
    fi

    local current_key
    current_key=$(sops -d "$sops_source" | jq -r ".$api_key_name")
    if [ -z "$current_key" ] || [ "$current_key" = "null" ]; then
        error "Could not read $api_key_name from SOPS."
        return 1
    fi

    local resource_name resource_group
    resource_name=$(extract_resource_name "$endpoint")
    resource_group=$(find_resource_group "$resource_name")
    if [ -z "$resource_group" ]; then
        error "Could not find resource group for $resource_name."
        return 1
    fi
    log "  endpoint: $endpoint"
    log "  resource: $resource_name (rg: $resource_group)"

    local key1 key2
    key1=$(az cognitiveservices account keys list \
        --name "$resource_name" --resource-group "$resource_group" \
        --query "key1" -o tsv 2>/dev/null)
    key2=$(az cognitiveservices account keys list \
        --name "$resource_name" --resource-group "$resource_group" \
        --query "key2" -o tsv 2>/dev/null)

    local active_slot regenerate_slot
    if [ "$current_key" = "$key1" ]; then
        active_slot="key1"
        regenerate_slot="key2"
    elif [ "$current_key" = "$key2" ]; then
        active_slot="key2"
        regenerate_slot="key1"
    else
        error "SOPS key for $label does not match either key1 or key2 in Azure."
        error "This should never happen — manual reconciliation required."
        return 1
    fi
    log "  SOPS currently uses $active_slot; will regenerate $regenerate_slot"

    if $DRY_RUN; then
        log "  [dry-run] would regenerate $regenerate_slot and swap SOPS"
        return 0
    fi

    local new_key
    new_key=$(az cognitiveservices account keys regenerate \
        --name "$resource_name" \
        --resource-group "$resource_group" \
        --key-name "$regenerate_slot" \
        --query "$regenerate_slot" -o tsv 2>&1) || {
        error "Key regeneration failed for $resource_name ($regenerate_slot)."
        return 1
    }
    log "  regenerated $regenerate_slot: ${new_key:0:8}..."

    for f in "${sops_targets[@]}"; do
        local fname
        fname=$(basename "$(dirname "$(dirname "$f")")")/$(basename "$f")
        if [ ! -f "$f" ]; then
            warn "  skipping $fname — file not found"
            continue
        fi
        sops --set "[\"$api_key_name\"] \"$new_key\"" "$f"
        log "  SOPS: $fname updated"
    done
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

if ! command -v az >/dev/null; then
    error "az CLI not installed."
    exit 1
fi

if ! az account show >/dev/null 2>&1; then
    error "az CLI not authenticated — run 'az login'."
    exit 1
fi
log "Azure CLI authenticated"

if ! az cognitiveservices account list --query '[].name' -o tsv >/dev/null 2>&1; then
    error "az cannot list Cognitive Services accounts."
    exit 1
fi
log "Cognitive Services access OK"

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# Process resources
#######################################

if [ "$TARGET" = "all" ] || [ "$TARGET" = "east" ]; then
    rotate_resource \
        "Azure OpenAI East US (AZURE_MYCELI_PROD)" \
        "AZURE_MYCELI_PROD_ENDPOINT" \
        "AZURE_MYCELI_PROD_API_KEY" \
        "$TEXT_SOPS" \
        "$TEXT_SOPS"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "sweden" ]; then
    rotate_resource \
        "Azure OpenAI Sweden (AZURE_MYCELI_PROD_SWEDEN)" \
        "AZURE_MYCELI_PROD_SWEDEN_ENDPOINT" \
        "AZURE_MYCELI_PROD_SWEDEN_API_KEY" \
        "$TEXT_SOPS" \
        "$TEXT_SOPS" "$IMAGE_SOPS"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "safety" ]; then
    rotate_resource \
        "Azure Content Safety" \
        "AZURE_CONTENT_SAFETY_ENDPOINT" \
        "AZURE_CONTENT_SAFETY_API_KEY" \
        "$IMAGE_SOPS" \
        "$IMAGE_SOPS"
fi

if $DRY_RUN; then
    echo
    log "Plan for --execute: SOPS updates above, then PR → main → production → deploy → health check."
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# Open PR to main, auto-merge
#######################################
section "Opening PR to main"

BRANCH="rotate/azure-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "$TEXT_SOPS" "$IMAGE_SOPS"
git commit -m "rotate: Azure Cognitive Services keys ($TARGET)"
git push -u origin "$BRANCH"

gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "rotate: Azure Cognitive Services keys ($TARGET)" \
    --body "Rotates Azure Cognitive Services keys via key1/key2 alternation. Previously-active slot stays valid in Azure during the deploy window — zero downtime. Automated by \`rotate-genai-azure.sh\`."

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
# Push main → production
#######################################
section "Promoting main → production"

git checkout main
git pull --ff-only origin main
git fetch origin production
git push origin main:production
log "production advanced to main."

#######################################
# Watch deploy workflow
#######################################
section "Waiting for $DEPLOY_WORKFLOW"

sleep 10
RUN_ID=$(gh run list --workflow="$DEPLOY_WORKFLOW" --branch=production --limit=1 --json databaseId -q '.[0].databaseId')
if [ -z "$RUN_ID" ]; then
    error "No deploy run found for $DEPLOY_WORKFLOW on production."
    exit 1
fi
log "Watching run $RUN_ID..."
gh run watch "$RUN_ID" --exit-status || {
    error "Deploy workflow failed — previously-active Azure slot still valid, so no downtime, but resolve before re-running."
    exit 1
}

#######################################
# Health check
#######################################
section "Health check"

STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$HEALTH_URL")
if [ "$STATUS" != "200" ]; then
    error "Health check failed (HTTP $STATUS)."
    exit 1
fi
log "Production healthy (HTTP 200)."

#######################################
# Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "Azure Key Rotation Complete"
echo ""
log "Resources rotated: $TARGET"
log "Previously-active slot stays valid in Azure until next rotation replaces it."
echo ""
log "SOPS + production + EC2 services now using the freshly-regenerated slot."
