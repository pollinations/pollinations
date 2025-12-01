#!/bin/bash
# Batch evaluate users and track processed ones in a gist
# Usage: ./batch-evaluate.sh [--dry-run]

set -e
SCRIPT_DIR="$(dirname "$0")"
GIST_ID="${TIER_EVAL_GIST_ID:-}"  # Set this env var or it will create a new gist
PROCESSED_FILE="processed-users.json"
DRY_RUN=false

[[ "$1" == "--dry-run" ]] && DRY_RUN=true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Load or create processed users tracking
load_processed() {
    if [ -n "$GIST_ID" ]; then
        log "Loading processed users from gist $GIST_ID..."
        gh gist view "$GIST_ID" -f "$PROCESSED_FILE" 2>/dev/null || echo '{"processed":{}}'
    else
        echo '{"processed":{}}'
    fi
}

save_processed() {
    local data="$1"
    if [ -n "$GIST_ID" ]; then
        echo "$data" | gh gist edit "$GIST_ID" -f "$PROCESSED_FILE" -
        log "Saved to gist $GIST_ID"
    else
        # Create new gist
        log "Creating new gist to track processed users..."
        NEW_GIST=$(echo "$data" | gh gist create -f "$PROCESSED_FILE" -d "Pollinations tier evaluation tracking" -)
        GIST_ID=$(echo "$NEW_GIST" | grep -oE '[a-f0-9]{32}')
        warn "Created gist: $NEW_GIST"
        warn "Set TIER_EVAL_GIST_ID=$GIST_ID to reuse"
    fi
}

# Check if user was already processed
is_processed() {
    local username="$1"
    local data="$2"
    echo "$data" | jq -e ".processed[\"$username\"]" >/dev/null 2>&1
}

# Mark user as processed
mark_processed() {
    local username="$1"
    local tier="$2"
    local data="$3"
    echo "$data" | jq ".processed[\"$username\"] = {\"tier\": \"$tier\", \"date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
}

# Evaluate a single user
evaluate_user() {
    local username="$1"
    
    # Check Flower criteria
    local commits=$(gh api "search/commits?q=repo:pollinations/pollinations+author:$username" --jq '.total_count' 2>/dev/null || echo "0")
    if [ "$commits" -gt 0 ]; then
        echo "flower"
        return
    fi
    
    local in_projects=$(grep -ri "author.*$username" "$SCRIPT_DIR/../../../pollinations.ai/src/config/projects/" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$in_projects" -gt 0 ]; then
        echo "flower"
        return
    fi
    
    # Check Seed criteria
    local issues=$(gh api "search/issues?q=repo:pollinations/pollinations+involves:$username" --jq '.total_count' 2>/dev/null || echo "0")
    if [ "$issues" -gt 0 ]; then
        echo "seed"
        return
    fi
    
    # Check stargazers (use cached file)
    if [ -f "$SCRIPT_DIR/stargazers.txt" ]; then
        if grep -qi "^$username$" "$SCRIPT_DIR/stargazers.txt"; then
            echo "seed"
            return
        fi
    fi
    
    echo "spore"
}

# Main
log "Tier Batch Evaluator"
log "===================="

# Ensure stargazers cache exists
"$SCRIPT_DIR/fetch-stargazers.sh" >/dev/null

# Load tracking data
PROCESSED=$(load_processed)
log "Loaded $(echo "$PROCESSED" | jq '.processed | length') previously processed users"

# Get users to evaluate (spore and seed tier)
# This requires admin API access - for now, show usage
if [ -z "$ENTER_ADMIN_TOKEN" ]; then
    warn "ENTER_ADMIN_TOKEN not set"
    echo ""
    echo "To evaluate all users, set up admin access:"
    echo "  export ENTER_ADMIN_TOKEN=your_admin_token"
    echo "  export TIER_EVAL_GIST_ID=your_gist_id  # optional, to persist state"
    echo ""
    echo "Or evaluate a single user:"
    echo "  $0 --user <github_username>"
    exit 1
fi

# Example: fetch users from admin API
log "Fetching users with spore/seed tier..."
# USERS=$(curl -s "https://enter.pollinations.ai/api/admin/users?tier=spore,seed" \
#     -H "Authorization: Bearer $ENTER_ADMIN_TOKEN" | jq -r '.[].githubUsername')

# For now, just show the structure
echo ""
echo "To evaluate specific users manually:"
echo "  evaluate_user <username>  # returns: flower/seed/spore"
echo ""
echo "Example evaluation:"
evaluate_user "cemalgnlts"
