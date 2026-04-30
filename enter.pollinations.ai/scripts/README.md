# Scripts

## Single User Update

Update one user's tier (used by GitHub Actions):

```bash
npx tsx src/tier-progression/shared/tier-update-user.ts update-tier --github-username "john" --tier flower
npx tsx src/tier-progression/shared/tier-update-user.ts check-user --github-username "john"
```

## Service Setup

Setup systemd services on new machine:

```bash
bash enter.pollinations.ai/scripts/setup-services.sh
```

Creates: `image-pollinations.service` (port 16384)

## Service Management

```bash
# Check status
sudo systemctl status image-pollinations.service

# View logs
sudo journalctl -u image-pollinations.service -f

# Restart
sudo systemctl restart image-pollinations.service

# Stop
sudo systemctl stop image-pollinations.service
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
sudo journalctl -u image-pollinations.service -n 50

# Verify pnpm can find packages
cd /path/to/pollinations/image.pollinations.ai
pnpm start
```
