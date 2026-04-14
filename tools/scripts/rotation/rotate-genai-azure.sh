#!/bin/bash
# Rotate Azure Cognitive Services / OpenAI API keys.
#
# Usage: ./rotate-genai-azure.sh [--dry-run] [--resource east|sweden|safety|all]
#
# Resources managed:
#   east   — AZURE_MYCELI_PROD_API_KEY          (text env.json)
#   sweden — AZURE_MYCELI_PROD_SWEDEN_API_KEY   (text + image env.json)
#   safety — AZURE_CONTENT_SAFETY_API_KEY        (image env.json)
#   all    — rotate all three (default)
#
# This script:
# 1. Reads the endpoint URL from SOPS to identify the Azure resource
# 2. Regenerates key1 via `az cognitiveservices account keys regenerate`
# 3. Updates the corresponding SOPS files
#
# Prerequisites:
# - az CLI authenticated (`az login`)
# - sops configured and working
# - jq installed
#
# After running, commit the SOPS changes and redeploy EC2 services.

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
        --resource) TARGET="$2"; shift 2 ;;
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

IMAGE_SOPS="$REPO_ROOT/image.pollinations.ai/secrets/env.json"
TEXT_SOPS="$REPO_ROOT/text.pollinations.ai/secrets/env.json"

FAILURES=()

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made"
fi

if $VERIFY_ONLY; then
    section "Verifying Azure CLI access"
    az account show --query '{name:name, id:id}' -o json && {
        log "Azure CLI authenticated"
        log "Listing Cognitive Services accounts..."
        az cognitiveservices account list --query '[].{name:name, location:location}' -o table 2>&1 && {
            log "Azure access verified"
            exit 0
        }
    } || {
        error "Azure CLI not authenticated. Run: az login"
        exit 1
    }
fi

# Extract resource name from Azure endpoint URL
# e.g. https://myceli-prod.openai.azure.com/ → myceli-prod
extract_resource_name() {
    echo "$1" | sed -E 's|https?://([^.]+)\..*|\1|'
}

# Find resource group for a Cognitive Services resource
find_resource_group() {
    local resource_name=$1
    az cognitiveservices account list --query "[?name=='$resource_name'].resourceGroup | [0]" -o tsv 2>/dev/null
}

# Regenerate key1 for a Cognitive Services resource and return the new key
regenerate_key() {
    local resource_name=$1
    local resource_group=$2
    az cognitiveservices account keys regenerate \
        --name "$resource_name" \
        --resource-group "$resource_group" \
        --key-name key1 \
        --query "key1" -o tsv 2>&1
}

# Update a SOPS key in a file
update_sops() {
    local file=$1
    local key=$2
    local value=$3
    local fname
    fname=$(basename "$(dirname "$(dirname "$file")")")/$(basename "$file")

    if [ ! -f "$file" ]; then
        warn "Skipping $fname — file not found"
        return 0
    fi

    if $DRY_RUN; then
        log "[dry-run] sops --set $key in $fname"
        return 0
    fi

    if sops --set "[\"$key\"] \"$value\"" "$file"; then
        log "  $key in $fname"
    else
        error "  $key in $fname"
        FAILURES+=("SOPS $key: $fname")
    fi
}

# Rotate one Azure resource
rotate_resource() {
    local label=$1
    local endpoint_key=$2      # SOPS key for the endpoint URL
    local api_key_name=$3      # SOPS key for the API key
    local sops_source=$4       # SOPS file to read endpoint from
    shift 4
    local sops_targets=("$@")  # SOPS files to write the new key into

    section "Rotating $label"

    # Read endpoint from SOPS
    local endpoint
    endpoint=$(sops -d "$sops_source" | jq -r ".$endpoint_key")
    if [ -z "$endpoint" ] || [ "$endpoint" = "null" ]; then
        error "Could not read $endpoint_key from SOPS"
        FAILURES+=("$label: missing endpoint")
        return 1
    fi
    log "Endpoint: $endpoint"

    # Extract resource name
    local resource_name
    resource_name=$(extract_resource_name "$endpoint")
    log "Resource: $resource_name"

    if $DRY_RUN; then
        log "[dry-run] Would regenerate key1 for $resource_name"
        for f in "${sops_targets[@]}"; do
            update_sops "$f" "$api_key_name" "dry-run-key"
        done
        return 0
    fi

    # Find resource group
    local resource_group
    resource_group=$(find_resource_group "$resource_name")
    if [ -z "$resource_group" ]; then
        error "Could not find resource group for $resource_name"
        error "Make sure you're logged in: az login"
        FAILURES+=("$label: resource group not found")
        return 1
    fi
    log "Resource group: $resource_group"

    # Regenerate key
    local new_key
    new_key=$(regenerate_key "$resource_name" "$resource_group")
    if [ -z "$new_key" ]; then
        error "Key regeneration failed for $resource_name"
        FAILURES+=("$label: regeneration failed")
        return 1
    fi
    log "New key: ${new_key:0:8}..."

    # Update SOPS files
    for f in "${sops_targets[@]}"; do
        update_sops "$f" "$api_key_name" "$new_key"
    done
}

#######################################
# Rotate requested resources
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

#######################################
# Summary
#######################################
section "Azure Key Rotation Summary"

echo ""
echo "Resources rotated: $TARGET"
echo ""
echo "SOPS files that may have changed:"
echo "  - text.pollinations.ai/secrets/env.json"
echo "  - image.pollinations.ai/secrets/env.json"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "All updates completed successfully!"
    echo ""
    log "Next steps:"
    echo "  1. Commit the SOPS file changes"
    echo "  2. Deploy EC2 services (image + text) to pick up new keys"
else
    error "The following updates failed:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
fi
