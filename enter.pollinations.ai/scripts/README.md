# Scripts

## Single User Update

Update one user's tier (used by GitHub Actions):

```bash
npx tsx scripts/tier-update-user.ts update-tier --github-username "john" --tier flower
npx tsx scripts/tier-update-user.ts check-user --github-username "john"
```

## Polar Pack Products (Fallback)

Manage Polar pack products (used as payment fallback if Stripe is down):

```bash
npx tsx scripts/manage-polar.ts --help
```

> **Note:** Tier management is handled via D1 database directly. Polar is only used for pack purchase webhooks.

## Service Setup

Setup systemd services on new machine:

```bash
bash enter.pollinations.ai/scripts/setup-services.sh
```

Creates: `text-pollinations.service` (port 16385), `image-pollinations.service` (port 16384)

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
