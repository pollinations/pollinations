#!/bin/bash

# Add missing Netlify CNAME records to Cloudflare DNS
# This allows DNS migration while keeping sites hosted on Netlify

set -e

# Load environment variables
source .env

ZONE_ID="0942247b74a58e4fc5ea70341a3754a3"

echo "🔧 Adding Netlify CNAME records to Cloudflare DNS..."
echo ""

# Function to add CNAME record
add_cname() {
    local name=$1
    local target=$2
    
    echo "Adding: $name → $target"
    
    curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"CNAME\",
            \"name\": \"$name\",
            \"content\": \"$target\",
            \"ttl\": 1,
            \"proxied\": false
        }" | jq -r '.success, .errors[]?.message'
    
    echo ""
}

# Main site (IMPORTANT: This replaces the incorrect A records)
echo "📌 Main site:"
add_cname "pollinations.ai" "pollinations.netlify.app"
add_cname "www" "pollinations.netlify.app"

# Netlify subdomains
echo "📌 Netlify subdomains:"
add_cname "dashboard" "glittery-bombolone-af5d34.netlify.app"
add_cname "dreamachine" "jazzy-sopapillas-f1434b.netlify.app"
add_cname "haustierhoroskop" "haustierhoroskop.netlify.app"
add_cname "legaltranslate" "dapper-pegasus-db8a79.netlify.app"
add_cname "react-hooks" "pollinations-react-hooks-docs.netlify.app"
add_cname "studio1111" "studio1111.netlify.app"
add_cname "diy" "pollinations-diy.netlify.app"

echo "✅ Done! Netlify CNAME records added."
echo ""
echo "⚠️  IMPORTANT: You need to DELETE the incorrect A records for pollinations.ai"
echo "   (103.169.142.0, 54.215.62.21, 13.52.115.166)"
echo ""
echo "Next steps:"
echo "1. Delete the A records for pollinations.ai in Cloudflare dashboard"
echo "2. Verify all CNAMEs are correct"
echo "3. Activate Cloudflare zone to get nameservers"
echo "4. Update nameservers at domain registrar"
