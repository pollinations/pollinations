#!/bin/bash
# Check current DNS records for pollinations.ai

ZONE_ID="0942247b74a58e4fc5ea70341a3754a3"
API_TOKEN="kVM8YeEZjCPYFeGEEDn5BvWZ4ibg391FSheLD-Il"

echo "=== Current A records for pollinations.ai ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=pollinations.ai" \
  -H "Authorization: Bearer $API_TOKEN" | jq -r '.result[] | "\(.id)\t\(.content)\t\(.comment // "no comment")"'

echo ""
echo "=== Current A records for www.pollinations.ai ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=www.pollinations.ai" \
  -H "Authorization: Bearer $API_TOKEN" | jq -r '.result[] | "\(.id)\t\(.content)\t\(.comment // "no comment")"'

echo ""
echo "=== Current AAAA records ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=AAAA" \
  -H "Authorization: Bearer $API_TOKEN" | jq -r '.result[] | "\(.name)\t\(.content)"'
