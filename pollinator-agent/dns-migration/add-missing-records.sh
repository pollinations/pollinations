#!/bin/bash
ZONE_ID="0942247b74a58e4fc5ea70341a3754a3"
API_TOKEN="kVM8YeEZjCPYFeGEEDn5BvWZ4ibg391FSheLD-Il"

echo "=== Adding CRITICAL MX Records (Email) ==="

# MX records with priorities
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"MX","name":"pollinations.ai","content":"ASPMX.L.GOOGLE.COM","priority":1,"ttl":3600}'

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"MX","name":"pollinations.ai","content":"ALT1.ASPMX.L.GOOGLE.COM","priority":5,"ttl":3600}'

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"MX","name":"pollinations.ai","content":"ALT2.ASPMX.L.GOOGLE.COM","priority":5,"ttl":3600}'

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"MX","name":"pollinations.ai","content":"ALT3.ASPMX.L.GOOGLE.COM","priority":10,"ttl":3600}'

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"MX","name":"pollinations.ai","content":"ALT4.ASPMX.L.GOOGLE.COM","priority":10,"ttl":3600}'

echo ""
echo "=== Adding SPF Record ==="
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"pollinations.ai","content":"v=spf1 include:spf.improvmx.com ~all","ttl":30}'

echo ""
echo "Done! Check results above for any errors."
