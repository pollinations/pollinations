# Pollinations Enter-Services Systemd Configuration

This directory contains systemd service files for running the Pollinations text and image API services on the enter-services server.

## Services

- **text-pollinations.service** - Text API service (port 16385)
- **image-pollinations.service** - Image API service (port 16384)

## Installation

1. SSH into the enter-services server
2. Navigate to the repository:
   ```bash
   cd /home/ubuntu/pollinations
   ```

3. Run the installation script:
   ```bash
   cd operations/systemd
   ./install-services.sh
   ```

4. Start the services:
   ```bash
   sudo systemctl start text-pollinations.service image-pollinations.service
   ```

## Management

### Check service status
```bash
sudo systemctl status text-pollinations.service
sudo systemctl status image-pollinations.service
```

### View logs
```bash
# Follow logs in real-time
sudo journalctl -u text-pollinations.service -f
sudo journalctl -u image-pollinations.service -f

# View recent logs
sudo journalctl -u text-pollinations.service -n 100
sudo journalctl -u image-pollinations.service -n 100
```

### Restart services
```bash
sudo systemctl restart text-pollinations.service
sudo systemctl restart image-pollinations.service
```

### Stop services
```bash
sudo systemctl stop text-pollinations.service
sudo systemctl stop image-pollinations.service
```

## Automatic Deployment

The GitHub Actions workflow `.github/workflows/deploy-enter-services.yml` automatically:
1. Pulls latest code from the `staging` branch
2. Installs dependencies with `pnpm install`
3. Restarts both services

The services will automatically restart on failure and on system reboot.

## Configuration

Both services run as the `ubuntu` user and:
- Use `pnpm start` to run the application
- Log to systemd journal (viewable with `journalctl`)
- Automatically restart on failure (10 second delay)
- Start automatically on system boot

## Ports

- Text API: `16385`
- Image API: `16384`

These ports are proxied through the enter.pollinations.ai Cloudflare Worker.
