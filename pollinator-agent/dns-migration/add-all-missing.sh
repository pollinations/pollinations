#!/bin/bash
ZONE_ID="0942247b74a58e4fc5ea70341a3754a3"
API_TOKEN="kVM8YeEZjCPYFeGEEDn5BvWZ4ibg391FSheLD-Il"

echo "=== Adding ALL missing TXT records (verifications) ==="

# Google verifications
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"pollinations.ai","content":"google-site-verification=cylTmamq01lScLAsEa9zknPpSMLBQ9d6JM80qDnhOko","ttl":3600}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"pollinations.ai","content":"google-site-verification=fVDptxNL4zBBVB_v8kgW6dSt2MA09PvJyS4ufs4nrhw","ttl":86400}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"pollinations.ai","content":"google-site-verification=zzlOZ9VsEDSKSIyuoPChyKt0j_oWtl-mcPA3F0KODkc","ttl":3600}' | jq -c '{success, errors: .errors[0].message}'

# OpenAI verification
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"pollinations.ai","content":"openai-domain-verification=dv-Y9BjQID3gDsfk92Hu3noMMBX","ttl":3600}' | jq -c '{success, errors: .errors[0].message}'

# MS verification (2 records with different TTLs)
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"pollinations.ai","content":"MS=ms94829141","ttl":30}' | jq -c '{success, errors: .errors[0].message}'

# Cloudflare verification
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"cloudflare-verify.pollinations.ai","content":"768353596-1092212260","ttl":5}' | jq -c '{success, errors: .errors[0].message}'

# Vercel verifications
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"_vercel.pollinations.ai","content":"vc-domain-verify=sur.pollinations.ai,2b63e0a4ba60604ac6d8","ttl":30}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"TXT","name":"_vercel.pollinations.ai","content":"vc-domain-verify=sirius-cybernetics.pollinations.ai,fbc4558d6901b3d787af","ttl":30}' | jq -c '{success, errors: .errors[0].message}'

echo ""
echo "=== Adding ALL missing CNAME records ==="

# Critical service CNAMEs
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"legal-worker.pollinations.ai","content":"Legal-legal-V4SI8HEAYHH4-426484057.us-east-1.elb.amazonaws.com","ttl":30,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"rest.pollinations.ai","content":"rest-polle-1umfyh2pt9z21-620802432.us-east-1.elb.amazonaws.com","ttl":30,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"restv2.pollinations.ai","content":"rest-polle-7H3II6HN9KI-1706422637.us-east-1.elb.amazonaws.com","ttl":3600,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"worker-prod.pollinations.ai","content":"rest-polle-7H3II6HN9KI-1706422637.us-east-1.elb.amazonaws.com","ttl":3600,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"worker-dev.pollinations.ai","content":"polle-polle-PSCKWLG604W6-1467296237.us-east-1.elb.amazonaws.com","ttl":3600,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"chat.pollinations.ai","content":"d3cs6esxxl8mno.cloudfront.net","ttl":5,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"hybridspacelab.pollinations.ai","content":"d1z5rgzxhi08i9.cloudfront.net","ttl":30,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

# Vercel CNAMEs
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"react-docs.pollinations.ai","content":"cname.vercel-dns.com","ttl":30,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"sur.pollinations.ai","content":"cname.vercel-dns.com","ttl":30,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"sirius-cybernetics.pollinations.ai","content":"cname.vercel-dns.com","ttl":30,"proxied":false}' | jq -c '{success, errors: .errors[0].message}'

echo ""
echo "=== Done! ==="
