#!/bin/bash
# Analyze pack purchases by tier (weighted by user count)
# Usage: ./pack-purchases-by-tier.sh

set -e

# Check for required tokens
if [ -z "$POLAR_ACCESS_TOKEN" ]; then
    echo "Error: POLAR_ACCESS_TOKEN not set"
    echo "Run: export POLAR_ACCESS_TOKEN=\$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.POLAR_ACCESS_TOKEN')"
    exit 1
fi

if [ -z "$TINYBIRD_TOKEN" ]; then
    echo "Error: TINYBIRD_TOKEN not set"
    echo "Run: export TINYBIRD_TOKEN=\$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.TINYBIRD_ACCESS_TOKEN')"
    exit 1
fi

TMPDIR=$(mktemp -d)

# Pack product IDs
PACK_IDS=(
    "bcdde7f7-129e-4ec1-abc3-d4e0c852fa68"
    "2cb5ca34-d505-450d-a1d4-94e3bb0c1f68"
    "8164c20f-8429-437e-b1a2-616ae89f114e"
    "cebeb680-4ac3-4f73-9ce7-6bc06a5f21e1"
    "bf48ded2-19ca-4d28-bca9-a91fff2dd0a0"
    "679a9fd3-be30-4552-8b2e-f825103c42b7"
    "ca4cc8bc-694d-4710-8451-1dcb4979fbc7"
)

echo "Step 1: Fetching pack orders from Polar..."

for product_id in "${PACK_IDS[@]}"; do
    curl -sL "https://api.polar.sh/v1/orders?limit=500&product_id=$product_id" \
        -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" | \
        jq -c '.items[] | {external_id: .customer.external_id, amount: .total_amount}' >> "$TMPDIR/orders.json"
done

echo "Step 2: Aggregating purchasers..."

cat "$TMPDIR/orders.json" | jq -s '[.[] | select(.external_id != null) | {user_id: .external_id, amount: .amount}] | group_by(.user_id) | map({user_id: .[0].user_id, total_spent: (map(.amount) | add)})' > "$TMPDIR/purchasers.json"

echo "Step 3: Fetching user tiers from Tinybird..."

curl -sL "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
    -H "Authorization: Bearer $TINYBIRD_TOKEN" \
    --data-urlencode "q=SELECT user_id, argMax(user_tier, start_time) as current_tier FROM generation_event WHERE start_time >= now() - INTERVAL 60 DAY AND environment = 'production' AND user_id != 'undefined' GROUP BY user_id FORMAT JSONEachRow" \
    > "$TMPDIR/tiers.json"

echo "Step 4: Getting user count per tier..."

TIER_COUNTS=$(curl -sL "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
    -H "Authorization: Bearer $TINYBIRD_TOKEN" \
    --data-urlencode "q=SELECT argMax(user_tier, start_time) as tier, count() as user_count FROM generation_event WHERE start_time >= now() - INTERVAL 60 DAY AND environment = 'production' AND user_id != 'undefined' GROUP BY user_id FORMAT JSON" | \
    jq '.data | group_by(.tier) | map({tier: .[0].tier, users: length}) | from_entries')

echo "Step 5: Joining data..."

# Convert to TSV for joining
cat "$TMPDIR/purchasers.json" | jq -r '.[] | [.user_id, .total_spent] | @tsv' > "$TMPDIR/purchasers.tsv"
cat "$TMPDIR/tiers.json" | jq -r '[.user_id, .current_tier] | @tsv' > "$TMPDIR/tiers.tsv"

# Join
join -t$'\t' -1 1 -2 1 <(sort "$TMPDIR/purchasers.tsv") <(sort "$TMPDIR/tiers.tsv") > "$TMPDIR/joined.tsv"

echo ""
echo "=== PACK PURCHASES BY TIER ==="
echo ""
echo "Tier       | Revenue     | Purchasers | Total Users | % Who Buy | \$/User"
echo "-----------|-------------|------------|-------------|-----------|--------"

# Aggregate by tier
awk -F'\t' '{tier[$3]+=$2; count[$3]++} END {for(t in tier) print t, tier[t]/100, count[t]}' "$TMPDIR/joined.tsv" | \
while read tier revenue purchasers; do
    total_users=$(echo "$TIER_COUNTS" | jq -r ".[\"$tier\"] // 0")
    if [ "$total_users" -gt 0 ]; then
        pct=$(echo "scale=1; $purchasers * 100 / $total_users" | bc)
        per_user=$(echo "scale=2; $revenue / $total_users" | bc)
        printf "%-10s | \$%-10.2f | %-10d | %-11d | %5.1f%%    | \$%.2f\n" "$tier" "$revenue" "$purchasers" "$total_users" "$pct" "$per_user"
    fi
done | sort -t'$' -k6 -rn

rm -rf "$TMPDIR"
