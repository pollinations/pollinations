# n8n Cloudflare Tunnel Setup

This directory contains scripts for setting up and managing a Cloudflare tunnel for the n8n service running on port 5678.

## Setup Instructions

1. Make sure n8n is running on port 5678
2. Run the setup script to create a new Cloudflare tunnel:

```bash
chmod +x setup-n8n-tunnel.sh
./setup-n8n-tunnel.sh
```

This script will:
- Create a new Cloudflare tunnel named "n8n-pollinations"
- Generate a configuration file at `/home/ubuntu/.cloudflared/config-n8n.yml`
- Create a systemd service file at `/etc/systemd/system/cloudflared-n8n.service`
- Set up DNS for `n8n.pollinations.ai` to point to your tunnel
- Enable and start the service

## Managing the Tunnel

### Check Status

To check the status of the tunnel:

```bash
chmod +x check-status.sh
./check-status.sh
```

### Manual Service Management

```bash
# Start the service
sudo systemctl start cloudflared-n8n.service

# Stop the service
sudo systemctl stop cloudflared-n8n.service

# Restart the service
sudo systemctl restart cloudflared-n8n.service

# View logs
sudo journalctl -u cloudflared-n8n.service -f
```

### Configuration

The tunnel configuration is stored in `/home/ubuntu/.cloudflared/config-n8n.yml`. If you need to modify the configuration, edit this file and restart the service.

## Troubleshooting

1. If you see connection errors, make sure n8n is running on port 5678
2. Check the logs for any errors: `sudo journalctl -u cloudflared-n8n.service -f`
3. Verify your Cloudflare account has the necessary permissions for tunnel creation

## Notes

- This tunnel is completely separate from other Cloudflare tunnels in the system
- The tunnel uses the hostname `n8n.pollinations.ai`
- Make sure your DNS records in Cloudflare are properly configured
