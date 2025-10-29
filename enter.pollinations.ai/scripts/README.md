# Service Setup Scripts

## Quick Start: Setup Services on New Machine

```bash
cd /path/to/pollinations
bash enter.pollinations.ai/scripts/setup-services.sh
```

Or specify a custom repo path:

```bash
bash enter.pollinations.ai/scripts/setup-services.sh /custom/path/to/pollinations
```

## What It Does

1. Checks for Node.js v20 (installs if missing)
2. Checks for pnpm (installs if missing)
3. Installs dependencies for both services
4. Creates systemd service files
5. Enables and starts services
6. Verifies both services are running

## Services Created

- **text-pollinations.service** → port 16385
- **image-pollinations.service** → port 16384

Both auto-restart on failure and auto-start on reboot.

## Service Management

```bash
# Check status
sudo systemctl status text-pollinations.service image-pollinations.service

# View logs
sudo journalctl -u text-pollinations.service -f
sudo journalctl -u image-pollinations.service -f

# Restart
sudo systemctl restart text-pollinations.service image-pollinations.service

# Stop
sudo systemctl stop text-pollinations.service image-pollinations.service
```

## Requirements

- Ubuntu/Debian-based system
- sudo access
- ~2GB disk space for dependencies
- Internet connection (for npm packages)

## Troubleshooting

If services fail to start:

```bash
# Check logs
sudo journalctl -u text-pollinations.service -n 50
sudo journalctl -u image-pollinations.service -n 50

# Verify pnpm can find packages
cd /path/to/pollinations/text.pollinations.ai
pnpm list

# Manually test startup
cd /path/to/pollinations/text.pollinations.ai
pnpm start
```
