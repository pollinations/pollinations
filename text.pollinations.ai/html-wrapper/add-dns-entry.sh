#!/bin/bash

# This script adds a DNS entry for websim.pollinations.ai to point to your Cloudflare Worker

# Replace these variables with your actual values
CLOUDFLARE_EMAIL="your-email@example.com"
CLOUDFLARE_API_KEY="your-api-key"
ZONE_ID="your-zone-id-for-pollinations.ai"

# Add DNS record for websim.pollinations.ai
echo "Adding DNS record for websim.pollinations.ai..."
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
     -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
     -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
     -H "Content-Type: application/json" \
     --data '{"type":"CNAME","name":"websim","content":"workers.dev","ttl":1,"proxied":true}'

echo "DNS record added. Now you can deploy your worker with:"
echo "wrangler deploy worker.js"
