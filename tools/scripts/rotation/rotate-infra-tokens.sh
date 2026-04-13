#!/bin/bash
# Orchestrator: rotate all internal auth tokens in one pass.
#
# Usage: ./rotate-infra-tokens.sh [--dry-run] [--commit-pr]
#
# Generates fresh PLN_ENTER_TOKEN + PLN_GPU_TOKEN, calls the
# per-token scripts to fan out, health-checks production, and optionally
# opens a PR with the SOPS diffs.
#
# Prerequisites:
# - sops configured (SOPS_AGE_KEY available)
# - gh CLI authenticated
# - wrangler CLI authenticated (for enter token)
# - SSH access to GPU workers (for image-to-gpu token)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

DRY_RUN=false
COMMIT_PR=false

while [[ "${1:-}" == --* ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --commit-pr) COMMIT_PR=true; shift ;;
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

FAILURES=()

#######################################
# Generate tokens
#######################################
section "Generating new tokens"

ENTER_TOKEN=$(openssl rand -hex 32)
BACKEND_TOKEN=$(openssl rand -hex 32)

log "PLN_ENTER_TOKEN:          ${ENTER_TOKEN:0:8}...${ENTER_TOKEN: -4}"
log "PLN_GPU_TOKEN:  ${BACKEND_TOKEN:0:8}...${BACKEND_TOKEN: -4}"

if $DRY_RUN; then
    warn "DRY RUN — no changes will be made"
fi

#######################################
# Rotate PLN_ENTER_TOKEN
#######################################
section "Rotating PLN_ENTER_TOKEN (enter → EC2)"

FLAGS=""
if $DRY_RUN; then FLAGS="--dry-run"; fi

if "$SCRIPT_DIR/rotate-pln-enter-token.sh" $FLAGS "$ENTER_TOKEN"; then
    log "✅ PLN_ENTER_TOKEN rotation completed"
else
    error "❌ PLN_ENTER_TOKEN rotation failed"
    FAILURES+=("PLN_ENTER_TOKEN")
fi

#######################################
# Rotate PLN_GPU_TOKEN
#######################################
section "Rotating PLN_GPU_TOKEN (EC2 → GPU workers)"

if "$SCRIPT_DIR/rotate-pln-gpu-token.sh" $FLAGS "$BACKEND_TOKEN"; then
    log "✅ PLN_GPU_TOKEN rotation completed"
else
    error "❌ PLN_GPU_TOKEN rotation failed"
    FAILURES+=("PLN_GPU_TOKEN")
fi

#######################################
# Health checks
#######################################
if ! $DRY_RUN && [ ${#FAILURES[@]} -eq 0 ]; then
    section "Post-rotation health checks"

    HEALTH_OK=true
    MAX_ATTEMPTS=6
    SLEEP_SECONDS=10

    for attempt in $(seq 1 $MAX_ATTEMPTS); do
        log "Health check attempt $attempt/$MAX_ATTEMPTS..."

        # Check models endpoint
        MODELS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "https://gen.pollinations.ai/v1/models" 2>/dev/null || echo "000")

        # Check image generation
        IMAGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "https://gen.pollinations.ai/image/health-check-rotation-test?width=64&height=64&nologo=true&model=turbo" 2>/dev/null || echo "000")

        if [ "$MODELS_STATUS" = "200" ] && [[ "$IMAGE_STATUS" =~ ^(200|302)$ ]]; then
            log "✅ Health checks passed (models: $MODELS_STATUS, image: $IMAGE_STATUS)"
            HEALTH_OK=true
            break
        else
            warn "Attempt $attempt: models=$MODELS_STATUS, image=$IMAGE_STATUS"
            HEALTH_OK=false
            if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
                sleep $SLEEP_SECONDS
            fi
        fi
    done

    if ! $HEALTH_OK; then
        error "❌ Health checks failed after $MAX_ATTEMPTS attempts"
        error "Production may be down — investigate immediately"
        FAILURES+=("health-check")
    fi
fi

#######################################
# Commit + PR (if requested)
#######################################
if $COMMIT_PR && ! $DRY_RUN && [ ${#FAILURES[@]} -eq 0 ]; then
    section "Creating rotation PR"

    DATE=$(date -u +%Y-%m-%d)
    BRANCH="chore/token-rotation-$DATE"

    cd "$REPO_ROOT"

    # Check if there are SOPS changes to commit
    if git diff --quiet -- '*.vars.json' '*/secrets/*.json'; then
        log "No SOPS file changes to commit — tokens may not have changed"
    else
        git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
        git add -A -- '*.vars.json' '*/secrets/*.json'
        git commit -m "chore: rotate internal auth tokens $DATE"
        git push -u origin "$BRANCH"

        gh pr create \
            --title "chore: rotate internal auth tokens $DATE" \
            --body "Automated rotation of PLN_ENTER_TOKEN and PLN_GPU_TOKEN. Health checks passed." \
            --base main

        log "✅ PR created on branch $BRANCH"
    fi
fi

#######################################
# Summary
#######################################
section "Rotation Summary"

echo ""
log "PLN_ENTER_TOKEN:          ${ENTER_TOKEN:0:8}...${ENTER_TOKEN: -4}"
log "PLN_GPU_TOKEN:  ${BACKEND_TOKEN:0:8}...${BACKEND_TOKEN: -4}"
echo ""

if [ ${#FAILURES[@]} -eq 0 ]; then
    log "✅ All rotations completed successfully!"
    if ! $COMMIT_PR && ! $DRY_RUN; then
        echo ""
        log "Next steps:"
        echo "  1. Commit SOPS file changes"
        echo "  2. Deploy EC2 services (CI handles on merge)"
        echo ""
        log "Or re-run with --commit-pr to automate this."
    fi
else
    error "❌ Failures:"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure"
    done
    exit 1
fi
