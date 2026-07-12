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
#   east   — AZURE_MYCELI_PROD_API_KEY         (gen.pollinations.ai)
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

source "$SCRIPT_DIR/_log.sh"
source "$SCRIPT_DIR/_pr-deploy.sh"

REPO="pollinations/pollinations"
GEN_SOPS_FILES=(
    "$REPO_ROOT/gen.pollinations.ai/secrets/dev.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/staging.vars.json"
    "$REPO_ROOT/gen.pollinations.ai/secrets/prod.vars.json"
)
GEN_SOPS_READ="${GEN_SOPS_FILES[0]}"
DEPLOY_WORKFLOW="deploy-gen-cloudflare.yml"
GEN_BASE="https://gen.pollinations.ai"
TESTING_TOKENS_FILE="$REPO_ROOT/enter.pollinations.ai/.testingtokens"
# Per-resource health check models (substring expected in .model)
HEALTH_MODEL_EAST="openai"          # gpt-5.4-nano deployed in East US
HEALTH_EXPECT_EAST="gpt-5"
HEALTH_MODEL_SWEDEN="openai-audio"  # gpt-audio-mini deployed in Sweden
HEALTH_EXPECT_SWEDEN="gpt-audio"

extract_resource_name() {
    echo "$1" | sed -E 's|https?://([^.]+)\..*|\1|'
}

find_resource_group() {
    local resource_name=$1
    local out
    out=$(az cognitiveservices account list \
        --query "[?name=='$resource_name'].resourceGroup | [0]" -o tsv 2>&1) || {
        error "az account list failed while resolving resource group for $resource_name:"
        echo "$out" | head -5
        error "If the resource lives in a different subscription, run: az account set --subscription <id>"
        return 1
    }
    echo "$out"
}

# Process one Azure resource: detect active slot, regenerate other slot,
# update SOPS. Echoes a line per action taken.
rotate_resource() {
    local label=$1
    local resource_name=$2
    local api_key_name=$3
    local sops_source=$4
    shift 4
    local sops_targets=("$@")

    section "Resource: $label"

    local current_key
    current_key=$(sops -d "$sops_source" | jq -r ".$api_key_name")
    if [ -z "$current_key" ] || [ "$current_key" = "null" ]; then
        error "Could not read $api_key_name from SOPS."
        return 1
    fi

    local resource_group
    resource_group=$(find_resource_group "$resource_name") || return 1
    if [ -z "$resource_group" ]; then
        error "Resource $resource_name not visible in current az subscription ($(az account show --query id -o tsv 2>/dev/null || echo unknown))."
        error "If it lives elsewhere, run: az account set --subscription <id>"
        return 1
    fi
    log "  resource: $resource_name (rg: $resource_group)"

    local keys_json
    keys_json=$(az cognitiveservices account keys list \
        --name "$resource_name" --resource-group "$resource_group" \
        -o json 2>&1) || {
        error "az keys list failed for $resource_name (rg: $resource_group):"
        echo "$keys_json" | head -5
        error "If the resource lives in a different subscription, run: az account set --subscription <id>"
        return 1
    }
    local key1 key2
    key1=$(echo "$keys_json" | jq -r '.key1 // empty')
    key2=$(echo "$keys_json" | jq -r '.key2 // empty')
    if [ -z "$key1" ] || [ -z "$key2" ]; then
        error "az returned empty key1/key2 for $resource_name. Raw response:"
        echo "$keys_json" | head -5
        return 1
    fi

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
        sops --set "[\"$api_key_name\"] $(printf '%s' "$new_key" | jq -Rs .)" "$f"
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

if [ ! -f "$TESTING_TOKENS_FILE" ]; then
    error "Required for provider-specific health check: $TESTING_TOKENS_FILE"
    exit 1
fi
TEST_TOKEN=$(grep -E '^ENTER_API_TOKEN_REMOTE=' "$TESTING_TOKENS_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$TEST_TOKEN" ]; then
    error "ENTER_API_TOKEN_REMOTE missing from $TESTING_TOKENS_FILE"
    exit 1
fi

log "Pre-flight OK"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made. Pass --execute to rotate."
fi

#######################################
# Process resources
#######################################

# Resource names are hardcoded in gen worker source (createAndReturnImages.ts,
# azureFluxKontextModel.ts, text/configs/modelConfigs.ts) — not in SOPS, so
# the rotation script reads them from here.
if [ "$TARGET" = "all" ] || [ "$TARGET" = "east" ]; then
    rotate_resource \
        "Azure OpenAI East US (AZURE_MYCELI_PROD)" \
        "myceli-prod-eastus2" \
        "AZURE_MYCELI_PROD_API_KEY" \
        "$GEN_SOPS_READ" \
        "${GEN_SOPS_FILES[@]}"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "sweden" ]; then
    rotate_resource \
        "Azure OpenAI Sweden (AZURE_MYCELI_PROD_SWEDEN)" \
        "myceli-prod-swedencentral" \
        "AZURE_MYCELI_PROD_SWEDEN_API_KEY" \
        "$GEN_SOPS_READ" \
        "${GEN_SOPS_FILES[@]}"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "safety" ]; then
    SAFETY_ENDPOINT=$(sops -d "$GEN_SOPS_READ" | jq -r '.AZURE_CONTENT_SAFETY_ENDPOINT')
    SAFETY_RESOURCE=$(extract_resource_name "$SAFETY_ENDPOINT")
    rotate_resource \
        "Azure Content Safety" \
        "$SAFETY_RESOURCE" \
        "AZURE_CONTENT_SAFETY_API_KEY" \
        "$GEN_SOPS_READ" \
        "${GEN_SOPS_FILES[@]}"
