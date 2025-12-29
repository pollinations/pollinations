# Scripts

## Tier Sync (D1 ↔ Polar)

Sync subscription tiers between D1 (source of truth) and Polar.

```bash
cd enter.pollinations.ai

# 1. Fetch Polar data
POLAR_ACCESS_TOKEN=token npx tsx scripts/tier-sync/fetch-polar-data.ts

# 2. Compare with D1
npx tsx scripts/tier-sync/compare-tiers.ts

# 3. Apply fixes
POLAR_ACCESS_TOKEN=token npx tsx scripts/tier-sync/apply-fixes.ts

# 4. Cleanup duplicate subscriptions (if any found in step 1)
POLAR_ACCESS_TOKEN=token npx tsx scripts/tier-sync/cleanup-duplicates.ts
```

## Single User Update

Update one user's tier (used by GitHub Actions):

```bash
npx tsx scripts/tier-update-user.ts update-tier --github-username "john" --tier flower
npx tsx scripts/tier-update-user.ts check-user --github-username "john"
```

## Polar Setup

Create products, meters, benefits:

```bash
npx tsx scripts/manage-polar.ts --help
```

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
