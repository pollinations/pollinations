#!/bin/bash
# Check Polar subscriptions for all Enter users and compare with DB tiers
#
# Usage: 
# 1. Enter the nix develop shell (from pollinations root): nix develop
# 2. Then run: bash enter.pollinations.ai/scripts/check-polar-tiers.sh

set -e

POLAR_SERVER="sandbox"  # or "production"
POLAR_API="https://sandbox-api.polar.sh"  # sandbox API

# Product ID mappings (from wrangler.toml staging - V2 NEW)
PRODUCT_ID_SEED="82ee54e1-5b69-447b-82aa-3c76bccae193"
PRODUCT_ID_FLOWER="2bfbe9e0-8395-489f-a7a1-6821d835cc08"
PRODUCT_ID_NECTAR="d67b2a25-c4d7-47fa-9d64-4b2a27f0908f"

# Check if POLAR_ACCESS_TOKEN is available (from nix develop)
if [ -z "$POLAR_ACCESS_TOKEN" ]; then
    echo "❌ POLAR_ACCESS_TOKEN environment variable is required"
    echo ""
    echo "Please run from within 'nix develop' shell:"
    echo "  cd /Users/comsom/Github/pollinations"
    echo "  nix develop"
    echo "  cd enter.pollinations.ai"
    echo "  bash scripts/check-polar-tiers.sh"
    exit 1
fi

POLAR_TOKEN="$POLAR_ACCESS_TOKEN"

echo "🔍 Checking Polar subscriptions for Enter users"
echo "Server: $POLAR_SERVER"
echo "=" | tr '=' '=' | head -c 80 && echo
echo

# Function to get tier name from product ID
get_tier_name() {
    local product_id="$1"
    case "$product_id" in
        "$PRODUCT_ID_SEED") echo "seed" ;;
        "$PRODUCT_ID_FLOWER") echo "flower" ;;
        "$PRODUCT_ID_NECTAR") echo "nectar" ;;
        *) echo "unknown" ;;
    esac
}

# Function to check Polar subscription for a user
check_polar_sub() {
    local user_id="$1"
    local username="$2"
    local db_tier="$3"
    
    # Query Polar API for customer state
    local response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $POLAR_TOKEN" \
        "$POLAR_API/v1/customers/external/$user_id/state" \
        2>/dev/null)
    
    local http_code=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        # Parse JSON to get active subscriptions (using jq if available, otherwise grep)
        if command -v jq &> /dev/null; then
            local product_ids=$(echo "$body" | jq -r '.active_subscriptions[]?.product_id // empty' 2>/dev/null)
            local pollen_balance=$(echo "$body" | jq -r '.active_meters[0]?.balance // 0' 2>/dev/null)
            
            if [ -n "$product_ids" ]; then
                local first_product_id=$(echo "$product_ids" | head -n1)
                local polar_tier=$(get_tier_name "$first_product_id")
                
                if [ "$db_tier" = "$polar_tier" ]; then
                    echo "✅ $username: DB=$db_tier, Polar=$polar_tier, Balance=$pollen_balance"
                else
                    echo "⚠️  $username: DB=$db_tier, Polar=$polar_tier (MISMATCH!), Balance=$pollen_balance"
                fi
            else
                echo "⚠️  $username: DB=$db_tier, Polar=none (no active subscription)"
            fi
        else
            # Fallback without jq
            if echo "$body" | grep -q "active_subscriptions"; then
                echo "📊 $username: DB=$db_tier, Polar=<needs jq to parse>"
            else
                echo "⚠️  $username: DB=$db_tier, Polar=none (no active subscription)"
            fi
        fi
    elif [ "$http_code" = "404" ]; then
        echo "⚠️  $username: DB=$db_tier, Polar=not found (user not in Polar)"
    else
        echo "❌ $username: DB=$db_tier, Polar API error (HTTP $http_code)"
    fi
}

# Get ALL users from Enter staging
echo "📊 Fetching all users from Enter staging..." >&2
echo >&2

# Save to temp files for processing
temp_file=$(mktemp)
temp_json=$(mktemp)
temp_auth=$(mktemp)

# Capture output from Enter DB (include github_id for Auth lookup)
npx wrangler d1 execute DB --remote --env staging --json \
    --command "SELECT id, github_username, email, tier, github_id FROM user ORDER BY github_username;" \
    2>&1 > "$temp_json"

# Extract Enter DB data
grep -A 999999 '^\[' "$temp_json" | jq -r '.[0].results[]? | "\(.id)|\(.github_username)|\(.email)|\(.tier // "seed")|\(.github_id // "NULL")"' > "$temp_file"

rm -f "$temp_json"

