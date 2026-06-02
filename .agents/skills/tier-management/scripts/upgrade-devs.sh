#!/bin/bash
# Upgrade spore-tier users to seed if they have GitHub dev activity
# Usage: ./upgrade-devs.sh [usernames_file] [--dry-run]
# Example: ./upgrade-devs.sh /tmp/users.txt --dry-run
#
# Input file format: one GitHub username per line
# 
# Dev criteria (any ONE qualifies):
#   - Has public repos > 0
#   - Has followers > 0
#   - Account created before 2025

USERNAMES_FILE="${1:-}"
DRY_RUN=false

# Parse args
for arg in "$@"; do
    case $arg in
        --dry-run) DRY_RUN=true ;;
    esac
done

if [ -z "$USERNAMES_FILE" ] || [ ! -f "$USERNAMES_FILE" ]; then
    echo "Usage: $0 <usernames_file> [--dry-run]"
    echo ""
    echo "Generate input file with:"
    echo "  ./find-403-users.sh 24 10 spore | cut -f1 > /tmp/users.txt"
    exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
ENTER_DIR="$SCRIPT_DIR/../../../../enter.pollinations.ai"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[SKIP]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
highlight() { echo -e "${BLUE}[DEV]${NC} $1"; }

# Counters
declare -i upgraded=0
declare -i skipped_not_dev=0
declare -i skipped_not_spore=0
declare -i skipped_not_found=0
declare -i errors=0

# GitHub API rate limit: 60 requests/hour unauthenticated
# With 2s delay = 30 requests/min = safe margin
GITHUB_DELAY=2

log "Processing $(wc -l < "$USERNAMES_FILE" | tr -d ' ') users..."
[ "$DRY_RUN" = true ] && log "DRY RUN MODE - no changes will be made"

while IFS= read -r username || [ -n "$username" ]; do
    # Skip empty lines and comments
    [ -z "$username" ] && continue
    [[ "$username" == \#* ]] && continue
    
    echo ""
    echo "=== $username ==="
    
    # Check GitHub profile
    gh_response=$(curl -s "https://api.github.com/users/$username")
    
    # Check for errors (rate limit, not found)
    if echo "$gh_response" | grep -q '"message"'; then
        message=$(echo "$gh_response" | jq -r '.message')
        if [[ "$message" == *"rate limit"* ]]; then
            error "GitHub API rate limit hit. Wait and retry."
            break
        fi
        warn "$username - GitHub: $message"
        skipped_not_found+=1
        sleep "$GITHUB_DELAY"
        continue
    fi
    
    # Extract metrics
    public_repos=$(echo "$gh_response" | jq -r '.public_repos // 0')
    followers=$(echo "$gh_response" | jq -r '.followers // 0')
    created_at=$(echo "$gh_response" | jq -r '.created_at // "unknown"')
    year=$(echo "$created_at" | cut -c1-4)
    
    echo "  GitHub: repos=$public_repos, followers=$followers, created=$created_at"
    
    # Check if dev
    is_dev=false
    
    if [ "$public_repos" -gt 0 ] 2>/dev/null; then
        is_dev=true
        echo "  → Has $public_repos repos"
    fi
    
    if [ "$followers" -gt 0 ] 2>/dev/null; then
        is_dev=true
        echo "  → Has $followers followers"
    fi
    
    if [ "$year" -lt 2025 ] 2>/dev/null; then
        is_dev=true
        echo "  → Account from $year"
    fi
    
    if [ "$is_dev" = false ]; then
        warn "$username - Not a dev (0 repos, 0 followers, new account)"
        skipped_not_dev+=1
        sleep "$GITHUB_DELAY"
        continue
    fi
    
    highlight "$username - Dev detected!"
    
    # Check current tier in DB
    cd "$ENTER_DIR"
    tier_json=$(npx wrangler d1 execute DB --remote --env production --json \
        --command "SELECT tier FROM user WHERE LOWER(github_username) = LOWER('$username') LIMIT 1;" 2>/dev/null)
    current_tier=$(echo "$tier_json" | jq -r '.[0].results[0].tier // "unknown"')
    
    echo "  Current tier: $current_tier"
    
    # Only upgrade if currently spore
    if [ "$current_tier" != "spore" ]; then
        warn "$username - Already on $current_tier tier (not downgrading)"
        skipped_not_spore+=1
        sleep "$GITHUB_DELAY"
        continue
    fi
    
    # Upgrade to seed
    if [ "$DRY_RUN" = true ]; then
        log "Would upgrade $username: spore → seed"
    else
        log "Upgrading $username to seed..."
        if bash "$SCRIPT_DIR/update-tier.sh" "$username" seed; then
            log "✅ Upgraded $username: spore → seed"
            upgraded+=1
        else
            error "Failed to upgrade $username"
            errors+=1
        fi
    fi
    
    sleep "$GITHUB_DELAY"
    
done < "$USERNAMES_FILE"

echo ""
echo "========================================"
echo "Summary:"
echo "  ✅ Upgraded to seed: $upgraded"
echo "  ⏭️  Skipped (not dev): $skipped_not_dev"
echo "  ⏭️  Skipped (not spore): $skipped_not_spore"
echo "  ⏭️  Skipped (GH error): $skipped_not_found"
echo "  ❌ Errors: $errors"
echo "========================================"
