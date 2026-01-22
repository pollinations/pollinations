# Economics Dashboard Deployment

Production deployment for `economics.myceli.ai` using DigitalOcean + Cloudflare Tunnel.

## Architecture

```
Browser → economics.myceli.ai → Cloudflare Edge → Tunnel → Droplet:3000 (Grafana)
```

## Prerequisites

- DigitalOcean account
- Cloudflare account (Myceli.AI zone)
- Tinybird token (already configured in provisioning)

## Step 1: Create DigitalOcean Droplet

1. Go to [DigitalOcean](https://cloud.digitalocean.com/)
2. Create Droplet:
   - **Image**: Ubuntu 24.04 LTS
   - **Size**: Basic $6/mo (1GB RAM, 1 vCPU) - sufficient for Grafana
   - **Region**: Choose closest to your users (e.g., FRA1 for Europe)
   - **Authentication**: SSH key recommended
3. Note the Droplet IP address

## Step 2: Setup Droplet

SSH into the Droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

Install Docker:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

Clone the repository:

```bash
cd /opt
git clone https://github.com/pollinations/pollinations.git
cd pollinations/apps/economics-dashboard
```

## Step 3: Create Cloudflare Tunnel

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Select the Myceli.AI account
3. Navigate to **Networks → Tunnels**
4. Click **Create a tunnel**
5. Name it: `economics-dashboard`
6. Choose **Cloudflared** connector
7. Copy the tunnel token (starts with `eyJ...`)

Configure the tunnel route:

1. In the tunnel settings, go to **Public Hostname**
2. Add a public hostname:
   - **Subdomain**: `economics`
   - **Domain**: `myceli.ai`
   - **Service**: `http://grafana:3000`

## Step 4: Configure Environment

On the Droplet:

```bash
cd /opt/pollinations/apps/economics-dashboard

# Create .env file
cp .env.example .env

# Edit with your values
nano .env
```

Set these values:
- `GRAFANA_ADMIN_PASSWORD`: A secure password
- `CLOUDFLARE_TUNNEL_TOKEN`: The token from Step 3

## Step 5: Deploy

```bash
# Start the services
docker compose -f docker-compose.prod.yml up -d

# Check logs
docker compose -f docker-compose.prod.yml logs -f

# Verify containers are running
docker ps
```

## Step 6: Verify

1. Visit https://economics.myceli.ai
2. Login with admin credentials
3. Check that dashboards load correctly

## Updating

To update the dashboard after changes:

```bash
cd /opt/pollinations/apps/economics-dashboard
git pull origin main
docker compose -f docker-compose.prod.yml restart grafana
```

## Troubleshooting

### Tunnel not connecting

```bash
# Check cloudflared logs
docker compose -f docker-compose.prod.yml logs cloudflared
```

### Grafana not starting

```bash
# Check grafana logs
docker compose -f docker-compose.prod.yml logs grafana

# Check permissions on provisioning folder
ls -la provisioning/
```

### Reset Grafana admin password

```bash
docker compose -f docker-compose.prod.yml exec grafana grafana-cli admin reset-admin-password NEW_PASSWORD
```

## Security Notes

- Grafana runs behind Cloudflare Tunnel (no exposed ports)
- Consider enabling [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) for additional authentication
- The `.env` file contains secrets - never commit it to git