# Fetch Auth DB tiers (production pollinations.ai)
echo "📊 Fetching tiers from Auth DB (pollinations.ai)..." >&2
cd /Users/comsom/Github/pollinations/auth.pollinations.ai
npx wrangler d1 execute DB --remote --json \
    --command "SELECT user_id, tier FROM user_tiers;" \
    2>&1 > "$temp_auth"
cd - > /dev/null

# Parse Auth DB tiers
grep -A 999999 '^\[' "$temp_auth" | jq -r '.[0].results[]? | "\(.user_id)|\(.tier // "NULL")"' > "${temp_auth}.parsed"
rm -f "$temp_auth"

# Count users
user_count=$(wc -l < "$temp_file" | tr -d ' ')
echo "Found $user_count total users" >&2
echo >&2

# Print markdown table header  
echo "| GitHub Username | Email | Enter Tier | Auth Tier | Polar Sub |"
echo "|-----------------|-------|------------|-----------|-----------|"

# Temp files for summary
temp_no_polar=$(mktemp)
temp_auth_mismatch=$(mktemp)
temp_polar_mismatch=$(mktemp)

# Process each user
count=0
while IFS='|' read -r id username email enter_tier github_id; do
    if [ -z "$id" ]; then
        continue
    fi
    
    count=$((count + 1))
    
    # Get Auth tier for this user (by github_id)
    auth_tier="NULL"
    if [ "$github_id" != "NULL" ] && [ -n "$github_id" ]; then
        auth_tier=$(grep "^${github_id}|" "${temp_auth}.parsed" | cut -d'|' -f2)
        [ -z "$auth_tier" ] && auth_tier="NULL"
    fi
    
    # Treat NULL as seed for comparison
    auth_tier_compare="$auth_tier"
    [ "$auth_tier_compare" = "NULL" ] && auth_tier_compare="seed"
    
    # Query Polar API for customer state
    response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $POLAR_TOKEN" \
        "$POLAR_API/v1/customers/external/$id/state" \
        2>/dev/null)
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    polar_tier="none"
    
    if [ "$http_code" = "200" ]; then
        if command -v jq &> /dev/null; then
            product_ids=$(echo "$body" | jq -r '.active_subscriptions[]?.product_id // empty' 2>/dev/null)
            
            if [ -n "$product_ids" ]; then
                first_product_id=$(echo "$product_ids" | head -n1)
                polar_tier=$(get_tier_name "$first_product_id")
            fi
        fi
    elif [ "$http_code" = "404" ]; then
        polar_tier="not_found"
    fi
    
    # Output markdown table row
    printf "| %-20s | %-30s | %-10s | %-9s | %-9s |\n" "$username" "${email:0:30}" "$enter_tier" "$auth_tier" "$polar_tier"
    
    # Track issues for summary
    if [ "$polar_tier" = "none" ] || [ "$polar_tier" = "not_found" ]; then
        echo "- **$username** (Enter: $enter_tier)" >> "$temp_no_polar"
    fi
    
    if [ "$enter_tier" != "$auth_tier_compare" ]; then
        echo "- **$username** (Enter: $enter_tier, Auth: $auth_tier)" >> "$temp_auth_mismatch"
    fi
    
    if [ "$polar_tier" != "none" ] && [ "$polar_tier" != "not_found" ] && [ "$enter_tier" != "$polar_tier" ]; then
        echo "- **$username** (Enter: $enter_tier, Auth: $auth_tier, Polar: $polar_tier)" >> "$temp_polar_mismatch"
    fi
    
    sleep 0.3  # Small delay to avoid rate limiting
done < "$temp_file"

# Print summary
echo ""
echo "## Summary"
echo ""

# No Polar subscription
echo "### Users Without Polar Subscriptions"
if [ -s "$temp_no_polar" ]; then
    cat "$temp_no_polar"
else
    echo "✅ All users have Polar subscriptions"
fi
echo ""

# Auth/Enter mismatch
echo "### Users with Auth/Enter Tier Mismatch"
if [ -s "$temp_auth_mismatch" ]; then
    cat "$temp_auth_mismatch"
else
    echo "✅ All Auth and Enter tiers match"
fi
echo ""

# Polar mismatch
echo "### Users with Polar Subscription Mismatch"
if [ -s "$temp_polar_mismatch" ]; then
    cat "$temp_polar_mismatch"
else
    echo "✅ All Polar subscriptions match Enter tiers"
fi

# Cleanup
rm -f "$temp_file" "${temp_auth}.parsed" "$temp_no_polar" "$temp_auth_mismatch" "$temp_polar_mismatch"

echo >&2
echo "✅ Checked $count users" >&2