fi

if $DRY_RUN; then
    echo
    log "Plan for --execute: SOPS updates above, then PR → main → production → deploy → health check."
    exit 0
fi

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

#######################################
# PR + deploy
#######################################
section "Opening PR and deploying"

BRANCH="rotate/azure-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add "${GEN_SOPS_FILES[@]}"
git commit -m "rotate: Azure Cognitive Services keys ($TARGET)"

open_pr_and_merge "$BRANCH" \
    "rotate: Azure Cognitive Services keys ($TARGET)" \
    "Rotates Azure Cognitive Services keys via key1/key2 alternation. Previously-active slot stays valid in Azure during the deploy window — zero downtime. Automated by \`rotate-genai-azure.sh\`." \
    || exit 1

push_prod_and_watch "$DEPLOY_WORKFLOW" || {
    error "Deploy workflow failed — previously-active Azure slot still valid, so no downtime, but resolve before re-running."
    exit 1
}

#######################################
# Health check (per-resource provider-specific)
#######################################
hc_chat_check() {
    local label=$1 expect=$2 payload=$3
    section "Health check ($label → expect '$expect')"
    local body err provider mdl
    body=$(curl -sS --max-time 60 \
        -X POST "$GEN_BASE/v1/chat/completions" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$payload")
    err=$(echo "$body" | jq -r '.error.message // ""')
    if [ -n "$err" ]; then
        error "[$label] Health check failed: $err"
        error "Body: $body"
        return 1
    fi
    provider=$(echo "$body" | jq -r '.provider // ""')
    mdl=$(echo "$body" | jq -r '.model // ""')
    if ! echo "$provider $mdl" | grep -qiE "$expect"; then
        error "[$label] Routing mismatch. provider='$provider' model='$mdl' (expected '$expect')."
        return 1
    fi
    log "[$label] OK: provider='$provider' model='$mdl'"
}

HC_FAILED=0
if [ "$TARGET" = "all" ] || [ "$TARGET" = "east" ]; then
    hc_chat_check "east" "$HEALTH_EXPECT_EAST" \
        "{\"model\":\"$HEALTH_MODEL_EAST\",\"messages\":[{\"role\":\"user\",\"content\":\"reply ok\"}],\"max_tokens\":10}" \
        || HC_FAILED=1
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "sweden" ]; then
    # Sweden hosts gpt-audio-mini — requires audio modality
    hc_chat_check "sweden" "$HEALTH_EXPECT_SWEDEN" \
        "{\"model\":\"$HEALTH_MODEL_SWEDEN\",\"modalities\":[\"text\",\"audio\"],\"audio\":{\"voice\":\"alloy\",\"format\":\"mp3\"},\"messages\":[{\"role\":\"user\",\"content\":\"say hi\"}],\"max_tokens\":10}" \
        || HC_FAILED=1
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "safety" ]; then
    section "Health check (safety: no public test endpoint)"
    warn "Azure Content Safety has no user-facing endpoint via gen.pollinations.ai."
    warn "Verify manually by submitting a moderated prompt that should be flagged,"
    warn "or by checking image.pollinations.ai logs for safety service calls."
fi

if [ "$HC_FAILED" -ne 0 ]; then
    error "One or more provider-specific health checks failed (Azure key1/key2 alternation"
    error "means the previous slot is still valid — no downtime, but resolve before next rotation)."
    exit 1
fi

#######################################
# Restore original branch
#######################################
git checkout "$ORIGINAL_BRANCH" 2>/dev/null || git checkout main

section "Azure Key Rotation Complete"
echo ""
log "Resources rotated: $TARGET"
log "Previously-active slot stays valid in Azure until next rotation replaces it."
echo ""
log "SOPS + production + gen worker now using the freshly-regenerated slot."
