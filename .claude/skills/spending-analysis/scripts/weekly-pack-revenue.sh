#!/bin/bash
# Weekly pack revenue analysis from Polar
# Usage: ./weekly-pack-revenue.sh

set -e

# Check for required token
if [ -z "$POLAR_ACCESS_TOKEN" ]; then
    echo "Error: POLAR_ACCESS_TOKEN not set"
    echo "Run: export POLAR_ACCESS_TOKEN=\$(sops -d enter.pollinations.ai/secrets/prod.vars.json | jq -r '.POLAR_ACCESS_TOKEN')"
    exit 1
fi

# Pack product IDs
PACK_IDS=(
    "bcdde7f7-129e-4ec1-abc3-d4e0c852fa68"  # 5 pollen + 5 FREE
    "2cb5ca34-d505-450d-a1d4-94e3bb0c1f68"  # 50 pollen + 50 FREE
    "8164c20f-8429-437e-b1a2-616ae89f114e"  # 20 pollen + 20 FREE
    "cebeb680-4ac3-4f73-9ce7-6bc06a5f21e1"  # 10 pollen + 10 FREE
    "bf48ded2-19ca-4d28-bca9-a91fff2dd0a0"  # 50 pollen (pack)
    "679a9fd3-be30-4552-8b2e-f825103c42b7"  # 20 pollen (pack)
    "ca4cc8bc-694d-4710-8451-1dcb4979fbc7"  # 10 pollen (pack)
)

TMPFILE=$(mktemp)

echo "Fetching pack orders from Polar..."

for product_id in "${PACK_IDS[@]}"; do
    curl -sL "https://api.polar.sh/v1/orders?limit=500&product_id=$product_id" \
        -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" | \
        jq -c '.items[] | {date: .created_at[0:10], amount: .total_amount, product: .product.name}' >> "$TMPFILE"
done

echo ""
echo "=== WEEKLY PACK REVENUE ==="
echo ""

cat "$TMPFILE" | jq -s '
  def week_start: split("-") | .[0] as $y | .[1] as $m | .[2] as $d | 
    if ($d | tonumber) <= 7 then "\($y)-\($m)-01"
    elif ($d | tonumber) <= 14 then "\($y)-\($m)-08"
    elif ($d | tonumber) <= 21 then "\($y)-\($m)-15"
    else "\($y)-\($m)-22" end;
  group_by(.date | week_start) | 
  map({week: .[0].date | week_start, orders: length, revenue_usd: (map(.amount) | add / 100)}) | 
  sort_by(.week) | reverse | .[0:12]'

rm "$TMPFILE"
