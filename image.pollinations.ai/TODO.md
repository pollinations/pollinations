# TODO: Automating the Cloudflare Stack for image.pollinations.ai

This document outlines how to fully automate the setup of the Cloudflare infrastructure for image.pollinations.ai using scripts and the Cloudflare API, eliminating the need for manual dashboard operations.

## Current Setup

Currently, our setup involves:
1. **Cloudflare Tunnel** - Set up via scripts
2. **Cloudflare Worker** - Deployed via Wrangler but with custom domain added manually
3. **Cloudflare R2 Bucket** - Created manually in the dashboard
4. **DNS Records** - Some created manually, some through the tunnel setup

## Automation Goals

The goal is to automate the entire setup process through scripts and API calls, following the "thin proxy" design principle of keeping things simple and focused on direct forwarding with minimal processing.

## Implementation Plan

### 1. Cloudflare Authentication Setup

Create a script to handle authentication and API token management:

```bash
#!/bin/bash
# setup-cloudflare-auth.sh

# Check for required environment variables
if [ -z "$CF_API_TOKEN" ]; then
    echo "Error: CF_API_TOKEN environment variable is not set"
    echo "Please create an API token with appropriate permissions at https://dash.cloudflare.com/profile/api-tokens"
    exit 1
fi

# Verify the token works
echo "Verifying Cloudflare API token..."
VERIFY_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json")

if echo "$VERIFY_RESPONSE" | grep -q '"success":true'; then
    echo "API token is valid"
else
    echo "API token verification failed"
    echo "$VERIFY_RESPONSE"
    exit 1
fi

# Save token for use in other scripts
echo "export CF_API_TOKEN=$CF_API_TOKEN" > ~/.cloudflare-credentials
echo "Cloudflare credentials saved to ~/.cloudflare-credentials"
```

### 2. R2 Bucket Creation

Script to create the R2 bucket:

```bash
#!/bin/bash
# setup-cloudflare-r2.sh

# Load credentials
source ~/.cloudflare-credentials

# Check for required parameters
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <account_id> <bucket_name>"
    exit 1
fi

ACCOUNT_ID=$1
BUCKET_NAME=$2

# Create R2 bucket
echo "Creating R2 bucket: $BUCKET_NAME"
CREATE_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET_NAME" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json")

if echo "$CREATE_RESPONSE" | grep -q '"success":true'; then
    echo "R2 bucket created successfully"
else
    echo "R2 bucket creation failed"
    echo "$CREATE_RESPONSE"
    exit 1
fi
```

### 3. Enhanced Cloudflare Tunnel Setup

Enhance the existing tunnel setup script to include the new hostname:

```bash
#!/bin/bash
# setup-cloudflare-tunnel.sh

# Check if script is run with required arguments
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <subdomain> <domain> <local_port>"
    echo "Example: $0 image-origin pollinations.ai 16384"
    exit 1
fi

SUBDOMAIN=$1
DOMAIN=$2
LOCAL_PORT=$3
HOSTNAME="${SUBDOMAIN}.${DOMAIN}"

# Install cloudflared if not present
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared.deb
    rm cloudflared.deb
fi

# Login to Cloudflare (this will open a browser)
echo "Please login to Cloudflare..."
cloudflared tunnel login

# Create new tunnel
echo "Creating tunnel..."
TUNNEL_NAME="${SUBDOMAIN}.${DOMAIN}"
TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" | grep -oP 'Created tunnel \K[a-f0-9-]+')
echo "Tunnel created with ID: $TUNNEL_ID"

# Create config file
echo "Creating config file..."
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOL
tunnel: ${TUNNEL_ID}
credentials-file: /home/ubuntu/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: ${HOSTNAME}
    service: http://localhost:${LOCAL_PORT}
  - service: http_status:404
EOL

# Create systemd service
echo "Creating systemd service..."
sudo bash -c "cat > /etc/systemd/system/cloudflared.service << EOL
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/cloudflared tunnel run ${TUNNEL_ID}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOL"

# Start and enable the service
echo "Starting cloudflared service..."
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Create DNS record using Cloudflare API
if [ -f ~/.cloudflare-credentials ]; then
    source ~/.cloudflare-credentials
    
    echo "Creating DNS record for ${HOSTNAME}..."
    # Get zone ID for the domain
    ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${DOMAIN}" \
         -H "Authorization: Bearer $CF_API_TOKEN" \
         -H "Content-Type: application/json")
    
    ZONE_ID=$(echo "$ZONE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$ZONE_ID" ]; then
        # Create CNAME record
        DNS_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
             -H "Authorization: Bearer $CF_API_TOKEN" \
             -H "Content-Type: application/json" \
             --data "{\"type\":\"CNAME\",\"name\":\"$SUBDOMAIN\",\"content\":\"${TUNNEL_ID}.cfargotunnel.com\",\"ttl\":1,\"proxied\":true}")
        
        if echo "$DNS_RESPONSE" | grep -q '"success":true'; then
            echo "DNS record created successfully"
        else
            echo "DNS record creation failed"
            echo "$DNS_RESPONSE"
        fi
    else
        echo "Could not find zone ID for domain: $DOMAIN"
    fi
else
    echo "Cloudflare credentials not found. DNS record must be created manually."
    echo "Create a CNAME record:"
    echo "   Name: ${SUBDOMAIN}"
    echo "   Target: ${TUNNEL_ID}.cfargotunnel.com"
    echo "   Proxy status: Proxied (Orange cloud)"
fi

echo "Setup complete!"
echo "Tunnel ID: ${TUNNEL_ID}"
```

