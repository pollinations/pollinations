#!/bin/bash
# Compare tiers between Enter (staging) and Auth (production) databases
#
# Usage: bash enter.pollinations.ai/scripts/check-polar-tiers.sh

set -e

# Cloudflare account ID must be loaded from .encrypted.env (via nix develop)
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "❌ Error: CLOUDFLARE_ACCOUNT_ID environment variable is not set" >&2
    echo "   Run this script inside 'nix develop' to load encrypted environment variables" >&2
    exit 1
fi

echo "🔍 Comparing tiers: Enter (staging) vs Auth (production)"
echo "=" | tr '=' '=' | head -c 80 && echo
echo


# Get ALL users from Enter staging
echo "📊 Fetching all users from Enter staging..." >&2

# Save to temp files for processing
temp_file=$(mktemp)
temp_json=$(mktemp)
temp_auth=$(mktemp)

# Capture output from Enter DB (include github_id for Auth lookup)
echo "   Running wrangler query..." >&2

if ! npx wrangler d1 execute DB --remote --env staging --json \
    --command "SELECT id, github_username, email, tier, github_id FROM user ORDER BY github_username;" \
    > "$temp_json" 2>&1; then
    echo "❌ Failed to query Enter database" >&2
    cat "$temp_json" >&2
    rm -f "$temp_json"
    exit 1
fi

echo "   Parsing results..." >&2

# Extract Enter DB data
if ! grep -A 999999 '^\[' "$temp_json" | jq -r '.[0].results[]? | "\(.id)|\(.github_username)|\(.email)|\(.tier // "seed")|\(.github_id // "NULL")"' > "$temp_file"; then
    echo "❌ Failed to parse Enter DB results" >&2
    cat "$temp_json" >&2
    rm -f "$temp_json" "$temp_file"
    exit 1
fi

rm -f "$temp_json"

# Fetch Auth DB tiers (production pollinations.ai)
echo "📊 Fetching tiers from Auth DB (pollinations.ai)..." >&2

# Get the script directory to find auth.pollinations.ai
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTH_DIR="$(cd "$SCRIPT_DIR/../../auth.pollinations.ai" && pwd)"

if [ ! -d "$AUTH_DIR" ]; then
    echo "❌ Could not find auth.pollinations.ai directory at: $AUTH_DIR" >&2
    echo "   Expected structure: pollinations/auth.pollinations.ai/" >&2
    rm -f "$temp_file"
    exit 1
fi

(cd "$AUTH_DIR" && npx wrangler d1 execute DB --remote --json \
    --command "SELECT user_id, tier FROM user_tiers;" \
    > "$temp_auth" 2>&1)

# Parse Auth DB tiers
grep -A 999999 '^\[' "$temp_auth" | jq -r '.[0].results[]? | "\(.user_id)|\(.tier // "NULL")"' > "${temp_auth}.parsed"
rm -f "$temp_auth"

# Count users
user_count=$(wc -l < "$temp_file" | tr -d ' ')
echo "Found $user_count total users" >&2
echo >&2

# Print markdown table header  
echo "| Email | Auth Tier | Enter Tier |"
echo "|-------|-----------|------------|"

# Temp files for summary
temp_mismatches=$(mktemp)
temp_updates=$(mktemp)

# Process each user
count=0
echo "🔄 Processing users..." >&2
echo >&2

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
    
    # Check if tiers match
    if [ "$enter_tier" = "$auth_tier_compare" ]; then
        match="✅"
        echo "   [$count/$user_count] ✅ $username: Enter=$enter_tier, Auth=$auth_tier (match)" >&2
    else
        # Skip if Auth tier is NULL (no tier in old system)
        if [ "$auth_tier" = "NULL" ]; then
            echo "   [$count/$user_count] ⏭️  $username: Enter=$enter_tier, Auth=$auth_tier (skipped - no auth tier)" >&2
        else
            match="❌"
            echo "   [$count/$user_count] ❌ $username: Enter=$enter_tier, Auth=$auth_tier (MISMATCH)" >&2
            echo "- **$username**: Enter=\`$enter_tier\`, Auth=\`$auth_tier\`" >> "$temp_mismatches"
            # Store update info: email|auth_tier|username
            echo "$email|$auth_tier|$username" >> "$temp_updates"
            # Only output table row for mismatches where auth has a tier
            printf "| %-40s | %-9s | %-10s |\n" "${email:0:40}" "$auth_tier" "$enter_tier"
        fi
    fi
done < "$temp_file"

# Print summary
echo ""
echo "## Summary"
echo ""

# Tier mismatches
echo "### Tier Mismatches Between Enter and Auth"
if [ -s "$temp_mismatches" ]; then
    cat "$temp_mismatches"
    mismatch_count=$(wc -l < "$temp_mismatches" | tr -d ' ')
    echo ""
    echo "**Total mismatches:** $mismatch_count out of $count users"
else
    echo "✅ All tiers match between Enter and Auth"
fi

# Update mismatched tiers
if [ -s "$temp_updates" ]; then
    echo ""
    echo "## Updating Enter Tiers to Match Auth"
    echo ""
    
    update_count=0
    while IFS='|' read -r email auth_tier username; do
        update_count=$((update_count + 1))
        echo "🔄 [$update_count] Updating $username: $email -> tier=$auth_tier" >&2
        
        # Update the Enter database
        if npx wrangler d1 execute DB --remote --env staging \
            --command "UPDATE user SET tier='$auth_tier' WHERE email='$email';" \
            > /dev/null 2>&1; then
            echo "   ✅ Successfully updated $username to tier=$auth_tier" >&2
        else
            echo "   ❌ Failed to update $username" >&2
        fi
    done < "$temp_updates"
    
    echo ""
    echo "✅ Updated $update_count users" >&2
else
    echo ""
    echo "✅ No updates needed - all tiers are aligned" >&2
fi

# Cleanup
rm -f "$temp_file" "${temp_auth}.parsed" "$temp_mismatches" "$temp_updates"

echo >&2
echo "✅ Checked $count users" >&2
