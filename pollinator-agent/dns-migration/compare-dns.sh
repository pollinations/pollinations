#!/bin/bash
ZONE_ID="0942247b74a58e4fc5ea70341a3754a3"
API_TOKEN="kVM8YeEZjCPYFeGEEDn5BvWZ4ibg391FSheLD-Il"

echo "=== Fetching all Cloudflare DNS records ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?per_page=100" \
  -H "Authorization: Bearer $API_TOKEN" | \
  jq -r '.result[] | "\(.type)\t\(.name)\t\(.content)"' | sort > cloudflare-current.txt

echo "Saved to cloudflare-current.txt"
echo ""
echo "=== Parsing Netlify CSV ==="

# Parse CSV and convert to comparable format
tail -n +2 netlify-dns-export.csv | while IFS=, read -r name ttl type value; do
  # Remove quotes
  name=$(echo $name | tr -d '"')
  type=$(echo $type | tr -d '"')
  value=$(echo $value | tr -d '"')
  
  # Skip NETLIFY and NETLIFYv6 types (these are Netlify-specific)
  if [[ "$type" == "NETLIFY" || "$type" == "NETLIFYv6" ]]; then
    continue
  fi
  
  echo -e "$type\t$name\t$value"
done | sort > netlify-parsed.txt

echo "Saved to netlify-parsed.txt"
echo ""
echo "=== Records in Netlify but NOT in Cloudflare ==="
comm -23 netlify-parsed.txt cloudflare-current.txt

echo ""
echo "=== Summary ==="
echo "Netlify records (excluding NETLIFY types): $(wc -l < netlify-parsed.txt)"
echo "Cloudflare records: $(wc -l < cloudflare-current.txt)"