### 4. Worker Deployment with Custom Domain

Script to deploy the worker and add a custom domain:

```bash
#!/bin/bash
# deploy-cloudflare-worker.sh

# Load credentials
source ~/.cloudflare-credentials

# Check for required parameters
if [ "$#" -ne 4 ]; then
    echo "Usage: $0 <account_id> <zone_id> <worker_name> <custom_domain>"
    echo "Example: $0 your_account_id your_zone_id pollinations-image-cache image.pollinations.ai"
    exit 1
fi

ACCOUNT_ID=$1
ZONE_ID=$2
WORKER_NAME=$3
CUSTOM_DOMAIN=$4

# Deploy the worker using wrangler
echo "Deploying worker: $WORKER_NAME"
cd cloudflare-cache
npm install
npx wrangler deploy

# Add custom domain to the worker
echo "Adding custom domain: $CUSTOM_DOMAIN to worker: $WORKER_NAME"
DOMAIN_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/domains" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data "{\"hostname\":\"$CUSTOM_DOMAIN\",\"service\":\"$WORKER_NAME\",\"zone_id\":\"$ZONE_ID\"}")

if echo "$DOMAIN_RESPONSE" | grep -q '"success":true'; then
    echo "Custom domain added successfully"
else
    echo "Custom domain addition failed"
    echo "$DOMAIN_RESPONSE"
    exit 1
fi
```

### 5. Master Setup Script

Create a master script that orchestrates the entire setup:

```bash
#!/bin/bash
# setup-cloudflare-stack.sh

# Check for required parameters
if [ "$#" -ne 5 ]; then
    echo "Usage: $0 <account_id> <zone_id> <worker_name> <bucket_name> <local_port>"
    echo "Example: $0 your_account_id your_zone_id pollinations-image-cache pollinations-images 16384"
    exit 1
fi

ACCOUNT_ID=$1
ZONE_ID=$2
WORKER_NAME=$3
BUCKET_NAME=$4
LOCAL_PORT=$5

# Setup authentication
./setup-cloudflare-auth.sh

# Create R2 bucket
./setup-cloudflare-r2.sh "$ACCOUNT_ID" "$BUCKET_NAME"

# Setup origin tunnel
./setup-cloudflare-tunnel.sh "image-origin" "pollinations.ai" "$LOCAL_PORT"

# Deploy worker with custom domain
./deploy-cloudflare-worker.sh "$ACCOUNT_ID" "$ZONE_ID" "$WORKER_NAME" "image.pollinations.ai"

echo "Cloudflare stack setup complete!"
echo "Worker: $WORKER_NAME is now accessible at image.pollinations.ai"
echo "Origin service is accessible at image-origin.pollinations.ai"
echo "R2 bucket: $BUCKET_NAME is configured for caching"
```

## Required Information

To run these scripts, you'll need:

1. **Cloudflare API Token** - With permissions for:
   - R2 Storage:Edit
   - Workers:Edit
   - DNS:Edit
   - Zone:Edit

2. **Account ID** - Found in the Cloudflare dashboard URL: `https://dash.cloudflare.com/<account_id>`

3. **Zone ID** - Found in the Overview tab of your domain in the Cloudflare dashboard

## Implementation Notes

1. **Security Considerations**:
   - API tokens should be stored securely
   - Consider using environment variables instead of files for credentials

2. **Error Handling**:
   - These scripts include basic error handling but should be enhanced for production use
   - Add idempotency to prevent duplicate resource creation

3. **Thin Proxy Principle**:
   - The worker implementation follows the "thin proxy" design principle
   - Minimal processing with direct forwarding
   - IP forwarding is maintained for rate limiting (1 request per 10 seconds per IP)

4. **Testing**:
   - Add verification steps to each script to confirm successful setup
   - Test the complete flow after setup

## Future Improvements

1. **Terraform Implementation**:
   - Consider migrating to Terraform for infrastructure as code
   - Cloudflare provider supports most of these resources

2. **CI/CD Integration**:
   - Add GitHub Actions workflows to automate deployment
   - Include automatic testing of the worker

3. **Monitoring Setup**:
   - Add scripts to set up Cloudflare Analytics
   - Configure alerting for errors or high traffic

4. **Backup and Disaster Recovery**:
   - Add scripts for R2 bucket backup
   - Document recovery procedures
